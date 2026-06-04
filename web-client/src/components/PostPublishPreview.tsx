import React from "react";
import { X, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ImagePreview } from "@/components/ImageLightbox";
import { formatPublishBody } from "@/utils/postCopy";
import { fetchAvailableBgms } from "@/api";

const PLATFORM_LABELS: Record<string, string> = {
  xhs: "小红书",
  dy: "抖音",
  wb: "微博",
};

export interface PostPublishPreviewProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: {
    publishTime?: string;
    composeVideo?: boolean;
    bgmUrl?: string;
  }) => void;
  confirming?: boolean;
  platform: string;
  taskTitle: string;
  accountLabel: string;
  copyTitle: string;
  copyBody: string;
  copyHashtags: string[];
  imageUrls: string[];
}

export const PostPublishPreview: React.FC<PostPublishPreviewProps> = ({
  open,
  onClose,
  onConfirm,
  confirming = false,
  platform,
  taskTitle,
  accountLabel,
  copyTitle,
  copyBody,
  copyHashtags,
  imageUrls,
}) => {
  const [imgIdx, setImgIdx] = React.useState(0);
  const [bgms, setBgms] = React.useState<Array<{ name: string; url: string }>>([]);
  const [selectedBgm, setSelectedBgm] = React.useState("");
  const [composeVideo, setComposeVideo] = React.useState(false);
  const [publishTime, setPublishTime] = React.useState("");
  const [loadingBgms, setLoadingBgms] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setImgIdx(0);
      setPublishTime("");
      setComposeVideo(false);
      setSelectedBgm("");
      setIsPlaying(false);
      
      const loadBgms = async () => {
        setLoadingBgms(true);
        try {
          const res = await fetchAvailableBgms();
          if (res.success && res.data) {
            setBgms(res.data);
            if (res.data.length > 0) {
              setSelectedBgm(res.data[0].url);
            }
          }
        } catch (e) {
          console.error("加载 BGM 失败:", e);
        } finally {
          setLoadingBgms(false);
        }
      };
      loadBgms();
    }
  }, [open]);

  // 当 BGM 改变时停止试听
  React.useEffect(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [selectedBgm]);

  const togglePlayAudio = () => {
    if (!audioRef.current || !selectedBgm) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(e => {
        console.error("播放音频失败:", e);
      });
    }
  };

  if (!open) return null;

  const platformName = PLATFORM_LABELS[platform] || platform;
  const fullBody = formatPublishBody(copyBody, copyHashtags);

  const handleSubmit = () => {
    // 将 ISO 时间转为格式化的 YYYY-MM-DD HH:MM:SS 供后端识别
    let formattedTime = undefined;
    if (publishTime) {
      const dt = new Date(publishTime);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const h = String(dt.getHours()).padStart(2, "0");
      const min = String(dt.getMinutes()).padStart(2, "0");
      const s = String(dt.getSeconds()).padStart(2, "0");
      formattedTime = `${y}-${m}-${d} ${h}:${min}:${s}`;
    }
    
    onConfirm({
      publishTime: formattedTime,
      composeVideo: composeVideo,
      bgmUrl: composeVideo ? selectedBgm : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border/50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-base">发布预览与高级设置</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              设置定时发布、视频合成，并预览推送到矩阵分发的帖子信息
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* 基本信息 & 额外配置 */}
          <div className="space-y-3 bg-muted/30 rounded-lg p-3.5 border border-border/50 text-xs">
            <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
              <div>
                <span className="text-muted-foreground">任务名称：</span>
                <span className="text-foreground font-medium block truncate">{taskTitle}</span>
              </div>
              <div>
                <span className="text-muted-foreground">目标平台：</span>
                <span className="text-foreground font-medium">{platformName}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">发布账号：</span>
                <span className="text-foreground font-medium">{accountLabel}</span>
              </div>
            </div>

            <hr className="border-border/50" />

            {/* 定时发布与多媒体合并 */}
            <div className="space-y-3 pt-1">
              {/* 定时发布 */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  定时发布时间 (不设则为立即发布)
                </label>
                <input
                  type="datetime-local"
                  value={publishTime}
                  onChange={(e) => setPublishTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* 抖音短视频合成选项 */}
              {platform === "dy" && (
                <div className="space-y-2.5 p-2.5 rounded bg-background/50 border border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">海报与 BGM 合成短视频</span>
                      <span className="text-[9px] text-muted-foreground">自动将多张海报图片和背景音合成为抖音短视频发布</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={composeVideo}
                      onChange={(e) => setComposeVideo(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>

                  {composeVideo && (
                    <div className="space-y-2 pt-1.5 border-t border-border/40">
                      <label className="text-[10px] font-bold text-muted-foreground block">背景音乐 (BGM) 选择</label>
                      <div className="flex gap-2">
                        <select
                          value={selectedBgm}
                          onChange={(e) => setSelectedBgm(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded-md outline-none"
                          disabled={loadingBgms}
                        >
                          {loadingBgms ? (
                            <option>加载音乐库中...</option>
                          ) : bgms.length === 0 ? (
                            <option value="">暂无可用提取的背景音</option>
                          ) : (
                            bgms.map((b) => (
                              <option key={b.url} value={b.url}>
                                {b.name}
                              </option>
                            ))
                          )}
                        </select>
                        {selectedBgm && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={togglePlayAudio}
                            className="h-8 px-2.5 text-xs"
                          >
                            {isPlaying ? "暂停试听" : "点击试听"}
                          </Button>
                        )}
                      </div>
                      
                      {selectedBgm && (
                        <audio
                          ref={audioRef}
                          src={selectedBgm}
                          className="hidden"
                          onEnded={() => setIsPlaying(false)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 平台帖子卡片 mock */}
          <div className="rounded-xl border border-border overflow-hidden bg-background shadow-sm">
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
              <span className="font-semibold text-foreground">GrowHub 预览</span>
              <span className="text-muted-foreground">· {platformName}</span>
            </div>

            {imageUrls.length > 0 && (
              <div className="relative aspect-[3/4] bg-muted">
                <ImagePreview
                  src={imageUrls[imgIdx]}
                  alt="配图预览"
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover"
                  showZoomHint={false}
                />
                {imageUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white disabled:opacity-30"
                      disabled={imgIdx === 0}
                      onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white disabled:opacity-30"
                      disabled={imgIdx >= imageUrls.length - 1}
                      onClick={() => setImgIdx((i) => Math.min(imageUrls.length - 1, i + 1))}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                      {imgIdx + 1} / {imageUrls.length}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="p-3 space-y-2 text-sm">
              <p className="font-bold text-foreground leading-snug">{copyTitle || "（无标题）"}</p>
              <p className="text-foreground/90 whitespace-pre-wrap text-xs leading-relaxed">
                {copyBody || "（无正文）"}
              </p>
              {copyHashtags.length > 0 && (
                <p className="text-xs text-indigo-500 leading-relaxed">
                  {copyHashtags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
            </div>
          </div>

          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">查看完整投递正文</summary>
            <pre className="mt-2 p-2 rounded bg-muted/40 border border-border/50 whitespace-pre-wrap font-sans text-[10px] text-foreground/80 font-mono">
              {fullBody}
            </pre>
          </details>
        </div>

        <div className="p-4 border-t border-border/50 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={confirming}>
            返回修改
          </Button>
          <Button
            className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold"
            onClick={handleSubmit}
            disabled={confirming}
          >
            {confirming ? (
              "推送中..."
            ) : (
              <>
                <Send className="w-4 h-4 mr-1.5 inline" />
                确认推送
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
