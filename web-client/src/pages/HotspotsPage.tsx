import React, { useEffect, useState, useCallback } from "react";
import {
  fetchHotspots,
  fetchHotspotStats,
  fetchRisingHotspots,
  deleteHotspot,
  type Hotspot,
  type HotspotFilters,
  type HotspotStats,
} from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Flame,
  RefreshCw,
  TrendingUp,
  Heart,
  MessageSquare,
  Share2,
  Eye,
  Trophy,
  Calendar,
  ExternalLink,
  Trash2,
  Filter,
} from "lucide-react";
import { cn } from "@/utils";
import { VideoPlayerModal } from "@/components/common/VideoPlayerModal";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// 平台映射
const PLATFORM_MAP: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  dy: { label: "抖音", icon: "🎵", color: "bg-slate-500/20 text-slate-300" },
  xhs: { label: "小红书", icon: "📕", color: "bg-red-500/10 text-red-500" },
  bili: { label: "B站", icon: "📺", color: "bg-pink-500/10 text-pink-500" },
  wb: { label: "微博", icon: "📱", color: "bg-orange-500/10 text-orange-500" },
  ks: { label: "快手", icon: "📹", color: "bg-yellow-500/10 text-yellow-500" },
  zhihu: { label: "知乎", icon: "❓", color: "bg-blue-500/10 text-blue-500" },
};

// 格式化数字
const formatNumber = (num: number): string => {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  return num.toLocaleString();
};

// 热度等级
const getHeatLevel = (score: number): { label: string; color: string } => {
  if (score >= 10000) return { label: "爆款", color: "text-red-500" };
  if (score >= 5000) return { label: "热门", color: "text-orange-500" };
  if (score >= 1000) return { label: "不错", color: "text-yellow-500" };
  return { label: "普通", color: "text-muted-foreground" };
};

const getTodayDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * 热点排行页面 - 使用独立的热点池
 */
const HotspotsPage: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState<HotspotStats | null>(null);
  const [risingHotspots, setRisingHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<"daily" | "rising">("daily");
  const [expandedHotspots, setExpandedHotspots] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState<HotspotFilters>({
    page: 1,
    page_size: 20,
    sort_by: "heat_score",
    sort_order: "desc",
    rank_date: getTodayDateString(),
    is_valid: true, // 默认仅展示 AI 研判有效的优质垂直热点
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetchHotspots(filters),
        fetchHotspotStats(),
      ]);
      setHotspots(listRes.items);
      setTotal(listRes.total);
      setStats(statsRes);
    } catch (error) {
      console.error("Failed to load hotspots:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadRising = useCallback(async () => {
    setLoading(true);
    try {
      const rising = await fetchRisingHotspots(7, filters.platform, 50);
      setRisingHotspots(rising);
    } catch (error) {
      console.error("Failed to load rising hotspots:", error);
    } finally {
      setLoading(false);
    }
  }, [filters.platform]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "daily") {
      loadData();
    } else {
      loadRising();
    }
  }, [activeTab, loadData, loadRising]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadRising();
  }, [loadRising]);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要从热点池中移除这条内容吗？")) return;
    try {
      await deleteHotspot(id);
      loadData();
    } catch (error) {
      console.error("Failed to delete hotspot:", error);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedHotspots((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 计算当前展示的热点列表：daily 模式展示分页数据，rising 模式展示前端过滤后的飙升数据
  const displayedHotspots =
    activeTab === "daily"
      ? hotspots
      : risingHotspots.filter((item) => {
          if (filters.platform && item.platform !== filters.platform) return false;
          if (filters.is_valid !== undefined && item.is_valid !== filters.is_valid) return false;
          if (filters.is_competitor !== undefined && item.is_competitor !== filters.is_competitor) return false;
          return true;
        });

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-bold">热点排行</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", loading && "animate-spin")}
            />
            刷新
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          发现高互动热门内容并进行 AI 智能研判。支持按抓取日期筛选每日数据，并查看过去 7 天上升最快的热点。
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">有效热点数</div>
              <div className="text-2xl font-bold text-primary">
                {stats.total}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">今日新增</div>
              <div className="text-2xl font-bold text-green-400">
                {stats.today_count}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">平均热度分</div>
              <div className="text-2xl font-bold text-orange-400">
                {formatNumber(stats.avg_heat_score)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">覆盖平台</div>
              <div className="text-2xl font-bold text-blue-400">
                {Object.keys(stats.by_platform || {}).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rising Fast - only shown in daily tab as a preview */}
      {activeTab === "daily" && risingHotspots.length > 0 && (
        <Card className="mb-2 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              过去 7 天上升最快
              <button
                onClick={() => setActiveTab("rising")}
                className="ml-auto text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-normal"
              >
                查看全部 →
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {risingHotspots.slice(0, 8).map((item) => (
                <button
                  key={`rising-${item.id}`}
                  className="text-left rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                  onClick={() => window.open(item.content_url || "#", "_blank")}
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {PLATFORM_MAP[item.platform || ""]?.label || item.platform || "未知平台"}
                  </div>
                  <div className="text-sm font-medium line-clamp-2 mb-2">{item.title || "无标题"}</div>
                  <div className="text-xs text-emerald-400 font-semibold">
                    互动增量 +{formatNumber(item.growth_score || 0)}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab("daily")}
          className={cn(
            "pb-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2",
            activeTab === "daily"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Flame className="w-4 h-4" />
          每日热点
        </button>
        <button
          onClick={() => setActiveTab("rising")}
          className={cn(
            "pb-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">筛选:</span>
            </div>
            
            <select
              value={filters.platform || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  platform: e.target.value || undefined,
                  page: 1,
                })
              }
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">全部平台</option>
              {Object.entries(PLATFORM_MAP).map(([key, { label, icon }]) => (
                <option key={key} value={key}>
                  {icon} {label}
                </option>
              ))}
            </select>

            {/* 日期和排序只在每日热点模式显示 */}
            {activeTab === "daily" && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={filters.rank_date || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        rank_date: e.target.value || undefined,
                        page: 1,
                      })
                    }
                    className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
                  />
                  {filters.rank_date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setFilters({ ...filters, rank_date: undefined, page: 1 })}
                    >
                      清除日期
                    </Button>
                  )}
                </div>

                <select
                  value={filters.sort_by || "heat_score"}
                  onChange={(e) =>
                    setFilters({ ...filters, sort_by: e.target.value, page: 1 })
                  }
                  className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
                >
                  <option value="heat_score">按衰减热度排序</option>
                  <option value="alignment_score">按品牌匹配度排序</option>
                  <option value="recency_score">按趋势时效排序</option>
                  <option value="publish_time">按发布时间排序</option>
                  <option value="entered_at">按入榜时间排序</option>
                  <option value="view_count">按播放量排序</option>
                  <option value="like_count">按点赞数排序</option>
                  <option value="comment_count">按评论数排序</option>
                  <option value="share_count">按分享数排序</option>
                </select>
              </>
            )}

            {activeTab === "rising" && (
              <span className="text-xs text-muted-foreground bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                ↑ 按 7 天互动增量排序
              </span>
            )}

            <select
              value={filters.is_valid === undefined ? "" : String(filters.is_valid)}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  is_valid: e.target.value === "" ? undefined : e.target.value === "true",
                  page: 1,
                })
              }
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value="true">仅看有效推荐</option>
              <option value="false">仅看失效/敏感内容</option>
              <option value="">全部内容(包含敏感/过时)</option>
            </select>

            <select
              value={filters.is_competitor === undefined ? "" : String(filters.is_competitor)}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  is_competitor: e.target.value === "" ? undefined : e.target.value === "true",
                  page: 1,
                })
              }
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">全部账号内容</option>
              <option value="true">仅看竟品账号</option>
            </select>

            <div className="ml-auto text-sm text-muted-foreground">
              共 {activeTab === "daily" ? total : displayedHotspots.length} 条热点
            </div>
          </div>
        </CardContent>
      </Card>

      {/* displayedHotspots: daily = paginated list, rising = filtered rising list */}
      {(() => {
        return (
          <>
            {/* Empty State */}
            {!loading && displayedHotspots.length === 0 && (

              <Card className="bg-card/50 backdrop-blur">
                <CardContent className="p-12 text-center">
                  {activeTab === "rising" ? (
                    <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  ) : (
                    <Flame className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  )}
                  <h3 className="text-lg font-medium mb-2">
                    {activeTab === "daily" ? "暂无热点数据" : "暂无飙升热点数据"}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    {activeTab === "daily"
                      ? '创建一个"任务目的"为"找热点排行"的项目，并配置相关的关键词，启动后即可自动进行热点捕捉与 AI 研判。'
                      : "暂无飙升热点数据，请等待系统收集更多历史快照数据进行增量计算。"}
                  </p>
                  {activeTab === "daily" && (
                    <Button
                      variant="outline"
                      onClick={() => (window.location.href = "/projects")}
                    >
                      前往项目管理
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Hotspots List */}
            {displayedHotspots.length > 0 && (
              <div className="space-y-3">
                {displayedHotspots.map((hotspot, index) => {
                  const platform = PLATFORM_MAP[hotspot.platform || ""] || {
                    label: hotspot.platform,
                    icon: "📌",
                    color: "bg-gray-500/20 text-gray-400",
                  };
                  const heatLevel = getHeatLevel(hotspot.heat_score);
                  const rank =
                    activeTab === "daily"
                      ? ((filters.page || 1) - 1) * (filters.page_size || 20) + index + 1
                      : index + 1;

                  return (
                    <Card
                      key={hotspot.id}
                      className="bg-card/50 backdrop-blur hover:shadow-lg transition-shadow"
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col">
                          <div className="flex items-start gap-4">
                            {/* Rank */}
                            <div
                              className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0",
                                rank <= 3
                                  ? "bg-gradient-to-br from-yellow-500 to-orange-500 text-white"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {rank}
                            </div>

                            {/* Cover */}
                            <div
                              className="relative w-24 h-32 flex-shrink-0 group cursor-pointer"
                              onClick={() =>
                                hotspot.video_url
                                  ? setVideoUrl(hotspot.video_url)
                                  : window.open(hotspot.content_url, "_blank")
                              }
                            >
                              {hotspot.cover_url ? (
                                <img
                                  src={hotspot.cover_url}
                                  alt=""
                                  className="w-full h-full object-cover rounded-lg bg-muted"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                                  ?
                                </div>
                              )}
                              {hotspot.video_url && (
                                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 flex items-center justify-center transition-colors rounded-lg">
                                  <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn("text-xs px-2 py-0.5 rounded-full", platform.color)}>
                                  {platform.icon} {platform.label}
                                </span>
                                <span className={cn("text-xs font-medium", heatLevel.color)}>
                                  🔥 {heatLevel.label}
                                </span>
                              </div>

                              <h3
                                className="font-medium mb-1 line-clamp-2 hover:text-primary cursor-pointer transition-colors"
                                onClick={() => window.open(hotspot.content_url || "#", "_blank")}
                              >
                                {hotspot.title || "无标题"}
                              </h3>

                              <div
                                className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1 cursor-pointer hover:text-primary transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hotspot.author_url) window.open(hotspot.author_url, "_blank");
                                }}
                              >
                                {hotspot.author_avatar && (
                                  <img src={hotspot.author_avatar} className="w-4 h-4 rounded-full object-cover" alt="" />
                                )}
                                <span className={hotspot.author_url ? "hover:underline" : ""}>
                                  @{hotspot.author_name || "未知作者"}
                                </span>
                              </div>

                              {/* AI Scores and Badges */}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {hotspot.is_competitor && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold animate-pulse">
                                    🏢 竞品达人
                                  </span>
                                )}
                                {hotspot.duration_label && (
                                  <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full border",
                                    hotspot.duration_label === "即日可发" && "bg-red-500/10 text-red-400 border-red-500/20",
                                    hotspot.duration_label === "短期持续" && "bg-orange-500/10 text-orange-400 border-orange-500/20",
                                    hotspot.duration_label === "长期深耕" && "bg-green-500/10 text-green-400 border-green-500/20"
                                  )}>
                                    📅 {hotspot.duration_label}
                                  </span>
                                )}
                                {hotspot.alignment_score !== undefined && hotspot.alignment_score > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    🎯 匹配度: {hotspot.alignment_score.toFixed(0)}%
                                  </span>
                                )}
                                {hotspot.recency_score !== undefined && hotspot.recency_score > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    ⏳ 时效分: {hotspot.recency_score.toFixed(0)}%
                                  </span>
                                )}
                                {hotspot.custom_categories && hotspot.custom_categories.map((cat, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/5 text-violet-400 border border-violet-500/10">
                                    #{cat}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                <div>
                                  发布时间:{" "}
                                  {hotspot.publish_time ? new Date(hotspot.publish_time).toLocaleDateString() : "-"}
                                </div>
                                <div>
                                  入榜时间:{" "}
                                  {hotspot.entered_at ? new Date(hotspot.entered_at).toLocaleDateString() : "-"}
                                </div>
                              </div>

                              {(hotspot.ai_evaluation || hotspot.ai_features) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 text-xs text-primary hover:text-primary/80 p-0 h-auto flex items-center gap-1"
                                  onClick={() => toggleExpand(hotspot.id)}
                                >
                                  {expandedHotspots[hotspot.id] ? "收起 AI 智能分析 ▲" : "展开 AI 智能分析 ▼"}
                                </Button>
                              )}
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-3 text-sm flex-shrink-0 self-center">
                              {/* 7天互动增量 - 只在飙升模式显示 */}
                              {activeTab === "rising" && hotspot.growth_score !== undefined && hotspot.growth_score > 0 && (
                                <div className="text-center bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                                  <div className="font-bold text-emerald-400 text-base">
                                    +{formatNumber(hotspot.growth_score)}
                                  </div>
                                  <div className="text-[10px] text-emerald-500/80 font-medium">
                                    7天互动增量
                                  </div>
                                </div>
                              )}
                              <div className="text-center">
                                <div className="font-bold text-orange-400">
                                  {formatNumber(hotspot.heat_score)}
                                </div>
                                <div className="text-xs text-muted-foreground">热度</div>
                              </div>
                              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Heart className="w-3.5 h-3.5" />
                                  <span>{formatNumber(hotspot.like_count)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>{formatNumber(hotspot.comment_count)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>{formatNumber(hotspot.share_count)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0 self-center">
                              {hotspot.content_url ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-2"
                                  onClick={() => window.open(hotspot.content_url, "_blank")}
                                >
                                  <span className="text-xs mr-1">查看</span>
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="p-2 text-red-400 hover:text-red-300"
                                onClick={() => handleDelete(hotspot.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded AI Panel */}
                          {expandedHotspots[hotspot.id] && (hotspot.ai_evaluation || hotspot.ai_features) && (
                            <div className="mt-4 pt-4 border-t border-border bg-muted/20 rounded-lg p-3 text-sm space-y-3">
                              {hotspot.ai_evaluation && (
                                <div>
                                  <div className="font-semibold text-primary mb-1 flex items-center gap-1">
                                    <span>🤖</span> AI 研判解读:
                                  </div>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {hotspot.ai_evaluation}
                                  </p>
                                </div>
                              )}
                              {hotspot.ai_features && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                  {hotspot.ai_features.user_pain_points && hotspot.ai_features.user_pain_points.length > 0 && (
                                    <div className="bg-card/40 p-2 rounded border border-border/50">
                                      <div className="font-medium text-orange-400 text-xs mb-1 flex items-center gap-1">
                                        <span>🩹</span> 核心痛点:
                                      </div>
                                      <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                                        {hotspot.ai_features.user_pain_points.map((pt, idx) => (
                                          <li key={idx}>{pt}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {hotspot.ai_features.hooks && hotspot.ai_features.hooks.length > 0 && (
                                    <div className="bg-card/40 p-2 rounded border border-border/50">
                                      <div className="font-medium text-purple-400 text-xs mb-1 flex items-center gap-1">
                                        <span>💡</span> 爆款选题钩子:
                                      </div>
                                      <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                                        {hotspot.ai_features.hooks.map((hk, idx) => (
                                          <li key={idx}>{hk}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {hotspot.ai_features.faq && hotspot.ai_features.faq.length > 0 && (
                                    <div className="bg-card/40 p-2 rounded border border-border/50">
                                      <div className="font-medium text-blue-400 text-xs mb-1 flex items-center gap-1">
                                        <span>❓</span> 评论区热问:
                                      </div>
                                      <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                                        {hotspot.ai_features.faq.map((fq, idx) => (
                                          <li key={idx}>{fq}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* 入榜后连续7天互动变化趋势图 */}
                              {hotspot.history_trends && hotspot.history_trends.length > 0 && (
                                <div className="pt-3 border-t border-border/50">
                                  <div className="font-semibold text-teal-400 text-xs mb-2 flex items-center gap-1">
                                    <TrendingUp className="w-3.5 h-3.5 animate-pulse text-teal-400" /> 入榜后连续 7 天互动变化（点赞/评论/分享）:
                                  </div>
                                  <div className="h-[120px] w-full bg-card/10 rounded p-2 border border-border/20">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart
                                        data={hotspot.history_trends.map(t => ({
                                          date: t.record_date.slice(5),
                                          likes: t.like_count,
                                          comments: t.comment_count,
                                          shares: t.share_count,
                                        }))}
                                        margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                        <YAxis
                                          stroke="#94a3b8"
                                          fontSize={10}
                                          tickLine={false}
                                          axisLine={false}
                                          tickFormatter={(val) => {
                                            if (val >= 10000) return `${(val / 10000).toFixed(1)}w`;
                                            if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
                                            return val;
                                          }}
                                        />
                                        <Tooltip
                                          contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "6px", fontSize: "11px", color: "#f8fafc" }}
                                          labelClassName="text-slate-400 font-semibold"
                                        />
                                        <Line type="monotone" dataKey="likes" name="点赞" stroke="#14b8a6" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="comments" name="评论" stroke="#60a5fa" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="shares" name="分享" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                  {hotspot.history_trends.length >= 2 && (
                                    <div className="mt-2 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                                      <span>
                                        点赞变化:{" "}
                                        {formatNumber(
                                          (hotspot.history_trends[hotspot.history_trends.length - 1].like_count || 0) -
                                          (hotspot.history_trends[0].like_count || 0)
                                        )}
                                      </span>
                                      <span>
                                        评论变化:{" "}
                                        {formatNumber(
                                          (hotspot.history_trends[hotspot.history_trends.length - 1].comment_count || 0) -
                                          (hotspot.history_trends[0].comment_count || 0)
                                        )}
                                      </span>
                                      <span>
                                        分享变化:{" "}
                                        {formatNumber(
                                          (hotspot.history_trends[hotspot.history_trends.length - 1].share_count || 0) -
                                          (hotspot.history_trends[0].share_count || 0)
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination - daily only */}
            {activeTab === "daily" && total > filters.page_size! && (
              <div className="flex justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                >
                  上一页
                </Button>
                <span className="px-4 py-2 text-sm text-muted-foreground">
                  第 {filters.page} / {Math.ceil(total / filters.page_size!)} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page! >= Math.ceil(total / filters.page_size!)}
                  onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        );
      })()}

      <VideoPlayerModal url={videoUrl} onClose={() => setVideoUrl(null)} />
    </div>
  );
};

export default HotspotsPage;

