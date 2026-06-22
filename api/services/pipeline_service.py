# -*- coding: utf-8 -*-
"""
基于原片 + TTS + 字幕的 ffmpeg 视频合成（二创成片主路径）。
HyperFrames 仅作无原片时的兜底。
"""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import textwrap
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.services.script_segment_parser import clean_narration
from tools import utils


def _run(cmd: List[str], timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def probe_duration(path: str) -> float:
    try:
        proc = _run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ], timeout=30)
        if proc.returncode == 0:
            return max(0.1, float(proc.stdout.decode().strip()))
    except Exception:
        pass
    return 3.0


def _escape_drawtext(text: str) -> str:
    t = text.replace("\\", "\\\\")
    t = t.replace(":", "\\:")
    t = t.replace("'", "\\'")
    t = t.replace("%", "\\%")
    t = t.replace("\n", " ")
    return t


def _wrap_subtitle(text: str, width: int = 16, max_lines: int = 3) -> str:
    lines = textwrap.wrap(text, width=width)[:max_lines]
    return "\\n".join(lines)


def _pick_font() -> str:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return "Sans"


async def generate_segment_tts(
    text: str,
    output_path: str,
    voice: str = "calm",
) -> bool:
    from api.services.hyperframes_service import generate_tts

    narration = clean_narration(text)
    if not narration:
        return False
    return await generate_tts(narration, output_path, voice=voice)


async def prepare_segment_audios(
    segments: List[Dict[str, Any]],
    work_dir: Path,
    voice: str = "calm",
) -> List[Dict[str, Any]]:
    """为每段生成 TTS，写入 duration / audio_path。"""
    prepared: List[Dict[str, Any]] = []
    for i, seg in enumerate(segments):
        narr = clean_narration(seg.get("narration") or "")
        if not narr:
            continue
        audio_path = work_dir / f"seg_{i:02d}.mp3"
        ok = await generate_segment_tts(narr, str(audio_path), voice=voice)
        if not ok or not audio_path.exists():
            continue
        dur = probe_duration(str(audio_path))
        prepared.append({
            **seg,
            "narration": narr,
            "audio_path": str(audio_path),
            "duration": dur,
            "index": i,
        })
    return prepared


def _build_concat_audio_list(segments: List[Dict[str, Any]], list_path: Path) -> float:
    lines = []
    total = 0.0
    for seg in segments:
        ap = seg.get("audio_path")
        if ap and Path(ap).exists():
            lines.append(f"file '{Path(ap).resolve()}'")
            total += float(seg.get("duration") or probe_duration(ap))
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return total


async def compose_from_source_video(
    source_video: str,
    prepared: List[Dict[str, Any]],
    output_path: str,
    work_dir: Path,
) -> bool:
    """
    原片铺满画面 + 分段 TTS 配音 + 底部字幕（drawtext 按时间段切换）。
    """
    if not Path(source_video).exists():
        utils.logger.error(f"[VideoCompose] 原片不存在: {source_video}")
        return False

    work_dir.mkdir(parents=True, exist_ok=True)
    if not prepared:
        utils.logger.error("[VideoCompose] 无有效口播段")
        return False

    concat_list = work_dir / "audio_concat.txt"
    total_audio = _build_concat_audio_list(prepared, concat_list)
    merged_audio = work_dir / "narration_full.mp3"

    proc = _run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy", str(merged_audio),
    ])
    if proc.returncode != 0 or not merged_audio.exists():
        utils.logger.error(f"[VideoCompose] 音频拼接失败: {proc.stderr.decode()[-500:]}")
        return False

    video_dur = probe_duration(source_video)
    loop = video_dur < total_audio - 0.5

    font = _pick_font()
    vf_base = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    vf_sub = vf_base
    t_cursor = 0.0
    for seg in prepared:
        start = t_cursor
        end = start + float(seg["duration"])
        t_cursor = end
        sub = _escape_drawtext(_wrap_subtitle(seg["narration"]))
        vf_sub += (
            f",drawtext=fontfile='{font}':text='{sub}':"
            f"fontcolor=white:fontsize=52:borderw=3:bordercolor=black@0.7:"
            f"x=(w-text_w)/2:y=h*0.72:"
            f"enable='between(t,{start:.3f},{end:.3f})'"
        )

    async def _try_render(vf: str) -> subprocess.CompletedProcess:
        cmd: List[str] = ["ffmpeg", "-y"]
        if loop:
            cmd += ["-stream_loop", "-1"]
        cmd += [
            "-i", source_video,
            "-i", str(merged_audio),
            "-vf", vf,
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            "-t", f"{total_audio:.3f}",
            "-movflags", "+faststart",
            output_path,
        ]
        loop_async = asyncio.get_event_loop()
        return await loop_async.run_in_executor(None, lambda: _run(cmd, 600))

    try:
        proc = await _try_render(vf_sub)
        if proc.returncode != 0 and "drawtext" in proc.stderr.decode(errors="replace").lower():
            utils.logger.warning("[VideoCompose] drawtext 不可用，降级为原片+配音（无烧录字幕）")
            proc = await _try_render(vf_base)
        if proc.returncode != 0:
            utils.logger.error(
                f"[VideoCompose] ffmpeg 失败: {proc.stderr.decode(errors='replace')[-1500:]}"
            )
            return False
        utils.logger.info(f"[VideoCompose] 成片: {output_path}")
        return Path(output_path).exists()
    except Exception as e:
        utils.logger.exception(f"[VideoCompose] 异常: {e}")
        return False


async def compose_from_audio_only(
    prepared: List[Dict[str, Any]],
    output_path: str,
    work_dir: Path,
) -> bool:
    """无原片时长较长时：纯色背景 + TTS（避免 HyperFrames 超长渲染崩溃）。"""
    work_dir.mkdir(parents=True, exist_ok=True)
    if not prepared:
        return False

    concat_list = work_dir / "audio_concat.txt"
    total_audio = _build_concat_audio_list(prepared, concat_list)
    merged_audio = work_dir / "narration_full.mp3"
    proc = _run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list), "-c", "copy", str(merged_audio),
    ])
    if proc.returncode != 0 or not merged_audio.exists():
        return False

    dur = max(total_audio, 3.0)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=0x0a0e1a:s=1080x1920:d={dur:.3f}:r=30",
        "-i", str(merged_audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-t", f"{dur:.3f}",
        "-movflags", "+faststart",
        output_path,
    ]
    try:
        loop_async = asyncio.get_event_loop()
        proc = await loop_async.run_in_executor(None, lambda: _run(cmd, max(600, int(dur * 2))))
        return proc.returncode == 0 and Path(output_path).exists()
    except Exception as e:
        utils.logger.exception(f"[VideoCompose] audio-only 异常: {e}")
        return False


async def _resolve_media_path(url_or_path: str, temp_dir: str) -> str:
    """
    定位或下载图片/音频资源，返回本地绝对路径
    """
    if not url_or_path:
        return ""
        
    url_or_path = url_or_path.strip()
    
    # 1. 抖音/本地代理等重写
    # 比如 /api/growhub_imagegen/static/ -> /static/
    url_or_path = url_or_path.replace("/api/growhub_imagegen/static/", "/static/")
    
    # 2. 如果是本地静态资源 /static/xxx 或者是 static/xxx
    if url_or_path.startswith("/static/") or url_or_path.startswith("static/"):
        # 静态文件真实存储目录
        project_root = Path(__file__).resolve().parents[2]
        rel_path = url_or_path.lstrip("/")
        local_path = project_root / rel_path
        if local_path.exists():
            return str(local_path.resolve())
            
    # 3. 如果是完整的 HTTP 链接
    if url_or_path.startswith(("http://", "https://")):
        # 如果是本机的代理链接，如 http://localhost:8040/static/...，转为本地路径
        for local_host in ("http://localhost:8040", "http://127.0.0.1:8040", "http://localhost:8080", "http://127.0.0.1:8080"):
            if url_or_path.startswith(local_host):
                path_part = url_or_path[len(local_host):]
                local_resolved = await _resolve_media_path(path_part, temp_dir)
                if local_resolved and os.path.exists(local_resolved):
                    return local_resolved
                    
        # 否则真的去下载它
        try:
            import httpx
            import urllib.parse
            parsed = urllib.parse.urlparse(url_or_path)
            filename = os.path.basename(parsed.path)
            if not filename or "." not in filename:
                filename = "downloaded_temp_file"
            local_download_path = os.path.join(temp_dir, filename)
            
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                resp = await client.get(url_or_path)
                resp.raise_for_status()
                with open(local_download_path, "wb") as f:
                    f.write(resp.content)
            return local_download_path
        except Exception as e:
            utils.logger.error(f"[VideoCompose] Download failed: {url_or_path}, error: {e}")
            raise e
            
    # 4. 如果是直接的本地路径
    if os.path.exists(url_or_path):
        return str(Path(url_or_path).resolve())
        
    # 尝试在项目根目录下寻找
    project_root = Path(__file__).resolve().parents[2]
    local_path = project_root / url_or_path
    if local_path.exists():
        return str(local_path.resolve())
        
    return ""


async def compose_images_with_bgm(
    image_urls: List[str],
    bgm_url: str,
    output_path: str,
    duration_per_image: float = 3.0
) -> bool:
    """
    多张图片 + 1个BGM背景音 -> 合成MP4视频
    """
    import tempfile
    import os
    from pathlib import Path
    
    if not image_urls:
        utils.logger.error("[VideoCompose] 无图片输入")
        return False
        
    # 创建渲染输出目录
    out_dir = Path(output_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    
    # 使用临时文件夹处理转换
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # 1. 准备/下载背景音乐
            bgm_local = await _resolve_media_path(bgm_url, temp_dir)
            if not bgm_local or not os.path.exists(bgm_local):
                utils.logger.error(f"[VideoCompose] BGM 无法解析或定位: {bgm_url}")
                return False
                
            # 2. 准备/下载每一张图片并转为 3 秒的临时 mp4 文件
            temp_mp4_files = []
            loop_async = asyncio.get_event_loop()
            
            for i, img_url in enumerate(image_urls):
                img_local = await _resolve_media_path(img_url, temp_dir)
                if not img_local or not os.path.exists(img_local):
                    utils.logger.warning(f"[VideoCompose] 图片无法解析或定位，跳过: {img_url}")
                    continue
                    
                temp_mp4 = os.path.join(temp_dir, f"slide_{i}.mp4")
                
                # 转换命令： scale 并 crop 到 1080x1920，设置时长为 3.0 秒
                cmd = [
                    "ffmpeg", "-y",
                    "-loop", "1",
                    "-i", img_local,
                    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
                    "-t", str(duration_per_image),
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-r", "24",
                    temp_mp4
                ]
                
                proc = await loop_async.run_in_executor(None, lambda: _run(cmd, 60))
                if proc.returncode != 0:
                    utils.logger.error(f"[VideoCompose] 转码单张图片失败: {proc.stderr.decode(errors='replace')}")
                    return False
                    
                temp_mp4_files.append(temp_mp4)
                
            if not temp_mp4_files:
                utils.logger.error("[VideoCompose] 无有效图片转换成功")
                return False
                
            # 3. concat 合并所有 mp4 文件
            concat_list_path = os.path.join(temp_dir, "concat_list.txt")
            with open(concat_list_path, "w", encoding="utf-8") as f:
                for tf in temp_mp4_files:
                    # 使用绝对路径，加上单引号防空格
                    f.write(f"file '{Path(tf).resolve()}'\n")
                    
            temp_combined_path = os.path.join(temp_dir, "temp_combined.mp4")
            concat_cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_list_path,
                "-c", "copy",
                temp_combined_path
            ]
            
            proc = await loop_async.run_in_executor(None, lambda: _run(concat_cmd, 120))
            if proc.returncode != 0:
                utils.logger.error(f"[VideoCompose] Concat 视频合并失败: {proc.stderr.decode(errors='replace')}")
                return False
                
            # 4. 混入背景音乐 BGM 音轨
            # 使用 -shortest 确保音视频长度一致，并截断
            mix_cmd = [
                "ffmpeg", "-y",
                "-i", temp_combined_path,
                "-i", bgm_local,
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-shortest",
                output_path
            ]
            
            proc = await loop_async.run_in_executor(None, lambda: _run(mix_cmd, 120))
            if proc.returncode != 0:
                utils.logger.error(f"[VideoCompose] 音轨混缩失败: {proc.stderr.decode(errors='replace')}")
                return False
                
            utils.logger.info(f"[VideoCompose] 图片与 BGM 合成视频成功: {output_path}")
            return os.path.exists(output_path)
            
        except Exception as e:
            utils.logger.exception(f"[VideoCompose] 合成图片视频过程中异常: {e}")
            return False
