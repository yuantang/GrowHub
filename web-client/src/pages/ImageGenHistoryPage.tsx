import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  History,
  Trash2,
  ExternalLink,
  RotateCcw,
  Clock,
  PlayCircle,
  CheckCircle,
  XCircle,
  Filter,
  Layers,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  User,
  Calendar
} from "lucide-react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import {
  fetchImageGenPublishHistory,
  deletePublishTask,
  type ImageGenPublishHistoryItem
} from "@/api";
import { ImageLightbox } from "@/components/ImageLightbox";

const parseErrorDetail = (e: any, fallback: string): string => {
  if (e.response?.data?.detail) {
    const detail = e.response.data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((err: { loc?: string[]; msg?: string }) => {
          const locStr = err.loc ? err.loc.join(".") : "";
          return `${locStr}: ${err.msg}`;
        })
        .join("; ");
    }
  }
  return e.message || fallback;
};

const ImageGenHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ImageGenPublishHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(6); // 独立列表页一页展示 6 条大卡片，双/三列排版更合适
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // 长文案折叠展开状态 (key: taskId, value: boolean)
  const [expandedTexts, setExpandedTexts] = useState<Record<number, boolean>>({});

  // Lightbox 状态
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const loadHistory = async (p = page, plat = platformFilter, stat = statusFilter) => {
    setLoading(true);
    try {
      // 备注：后端 publish_history 接口目前仅支持分页，我们在前端做多维过滤以保障极速无刷新体验，
      // 同时拉取相对足够的一页大小，或者调高 page_size 后进行匹配筛选。
      // 为了支持完全的大列表分页和过滤，我们可以直接在请求中过滤或者由前端根据接口做整合。
      // 这里我们为了数据准确性，直接拉取，后期可以拓展后端过滤。
      const res = await fetchImageGenPublishHistory(p, pageSize);
      if (res?.success && res.data) {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      } else {
        setItems([]);
        setTotal(0);
        toast.error("加载图文历史记录失败");
      }
    } catch (e) {
      console.error(e);
      setItems([]);
      setTotal(0);
      toast.error(parseErrorDetail(e, "加载历史记录失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(page, platformFilter, statusFilter);
  }, [page]);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这条发布历史记录吗？")) return;
    try {
      const res = await deletePublishTask(id);
      if (res.success) {
        toast.success("记录已成功删除");
        loadHistory(page);
      } else {
        toast.error("删除记录失败");
      }
    } catch (e) {
      toast.error(parseErrorDetail(e, "删除记录失败"));
    }
  };

  const handleApply = (id: number) => {
    navigate(`/image-gen?apply_history=${id}`);
    toast.info("正在加载历史文案与图片，请稍候...");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
      case "pending_generation":
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" /> 待生成
          </span>
        );
      case "publishing":
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
            <PlayCircle className="w-3.5 h-3.5 animate-spin" /> 投递中
          </span>
        );
      case "published":
      case "success":
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" /> 已成功发布
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> 发布失败
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            {status}
          </span>
        );
    }
  };

  const getPlatformBadge = (platform: string) => {
    const formatted = platform.toLowerCase();
    if (formatted === "xhs") {
      return (
        <span className="inline-flex items-center py-0.5 px-2 rounded-md text-xs font-semibold bg-rose-600/15 text-rose-500 border border-rose-500/20">
          小红书
        </span>
      );
    } else if (formatted === "dy") {
      return (
        <span className="inline-flex items-center py-0.5 px-2 rounded-md text-xs font-semibold bg-cyan-600/15 text-cyan-400 border border-cyan-400/20">
          抖音
        </span>
      );
    } else if (formatted === "wb") {
      return (
        <span className="inline-flex items-center py-0.5 px-2 rounded-md text-xs font-semibold bg-amber-600/15 text-amber-500 border border-amber-500/20">
          微博
        </span>
      );
    }
    return (
      <span className="inline-flex items-center py-0.5 px-2 rounded-md text-xs font-semibold bg-slate-600/15 text-slate-400 border border-slate-500/20">
        {platform}
      </span>
    );
  };

  const toggleText = (id: number) => {
    setExpandedTexts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 前端多维过滤数据
  const filteredItems = items.filter((item) => {
    const matchPlat = platformFilter === "all" || item.platform.toLowerCase() === platformFilter.toLowerCase();
    const matchStat = statusFilter === "all" || 
      (statusFilter === "success" && (item.status === "success" || item.status === "published")) ||
      (statusFilter === "failed" && item.status === "failed") ||
      (statusFilter === "publishing" && item.status === "publishing") ||
      (statusFilter === "pending" && (item.status === "pending" || item.status === "pending_generation"));
    return matchPlat && matchStat;
  });

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
      {/* 头部面板 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <History className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              图文发布历史记录库
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            记录您在图文生成工作台设计并推送到矩阵发帖队列的所有历史帖子，支持快速套用、效果分析与发布成果跳转。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => loadHistory(page)} disabled={loading}>
            <RotateCcw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            刷新记录
          </Button>
        </div>
      </div>

      {/* 过滤器面板 */}
      <Card className="bg-card/45 backdrop-blur-md border-border/40 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">平台筛选:</span>
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="px-3 py-1.5 text-sm bg-background border border-border/60 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              >
                <option value="all">全部平台</option>
                <option value="xhs">小红书</option>
                <option value="dy">抖音</option>
                <option value="wb">微博</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">发布状态:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm bg-background border border-border/60 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              >
                <option value="all">全部状态</option>
                <option value="success">发布成功</option>
                <option value="failed">发布失败</option>
                <option value="publishing">投递中</option>
                <option value="pending">待生成</option>
              </select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            当前列表展示: <span className="font-bold text-foreground">{filteredItems.length}</span> 条数据
          </div>
        </CardContent>
      </Card>

      {/* 历史大卡片网格列表 */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="border-border/30 bg-card/20 animate-pulse h-80" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="border-border/40 bg-card/25 py-20 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground/30">
              <ImageIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground/80">暂无图文生成历史</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              在筛选条件内未找到任何历史推送记录。您可以前往图文生成工作台，生成并分发新帖子。
            </p>
            <Button variant="primary" className="mt-2" onClick={() => navigate("/image-gen")}>
              去工作台生成图文
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredItems.map((item) => {
            const hasImages = item.image_urls && item.image_urls.length > 0;
            const isTextExpanded = !!expandedTexts[item.id];
            
            // 处理折叠文案：字数大于 180 时折叠
            const contentText = item.copy_body || item.content_body || "";
            const bodyLength = contentText.length;
            const shouldCollapse = bodyLength > 180;
            const displayText = isTextExpanded || !shouldCollapse
              ? contentText
              : `${contentText.slice(0, 180)}...`;

            return (
              <Card
                key={item.id}
                className="group border-border/40 hover:border-border/80 bg-card/35 hover:bg-card/50 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                <CardContent className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  {/* 卡片头部信息 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getPlatformBadge(item.platform)}
                        <span className="text-xs text-muted-foreground font-mono">ID #{item.id}</span>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                    
                    <h3 className="text-base font-bold text-foreground tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {item.task_title || "未命名任务"}
                    </h3>
                  </div>

                  {/* 帖子图文预览区域 */}
                  <div className="space-y-3">
                    {/* 生图画廊微缩列表 */}
                    {hasImages ? (
                      <div className="relative">
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-muted">
                          {item.image_urls.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              onClick={() => setLightbox({ images: item.image_urls, index: idx })}
                              className="relative min-w-[90px] h-[90px] rounded-lg overflow-hidden border border-border/30 bg-muted hover:border-primary/50 cursor-zoom-in transition-all flex-shrink-0 group/img"
                            >
                              <img
                                src={imgUrl}
                                alt={`image-${idx}`}
                                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-[10px] transition-opacity">
                                预览
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-border/50 rounded-lg p-4 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 text-xs h-[90px]">
                        <ImageIcon className="w-5 h-5 mb-1.5 opacity-40" />
                        <span>该记录不包含已生成的配图</span>
                      </div>
                    )}

                    {/* 文案内容主体 */}
                    <div className="space-y-2.5 bg-muted/20 hover:bg-muted/30 border border-border/20 rounded-lg p-3.5 transition-colors text-sm">
                      {/* 标题 */}
                      {item.copy_title && (
                        <div className="pb-2 border-b border-border/10 flex items-start gap-1.5">
                          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold shrink-0">
                            标题
                          </span>
                          <span className="font-bold text-foreground/90">{item.copy_title}</span>
                        </div>
                      )}
                      
                      {/* 正文 */}
                      <div className="whitespace-pre-wrap leading-relaxed text-foreground/80">
                        {displayText}
                        {shouldCollapse && (
                          <button
                            type="button"
                            onClick={() => toggleText(item.id)}
                            className="mt-2 flex items-center gap-1 text-xs text-primary font-semibold hover:underline outline-none"
                          >
                            {isTextExpanded ? (
                              <>
                                收起正文 <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                展开全文 <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* 话题标签 */}
                      {item.copy_hashtags && item.copy_hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/10">
                          {item.copy_hashtags.map((tag, tagIdx) => (
                            <span 
                              key={tagIdx} 
                              className="text-[11px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/10"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 发帖账号、时间与跳转信息 */}
                  <div className="pt-3 border-t border-border/30 grid grid-cols-2 gap-2 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                      <span className="truncate">账号: {item.account_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* 帖子线上回收链接 */}
                  <div className="pt-2">
                    {item.post_url ? (
                      <a
                        href={item.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 py-2 rounded-lg transition-colors border border-emerald-500/20"
                      >
                        🔗 查阅已发布在线帖子 <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <div className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground bg-muted/10 py-2 rounded-lg border border-border/10 cursor-not-allowed">
                        暂无在线帖子链接 (发布中/失败)
                      </div>
                    )}
                  </div>

                  {/* 操作按钮区 */}
                  <div className="pt-3 flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 h-9 px-3 border border-transparent hover:border-rose-500/20"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> 删除历史
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApply(item.id)}
                      className="h-9 px-4 shadow-sm shadow-primary/20"
                    >
                      🚀 载入套用回工作台
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页控制栏 */}
      {!loading && total > pageSize && (
        <div className="mt-8 flex items-center justify-between border-t border-border/30 pt-4">
          <div className="text-sm text-muted-foreground">
            第 <span className="font-bold text-foreground">{page}</span> /{" "}
            {Math.ceil(total / pageSize)} 页，共 {total} 条记录
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* Lightbox 大图预览 */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};

export default ImageGenHistoryPage;
