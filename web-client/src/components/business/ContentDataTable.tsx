import React, { useState, useEffect } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Star,
  Play,
  Image as ImageIcon,
  Video,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/utils/cn";
import { VideoPlayerModal } from "@/components/common/VideoPlayerModal";

// ==================== Constants ====================

const PLATFORM_LABELS: Record<string, string> = {
  xhs: "小红书",
  xiaohongshu: "小红书",
  dy: "抖音",
  douyin: "抖音",
  bili: "B站",
  bilibili: "B站",
  wb: "微博",
  weibo: "微博",
  ks: "快手",
  kuaishou: "快手",
  tieba: "贴吧",
  zhihu: "知乎",
};

const getAuthorUrl = (platform: string, authorId?: string) => {
  if (!authorId) return null;
  switch (platform) {
    case "dy":
    case "douyin":
      return `https://www.douyin.com/user/${authorId}`;
    case "xhs":
    case "xiaohongshu":
      return `https://www.xiaohongshu.com/user/profile/${authorId}`;
    case "bili":
    case "bilibili":
      return `https://space.bilibili.com/${authorId}`;
    case "wb":
    case "weibo":
      return `https://weibo.com/u/${authorId}`;
    case "ks":
    case "kuaishou":
      return `https://www.kuaishou.com/profile/${authorId}`;
    default:
      return null;
  }
};

// 数字格式化：超过1万显示为 X.X万
const formatNumber = (num: number): string => {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString();
};

// 时间格式化：本地时间
const formatTime = (ts?: string) => {
  if (!ts) return "-";

  // 1. 尝试直接解析
  let date = new Date(ts);

  // 2. 如果无效，尝试作为 UTC 时间处理 (补全 ISO 格式)
  if (isNaN(date.getTime())) {
    // 假设是 SQL 格式 "YYYY-MM-DD HH:mm:ss" 或类似的，且是 UTC
    // 替换空格为 T，并确保有 Z
    let fixed = typeof ts === "string" ? ts.replace(" ", "T") : ts;
    if (typeof fixed === "string" && !fixed.endsWith("Z")) {
      fixed += "Z";
    }
    date = new Date(fixed);
  }

  // 3. 仍然无效，返回原字符串
  if (isNaN(date.getTime())) {
    return ts;
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(/\//g, "-");
  } catch (e) {
    return ts;
  }
};

// ==================== Interfaces ====================

export interface ContentDisplayItem {
  id: string | number;
  platform?: string;
  // Author Info
  author: {
    name: string;
    avatar?: string;
    id?: string; // Display ID (e.g. dy number)
    unique_id?: string; // 抖音号/快手号等平台账号
    url?: string; // Homepage Link
    contact?: string; // Contact text (e.g. "WeChat: xxx")
    ip_location?: string;
    stats?: {
      fans?: number | string;
      follows?: number | string;
      liked?: number | string;
    };
  };
  // Content Info
  content: {
    title: string;
    desc: string;
    url: string; // Post Link
    tags?: string[];
  };
  // Media Info
  media: {
    cover?: string;
    type: "video" | "image" | "text";
    video_url?: string; // Playable URL
    image_list?: string[]; // Gallery URLs
    duration?: string;
  };
  // Interaction Stats
  stats: {
    liked: number;
    comments: number;
    collected: number;
    share: number;
    view?: number;
  };
  // Meta Info
  meta: {
    publish_time: string;
    crawl_time?: string;
    source_keyword?: string;
    is_alert?: boolean;
    alert_level?: string;
  };
}

interface ContentDataTableProps {
  data: ContentDisplayItem[];
  loading?: boolean;
  total?: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  adaptiveHeight?: boolean;
  pageScroll?: boolean;
}

// ==================== Sub-Components ====================

// 1. Image Gallery Modal
const ImageGalleryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
}> = ({ isOpen, onClose, images, initialIndex = 0 }) => {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (isOpen) setIndex(initialIndex);
  }, [isOpen, initialIndex]);

  if (!images?.length) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`图片预览 (${index + 1}/${images.length})`}
      className="max-w-5xl h-[85vh]"
    >
      <div className="flex flex-col h-full -mx-4 -my-2">
        <div className="flex-1 relative flex items-center justify-center bg-black/90 rounded-md overflow-hidden">
          <img
            src={images[index]}
            alt=""
            className="max-w-full max-h-full object-contain"
          />

          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors disabled:opacity-30 backdrop-blur-sm"
                disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors disabled:opacity-30 backdrop-blur-sm"
                disabled={index === images.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                <ChevronRight className="w-8 h-8" />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80%] p-2 bg-black/50 rounded-full backdrop-blur-sm">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setIndex(idx)}
                    className={cn(
                      "w-12 h-12 rounded-md overflow-hidden border-2 transition-all flex-shrink-0",
                      index === idx
                        ? "border-white scale-110"
                        : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

// VideoPlayerModal moved to @/components/common/VideoPlayerModal

// ==================== Main Component ====================

export const ContentDataTable: React.FC<ContentDataTableProps> = ({
  data,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
  adaptiveHeight = false,
  pageScroll = false,
}) => {
  // Media State
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleMediaClick = (item: ContentDisplayItem) => {
    if (item.media.type === "video" && item.media.video_url) {
      setVideoUrl(item.media.video_url);
    } else if (item.media.image_list && item.media.image_list.length > 0) {
      setGalleryImages(item.media.image_list);
      setGalleryOpen(true);
    } else {
      // Fallback: Jump to content
      window.open(item.content.url, "_blank");
    }
  };

  const totalPages = total ? Math.ceil(total / pageSize) : 0;

  return (
    <div
      className={cn(
        "space-y-4",
        className,
        adaptiveHeight && "flex flex-col h-full space-y-0 gap-4"
      )}
    >
      <div
        className={cn(
          "rounded-md border border-border bg-card shadow-sm",
          !pageScroll && "overflow-hidden",
          adaptiveHeight && "flex-1 flex flex-col min-h-0"
        )}
      >
        <div
          className={cn(
            "relative",
            !pageScroll && "overflow-x-auto overflow-y-auto",
            adaptiveHeight
              ? "flex-1 min-h-0"
              : !pageScroll && "max-h-[calc(100vh-220px)]"
          )}
        >
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted border-b border-border sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 font-medium w-[70px] sticky left-0 z-30 bg-muted shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  平台
                </th>
                <th className="px-4 py-3 font-medium w-[180px] sticky left-[70px] z-30 bg-muted shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  作者
                </th>
                <th className="px-4 py-3 font-medium w-[320px]">内容</th>
                <th className="px-4 py-3 font-medium w-[100px]">封面</th>
                <th className="px-4 py-3 font-medium w-[160px]">互动数据</th>
                <th className="px-4 py-3 font-medium w-[130px]">发布时间</th>
                <th className="px-4 py-3 font-medium w-[130px]">爬取时间</th>
                <th className="px-4 py-3 font-medium w-[70px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p>加载数据中...</p>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    暂无数据
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b transition-colors hover:bg-muted/50 group"
                  >
                    {/* 1. 平台 */}
                    <td className="p-4 align-middle sticky left-0 z-10 bg-card group-hover:bg-muted/50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                        {PLATFORM_LABELS[item.platform || ""] ||
                          item.platform ||
                          "-"}
                      </span>
                    </td>

                    {/* 2. 作者 - 头像和昵称一排对齐，下面联系方式 */}
                    <td className="p-4 align-middle sticky left-[70px] z-10 bg-card group-hover:bg-muted/50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex flex-col gap-2">
                        {/* 头像 + 昵称 一排 */}
                        <div
                          className="flex items-center gap-2 cursor-pointer group/author"
                          onClick={() => {
                            const url =
                              item.author.url ||
                              getAuthorUrl(item.platform || "", item.author.id);
                            if (url) window.open(url, "_blank");
                          }}
                          title="点击跳转博主主页"
                        >
                          <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted flex-shrink-0 border border-border group-hover/author:ring-2 ring-primary/30 transition-all">
                            {item.author.avatar ? (
                              <img
                                src={item.author.avatar}
                                alt={item.author.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs font-medium">
                                {item.author.name?.slice(0, 1) || "?"}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-sm truncate max-w-[120px] group-hover/author:text-primary transition-colors">
                              {item.author.name || "未知"}
                            </span>
                            {/* 抖音号/快手号等平台账号 */}
                            {item.author.unique_id && (
                              <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                                @{item.author.unique_id}
                              </span>
                            )}
                            {/* 作者粉丝/获赞 - 温和的展示 */}
                            {item.author.stats &&
                              (item.author.stats.fans !== undefined ||
                                item.author.stats.liked !== undefined) && (
                                <div className="flex flex-col gap-1 mt-1">
                                  {item.author.stats.fans !== undefined && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-foreground transition-colors">
                                      <Users className="w-3.5 h-3.5 text-blue-500/70" />
                                      <span>
                                        {formatNumber(
                                          Number(item.author.stats.fans)
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  {item.author.stats.liked !== undefined && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-foreground transition-colors">
                                      <Heart className="w-3.5 h-3.5 text-rose-500/70" />
                                      <span>
                                        {formatNumber(
                                          Number(item.author.stats.liked)
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                        {/* 联系方式 - 有就展示 */}
                        {item.author.contact && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded w-fit select-text whitespace-pre-wrap leading-tight">
                            {item.author.contact}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 3. 内容 - 不需要"源" */}
                    <td className="p-4 align-top">
                      <div className="flex flex-col gap-1">
                        <a
                          href={item.content.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm text-foreground hover:text-primary line-clamp-2 leading-relaxed"
                          title={item.content.title}
                        >
                          {item.content.title || "(无标题)"}
                        </a>
                        <p
                          className="text-xs text-muted-foreground line-clamp-2 leading-relaxed"
                          title={item.content.desc}
                        >
                          {item.content.desc}
                        </p>
                        {/* 标签 */}
                        {item.content.tags && item.content.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.content.tags.slice(0, 5).map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 4. 封面/类型 - 视频可播放，图片可滑动 */}
                    <td className="p-4 align-middle">
                      <div
                        className="relative w-20 h-20 rounded-md overflow-hidden border border-border bg-muted cursor-pointer group/media shadow-sm hover:shadow-md transition-all"
                        onClick={() => handleMediaClick(item)}
                      >
                        {item.media.cover ? (
                          <img
                            src={`/api/proxy/image?url=${encodeURIComponent(
                              item.media.cover
                            )}`}
                            alt="cover"
                            className="w-full h-full object-cover transition-transform group-hover/media:scale-105"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              // 尝试直接加载原始URL
                              if (!target.dataset.fallback) {
                                target.dataset.fallback = "true";
                                target.src = item.media.cover || "";
                              } else {
                                target.style.display = "none";
                                const fallback =
                                  target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "flex";
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="w-full h-full items-center justify-center text-muted-foreground bg-muted/50"
                          style={{
                            display: item.media.cover ? "none" : "flex",
                          }}
                        >
                          <ImageIcon className="w-6 h-6 opacity-30" />
                        </div>

                        {/* 视频：右上角角标 + 中间播放按钮 */}
                        {/* 抖音/快手等平台可能 video_url 有值但 content_type 没存对，做兼容处理 */}
                        {(item.media.type === "video" ||
                          !!item.media.video_url) && (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/media:bg-black/30 transition-colors">
                              <Play
                                className="w-8 h-8 text-white/90 drop-shadow-lg"
                                fill="currentColor"
                              />
                            </div>
                            <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-[2px] rounded px-1 py-0.5 flex items-center gap-0.5">
                              <Video className="w-3 h-3 text-white" />
                              <span className="text-[9px] text-white font-medium">
                                视频
                              </span>
                            </div>
                          </>
                        )}

                        {/* 图片：右上角显示图片数量 */}
                        {item.media.type === "image" &&
                          item.media.image_list &&
                          item.media.image_list.length > 1 && (
                            <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-[2px] rounded px-1 py-0.5 flex items-center gap-0.5">
                              <ImageIcon className="w-3 h-3 text-white" />
                              <span className="text-[9px] text-white font-medium">
                                {item.media.image_list.length}
                              </span>
                            </div>
                          )}
                      </div>
                    </td>

                    {/* 5. 互动数据 */}
                    <td className="p-4 align-middle">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center" title="点赞">
                          <Heart className="w-3.5 h-3.5 mr-1 text-rose-400" />
                          <span>{formatNumber(item.stats.liked)}</span>
                        </div>
                        <div className="flex items-center" title="评论">
                          <MessageCircle className="w-3.5 h-3.5 mr-1 text-blue-400" />
                          <span>{formatNumber(item.stats.comments)}</span>
                        </div>
                        <div className="flex items-center" title="收藏">
                          <Star className="w-3.5 h-3.5 mr-1 text-amber-400" />
                          <span>{formatNumber(item.stats.collected)}</span>
                        </div>
                        <div className="flex items-center" title="分享">
                          <Share2 className="w-3.5 h-3.5 mr-1 text-green-400" />
                          <span>{formatNumber(item.stats.share)}</span>
                        </div>
                      </div>
                    </td>

                    {/* 6. 发布时间 */}
                    <td className="p-4 align-middle text-xs text-muted-foreground">
                      <span className="font-mono">
                        {formatTime(item.meta.publish_time)}
                      </span>
                    </td>

                    {/* 7. 爬取时间 */}
                    <td className="p-4 align-middle text-xs text-muted-foreground">
                      <span className="font-mono">
                        {formatTime(item.meta.crawl_time)}
                      </span>
                    </td>

                    {/* 8. 操作 - 点击去帖子 */}
                    <td className="p-4 align-middle">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => window.open(item.content.url, "_blank")}
                        title="查看帖子"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        查看
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total !== undefined && total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              共 {total} 条数据，当前第 {page} / {totalPages} 页
            </span>
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                  className="h-8 px-2 text-sm rounded-md border border-border bg-background"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <span className="text-sm text-muted-foreground">条</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              下一页
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ImageGalleryModal
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        images={galleryImages}
      />
      <VideoPlayerModal url={videoUrl} onClose={() => setVideoUrl(null)} />
    </div>
  );
};
