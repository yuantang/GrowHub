import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { extractAudio, getAudioExtractionStatus } from '../api';
import type { AudioExtractionStatus, MonitoredItem } from '../api';
import { Music, X, Loader2, CheckCircle2, AlertCircle, Copy, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { resolveAudioSrc } from '@/utils/mediaUrl';

export interface ExtractableItem {
  id: number;
  type?: 'hotspot' | 'content';
  url?: string;
  name?: string;
  avatar?: string;
}

export const AudioExtractButton = ({ item, className, mini }: { item: ExtractableItem, className?: string, mini?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  // 只要有视频链接，就可以提取
  if (!item.url) return null;

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={className || "flex-1 py-2 flex items-center justify-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl transition-colors shadow-sm"}
        title="提取音频与文案"
      >
        <Music className={mini ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {!mini && "一键提取音/文"}
      </button>

      {isOpen && (
        <AudioExtractionModal
          item={item}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

const AudioExtractionModal = ({ item, onClose }: { item: ExtractableItem, onClose: () => void }) => {
  const [extractionId, setExtractionId] = useState<number | null>(null);
  const [status, setStatus] = useState<AudioExtractionStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const startExtraction = async () => {
      try {
        setLoading(true);
        // data-monitor 列表里的 item，如果是视频就是 content，热点则是 hotspot
        const type = item.type || 'content';
        const res = await extractAudio(type, item.id);
        setExtractionId(res.extraction_id);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "发起提取失败");
        setStatus({
          id: 0,
          status: 'failed',
          error_msg: err.response?.data?.detail || "发起提取失败"
        });
        setLoading(false);
      }
    };
    startExtraction();
  }, [item.id, onClose]);

  useEffect(() => {
    if (!extractionId) return;

    let timer: NodeJS.Timeout;
    const poll = async () => {
      try {
        const res = await getAudioExtractionStatus(extractionId);
        setStatus(res);
        if (res.status !== 'success' && res.status !== 'failed') {
          timer = setTimeout(poll, 3000);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Polling error", err);
        timer = setTimeout(poll, 5000);
      }
    };

    poll();
    return () => clearTimeout(timer);
  }, [extractionId]);

  const statusLabel: Record<string, string> = {
    'pending': '排队中...',
    'downloading': '下载视频中...',
    'extracting': '抽取原声中...',
    'transcribing': 'AI 文案识别中 (Whisper)...',
    'separating': '人声与伴奏分离中 (Demucs)...',
    'success': '提取完成',
    'failed': '提取失败'
  };

  const handleCopy = () => {
    if (status?.transcript_text) {
      navigator.clipboard.writeText(status.transcript_text);
      toast.success("文案已复制到剪贴板");
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Music className="w-5 h-5 text-emerald-500" />
            智能音频与文案提取
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6 flex items-center gap-3">
            {item.avatar && (
              <img src={item.avatar} alt="" className="w-12 h-12 rounded-lg object-cover" />
            )}
            <div>
              <p className="text-sm font-medium line-clamp-1">{item.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 break-all">来源: {item.url || '未知'}</p>
            </div>
          </div>

          {!status || loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
              <div>
                <p className="font-medium text-lg">
                  {status ? statusLabel[status.status] || status.status : '正在准备提取...'}
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-md">
                  正在您的本地机器上运行深度学习模型 (Demucs & Whisper)。由于纯本地推理不依赖外部 API，提取过程通常需要 10-30 秒，请耐心等待。
                </p>
              </div>
            </div>
          ) : status.status === 'failed' ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-red-500">
              <AlertCircle className="w-10 h-10" />
              <p className="font-medium">提取失败</p>
              <p className="text-xs text-red-400 max-w-md text-center">{status.error_msg}</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-lg font-medium text-sm">
                <CheckCircle2 className="w-5 h-5" />
                {status.bgm_url || status.original_audio_url
                  ? '提取完成（文案与音频已就绪）'
                  : '文案提取完成'}
              </div>
              {status.error_msg && (
                <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-4 py-2 rounded-lg text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{status.error_msg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground border-b border-border pb-2">
                    <PlayCircle className="w-4 h-4 text-primary" />
                    原始音频 (完整)
                  </h3>
                  {status.original_audio_url ? (
                    <audio controls src={resolveAudioSrc(status.original_audio_url)} className="w-full h-10" />
                  ) : <span className="text-xs text-muted-foreground">无法获取</span>}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground border-b border-border pb-2">
                    <Music className="w-4 h-4 text-blue-500" />
                    纯净伴奏 (BGM)
                  </h3>
                  {status.bgm_url ? (
                    <audio controls src={resolveAudioSrc(status.bgm_url)} className="w-full h-10" />
                  ) : <span className="text-xs text-muted-foreground">分离失败或不存在</span>}
                </div>

                <div className="space-y-3 md:col-span-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground border-b border-border pb-2">
                    <PlayCircle className="w-4 h-4 text-rose-500" />
                    分离后纯人声
                  </h3>
                  {status.vocals_url ? (
                    <audio controls src={resolveAudioSrc(status.vocals_url)} className="w-full h-10" />
                  ) : <span className="text-xs text-muted-foreground">分离失败或不存在（需安装 demucs）</span>}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-sm font-bold text-foreground">视频文案提取结果 (Whisper)</h3>
                  <button 
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors font-medium"
                  >
                    <Copy className="w-3 h-3" />
                    一键复制
                  </button>
                </div>
                <div className="bg-muted/30 border border-border/50 rounded-xl p-4 max-h-[200px] overflow-y-auto">
                  {status.transcript_text ? (
                    <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">
                      {status.transcript_text}
                    </pre>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">未识别到任何人声内容...</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
