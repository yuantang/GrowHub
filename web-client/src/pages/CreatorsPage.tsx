import React, { useEffect, useState, useCallback } from "react";
import {
  fetchCreators,
  fetchCreatorStats,
  updateCreatorStatus,
  deleteCreator,
  type Creator,
  type CreatorFilters,
  type CreatorStats,
} from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Users,
  RefreshCw,
  Download,
  Search,
  Heart,
  MessageSquare,
  UserCheck,
  UserX,
  Mail,
  Trash2,
  ExternalLink,
  Filter,
} from "lucide-react";
import { cn } from "@/utils";

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

// 状态映射 (商务状态)
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "待联系", color: "bg-blue-500/20 text-blue-400" },
  contacted: { label: "已联系", color: "bg-yellow-500/20 text-yellow-400" },
  cooperating: { label: "合作中", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "已拒绝", color: "bg-red-500/20 text-red-400" },
};

// 抓取状态映射 (数据状态)
const CRAWL_STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  new: { label: "待抓取", color: "bg-blue-500/10 text-blue-500", icon: "⏳" },
  waiting: {
    label: "队列中",
    color: "bg-yellow-500/10 text-yellow-500",
    icon: "🏃",
  },
  profiled: {
    label: "已完善",
    color: "bg-green-500/10 text-green-500",
    icon: "✅",
  },
  failed: {
    label: "抓取失败",
    color: "bg-red-500/10 text-red-500",
    icon: "❌",
  },
};

// 格式化数字
const formatNumber = (num: number): string => {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "w";
  }
  return num.toLocaleString();
};

/**
 * 达人博主页面 - 使用独立的博主池
 */
const CreatorsPage: React.FC = () => {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<CreatorFilters>({
    page: 1,
    page_size: 20,
    sort_by: "fans_count",
    sort_order: "desc",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetchCreators(filters),
        fetchCreatorStats(),
      ]);
      setCreators(listRes.items);
      setTotal(listRes.total);
      setStats(statsRes);
    } catch (error) {
      console.error("Failed to load creators:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await updateCreatorStatus(id, newStatus);
      loadData();
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个博主吗？")) return;
    try {
      await deleteCreator(id);
      loadData();
    } catch (error) {
      console.error("Failed to delete creator:", error);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">达人博主</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", loading && "animate-spin")}
            />
            刷新
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          发现优质博主，管理合作状态。数据来源于"找达人博主"目的的任务。
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">博主总数</div>
              <div className="text-2xl font-bold text-primary">
                {stats.total}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">待联系</div>
              <div className="text-2xl font-bold text-blue-400">
                {stats.by_status?.new || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">已联系</div>
              <div className="text-2xl font-bold text-yellow-400">
                {stats.by_status?.contacted || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">合作中</div>
              <div className="text-2xl font-bold text-green-400">
                {stats.by_status?.cooperating || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6 bg-card/50 backdrop-blur">
        <CardContent className="p-4">
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
            <select
              value={filters.status || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  status: e.target.value || undefined,
                  page: 1,
                })
              }
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filters.sort_by || "fans_count"}
              onChange={(e) =>
                setFilters({ ...filters, sort_by: e.target.value, page: 1 })
              }
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value="fans_count">按粉丝数排序</option>
              <option value="likes_count">按获赞数排序</option>
              <option value="content_count">按内容数排序</option>
              <option value="created_at">按发现时间排序</option>
            </select>
            <div className="ml-auto text-sm text-muted-foreground">
              共 {total} 位博主
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {!loading && creators.length === 0 && (
        <Card className="bg-card/50 backdrop-blur">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无达人博主数据</h3>
            <p className="text-muted-foreground text-sm mb-4">
              创建一个"任务目的"为"找达人博主"的项目，开始发现优质博主。
            </p>
            <Button
              variant="outline"
              onClick={() => (window.location.href = "/projects")}
            >
              前往项目管理
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Creators Grid */}
      {creators.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators.map((creator) => {
            const platform = PLATFORM_MAP[creator.platform] || {
              label: creator.platform,
              icon: "📌",
              color: "bg-gray-500/20 text-gray-400",
            };
            const status = STATUS_MAP[creator.status] || STATUS_MAP.new;
            const crawlStatus =
              CRAWL_STATUS_MAP[creator.crawl_status || "new"] ||
              CRAWL_STATUS_MAP.new;

            return (
              <Card
                key={creator.id}
                className="bg-card/50 backdrop-blur hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <img
                      src={creator.author_avatar || "/placeholder-avatar.png"}
                      alt={creator.author_name || ""}
                      className="w-12 h-12 rounded-full object-cover bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        creator.author_url &&
                        window.open(creator.author_url, "_blank")
                      }
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/placeholder-avatar.png";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            platform.color
                          )}
                        >
                          {platform.icon} {platform.label}
                        </span>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            status.color
                          )}
                        >
                          {status.label}
                        </span>
                        {/* Data Status Badge */}
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full border border-border flex items-center gap-1",
                            crawlStatus.color
                          )}
                        >
                          <span>{crawlStatus.icon}</span>
                          {crawlStatus.label}
                        </span>
                      </div>
                      <h3
                        className="font-medium truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() =>
                          creator.author_url &&
                          window.open(creator.author_url, "_blank")
                        }
                      >
                        {creator.author_name || "未知博主"}
                      </h3>
                      {creator.unique_id && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{creator.unique_id}
                        </p>
                      )}
                      {creator.signature && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {creator.signature}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="bg-muted/30 rounded-lg p-2">
                      <div className="text-lg font-bold">
                        {formatNumber(creator.fans_count)}
                      </div>
                      <div className="text-xs text-muted-foreground">粉丝</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <div className="text-lg font-bold">
                        {formatNumber(creator.likes_count)}
                      </div>
                      <div className="text-xs text-muted-foreground">获赞</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <div className="text-lg font-bold">
                        {formatNumber(creator.works_count || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">作品</div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  {creator.contact_info && (
                    <div className="flex items-center gap-2 text-sm text-green-400 mb-3">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{creator.contact_info}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <select
                      value={creator.status}
                      onChange={(e) =>
                        handleStatusChange(creator.id, e.target.value)
                      }
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
                    >
                      {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {creator.author_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1"
                        onClick={() =>
                          window.open(creator.author_url, "_blank")
                        }
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 text-red-400 hover:text-red-300"
                      onClick={() => handleDelete(creator.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > filters.page_size! && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page === 1}
            onClick={() =>
              setFilters({ ...filters, page: (filters.page || 1) - 1 })
            }
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
            onClick={() =>
              setFilters({ ...filters, page: (filters.page || 1) + 1 })
            }
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
};

export default CreatorsPage;
