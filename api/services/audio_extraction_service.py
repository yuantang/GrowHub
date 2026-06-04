import os
import shutil
import asyncio
import httpx
import logging
import ffmpeg
import subprocess
from pathlib import Path
from shutil import which
from typing import Optional
from sqlalchemy.future import select
from database.db_session import get_session
from database.growhub_models import GrowHubAudioExtraction

logger = logging.getLogger(__name__)

STATIC_DIR = Path("static/audio_extractions")
STATIC_DIR.mkdir(parents=True, exist_ok=True)

async def _download_video(url: str, output_path: str) -> bool:
    """Download video from URL"""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(output_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download video {url}: {e}")
        return False

def _extract_audio(video_path: str, audio_path: str) -> bool:
    """Extract audio from video using FFmpeg"""
    try:
        (
            ffmpeg
            .input(video_path)
            .output(audio_path, acodec='libmp3lame', q=4)
            .overwrite_output()
            .run(quiet=True)
        )
        return True
    except ffmpeg.Error as e:
        logger.error(f"FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}")
        return False

def _transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using faster-whisper"""
    from faster_whisper import WhisperModel
    # Use CPU int8 for efficiency on local machine
    model = WhisperModel("small", device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(audio_path, beam_size=5, language="zh")
    
    transcript = ""
    for segment in segments:
        transcript += f"[{segment.start:.2f}s - {segment.end:.2f}s] {segment.text}\n"
        
    return transcript

def _demucs_available() -> bool:
    return which("demucs") is not None


def _resolve_demucs_stem_dir(out_dir: str, audio_path: str) -> Optional[Path]:
    """Demucs 3/4 输出目录：out_dir/htdemucs/{stem}/"""
    base = Path(audio_path).stem
    root = Path(out_dir)
    for model in ("htdemucs", "htdemucs_ft", "mdx_extra"):
        candidate = root / model / base
        if candidate.is_dir():
            return candidate
    # 部分版本多一层同名目录
    for model in ("htdemucs",):
        candidate = root / model / base / base
        if candidate.is_dir():
            return candidate
    return None


def _pick_bgm_stem(stem_dir: Path) -> Optional[Path]:
    for name in ("accompaniment.wav", "no_vocals.wav", "other.wav", "no_vocal.wav"):
        p = stem_dir / name
        if p.exists():
            return p
    return None


def _separate_audio(audio_path: str, out_dir: str) -> dict:
    """Separate vocals and bgm using demucs (if installed)."""
    if not _demucs_available():
        logger.warning("demucs not found on PATH; skip stem separation")
        return {"vocals": None, "bgm": None, "demucs_skipped": True}

    cmd = [
        "demucs",
        "-n",
        "htdemucs",
        "--two-stems=vocals",
        "-o",
        out_dir,
        audio_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=600)
        stem_dir = _resolve_demucs_stem_dir(out_dir, audio_path)
        if not stem_dir:
            logger.error("Demucs finished but output folder not found under %s", out_dir)
            return {"vocals": None, "bgm": None}

        vocals_path = stem_dir / "vocals.wav"
        bgm_path = _pick_bgm_stem(stem_dir)
        return {
            "vocals": str(vocals_path) if vocals_path.exists() else None,
            "bgm": str(bgm_path) if bgm_path else None,
        }
    except subprocess.CalledProcessError as e:
        logger.error("Demucs error: %s", e.stderr or e)
        return {"vocals": None, "bgm": None}
    except subprocess.TimeoutExpired:
        logger.error("Demucs timed out")
        return {"vocals": None, "bgm": None}


def _fallback_bgm_from_original(audio_path: str, task_dir: Path) -> Optional[str]:
    """无 demucs 或分离失败时，用完整音轨作为 BGM（供合成视频使用）。"""
    try:
        src = Path(audio_path)
        if not src.exists() or src.stat().st_size < 1024:
            return None
        target = task_dir / "bgm.mp3"
        if src.suffix.lower() == ".mp3":
            shutil.copy2(src, target)
        else:
            (
                ffmpeg.input(str(src))
                .output(str(target), acodec="libmp3lame", q=4)
                .overwrite_output()
                .run(quiet=True)
            )
        return str(target) if target.exists() else None
    except Exception as exc:
        logger.warning("BGM fallback copy failed: %s", exc)
        return None

async def process_audio_extraction(extraction_id: int, bgm_only: bool = False):
    """Background task to process audio extraction.

    bgm_only=True 时跳过 Whisper 转写，仅下载视频→抽音轨→Demucs 伴奏，用于模版快速提取 BGM。
    """
    logger.info(f"Starting audio extraction for task {extraction_id}")
    
    async with get_session() as session:
        extraction = (await session.execute(
            select(GrowHubAudioExtraction).where(GrowHubAudioExtraction.id == extraction_id)
        )).scalar_one_or_none()
        
        if not extraction:
            logger.error(f"Extraction {extraction_id} not found")
            return
            
        try:
            # 1. Update status to downloading
            extraction.status = "downloading"
            await session.commit()
            
            task_dir = STATIC_DIR / str(extraction_id)
            task_dir.mkdir(parents=True, exist_ok=True)
            
            video_path = task_dir / "original.mp4"
            audio_path = task_dir / "original.mp3"
            
            # Download video
            if not await _download_video(extraction.video_url, str(video_path)):
                raise Exception("Failed to download video")
                
            # 2. Extract audio
            extraction.status = "extracting"
            await session.commit()
            
            # Run blocking ffmpeg in executor
            loop = asyncio.get_running_loop()
            if not await loop.run_in_executor(None, _extract_audio, str(video_path), str(audio_path)):
                raise Exception("Failed to extract audio from video")
                
            # Delete video to save space
            video_path.unlink(missing_ok=True)
            
            extraction.original_audio_path = f"/static/audio_extractions/{extraction_id}/original.mp3"
            
            # 3. Transcribe audio（模版仅要 BGM 时可跳过，省 30s+）
            if not bgm_only:
                extraction.status = "transcribing"
                await session.commit()
                transcript = await loop.run_in_executor(
                    None, _transcribe_audio, str(audio_path)
                )
                extraction.transcript_text = transcript
            
            # 4. Separate audio
            extraction.status = "separating"
            await session.commit()
            
            demucs_out_dir = task_dir / "demucs"
            demucs_result = await loop.run_in_executor(None, _separate_audio, str(audio_path), str(demucs_out_dir))
            
            if demucs_result.get("vocals"):
                # Move to task_dir and rename for cleaner URL
                vocal_target = task_dir / "vocals.wav"
                shutil.move(demucs_result["vocals"], vocal_target)
                extraction.vocals_local_path = f"/static/audio_extractions/{extraction_id}/vocals.wav"
                
            bgm_fallback = False
            if demucs_result.get("bgm"):
                src_bgm = Path(demucs_result["bgm"])
                bgm_target = task_dir / ("bgm.wav" if src_bgm.suffix == ".wav" else "bgm.mp3")
                shutil.move(str(src_bgm), str(bgm_target))
                extraction.bgm_local_path = (
                    f"/static/audio_extractions/{extraction_id}/{bgm_target.name}"
                )
            else:
                fallback = await loop.run_in_executor(
                    None, _fallback_bgm_from_original, str(audio_path), task_dir
                )
                if fallback:
                    bgm_fallback = True
                    extraction.bgm_local_path = (
                        f"/static/audio_extractions/{extraction_id}/{Path(fallback).name}"
                    )
                    logger.info(
                        "Extraction %s: using full-track BGM fallback (demucs unavailable or failed)",
                        extraction_id,
                    )

            shutil.rmtree(demucs_out_dir, ignore_errors=True)

            if not extraction.original_audio_path:
                raise Exception("Original audio missing after extraction")

            notes = []
            if demucs_result.get("demucs_skipped"):
                notes.append("未安装 demucs，伴奏使用完整音轨代替")
            elif not demucs_result.get("vocals") and not demucs_result.get("bgm"):
                notes.append("人声/伴奏分离失败，已尽量保留完整音频")
            elif bgm_fallback:
                notes.append("伴奏分离失败，已使用完整音轨作为 BGM")
            if notes:
                extraction.error_msg = "；".join(notes)

            extraction.status = "success"
            await session.commit()
            logger.info(f"Extraction {extraction_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Extraction {extraction_id} failed: {e}")
            extraction.status = "failed"
            extraction.error_msg = str(e)
            await session.commit()
