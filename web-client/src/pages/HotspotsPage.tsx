import React, { useEffect, useState, useCallback } from 'react';
import { 
    fetchHotspots, 
    fetchHotspotStats,
    fetchHotspotRanking,
    deleteHotspot,
    type Hotspot, 
    type HotspotFilters, 
    type HotspotStats 
} from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    Filter
} from 'lucide-react';
import { cn } from '@/utils';

// 平台映射
const PLATFORM_MAP: Record<string, { label: string; icon: string; color: string }> = {
    dy: { label: '抖音', icon: '🎵', color: 'bg-slate-500/20 text-slate-300' },
    xhs: { label: '小红书', icon: '📕', color: 'bg-red-500/10 text-red-500' },
    bili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    wb: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    ks: { label: '快手', icon: '📹', color: 'bg-yellow-500/10 text-yellow-500' },
    zhihu: { label: '知乎', icon: '❓', color: 'bg-blue-500/10 text-blue-500' },
};

// 格式化数字
const formatNumber = (num: number): string => {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
    }
    return num.toLocaleString();
};

// 热度等级
const getHeatLevel = (score: number): { label: string; color: string } => {
    if (score >= 10000) return { label: '爆款', color: 'text-red-500' };
    if (score >= 5000) return { label: '热门', color: 'text-orange-500' };
    if (score >= 1000) return { label: '不错', color: 'text-yellow-500' };
    return { label: '普通', color: 'text-muted-foreground' };
};

/**
 * 热点排行页面 - 使用独立的热点池
 */
const HotspotsPage: React.FC = () => {
    const [hotspots, setHotspots] = useState<Hotspot[]>([]);
    const [stats, setStats] = useState<HotspotStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [viewMode, setViewMode] = useState<'list' | 'ranking'>('list');
    const [filters, setFilters] = useState<HotspotFilters>({
        page: 1,
        page_size: 20,
        sort_by: 'heat_score',
        sort_order: 'desc',
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
            console.error('Failed to load hotspots:', error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = async (id: number) => {
        if (!confirm('确定要从热点池中移除这条内容吗？')) return;
        try {
            await deleteHotspot(id);
            loadData();
        } catch (error) {
            console.error('Failed to delete hotspot:', error);
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <Flame className="w-6 h-6 text-orange-500" />
                        <h1 className="text-2xl font-bold">热点排行</h1>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                        刷新
                    </Button>
                </div>
                <p className="text-muted-foreground text-sm">
                    发现高互动热门内容。数据来源于"找热点排行"目的的任务。
                </p>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <Card className="bg-card/50 backdrop-blur">
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">热点总数</div>
                            <div className="text-2xl font-bold text-primary">{stats.total}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur">
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">今日新增</div>
                            <div className="text-2xl font-bold text-green-400">{stats.today_count}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur">
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">平均热度分</div>
                            <div className="text-2xl font-bold text-orange-400">{formatNumber(stats.avg_heat_score)}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur">
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">覆盖平台</div>
                            <div className="text-2xl font-bold text-blue-400">{Object.keys(stats.by_platform || {}).length}</div>
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
                            value={filters.platform || ''}
                            onChange={(e) => setFilters({ ...filters, platform: e.target.value || undefined, page: 1 })}
                            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
                        >
                            <option value="">全部平台</option>
                            {Object.entries(PLATFORM_MAP).map(([key, { label, icon }]) => (
                                <option key={key} value={key}>{icon} {label}</option>
                            ))}
                        </select>
                        <select
                            value={filters.sort_by || 'heat_score'}
                            onChange={(e) => setFilters({ ...filters, sort_by: e.target.value, page: 1 })}
                            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
                        >
                            <option value="heat_score">按热度分排序</option>
                            <option value="like_count">按点赞数排序</option>
                            <option value="comment_count">按评论数排序</option>
                            <option value="entered_at">按入选时间排序</option>
                        </select>
                        <div className="ml-auto text-sm text-muted-foreground">
                            共 {total} 条热点
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Empty State */}
            {!loading && hotspots.length === 0 && (
                <Card className="bg-card/50 backdrop-blur">
                    <CardContent className="p-12 text-center">
                        <Flame className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium mb-2">暂无热点数据</h3>
                        <p className="text-muted-foreground text-sm mb-4">
                            创建一个"任务目的"为"找热点排行"的项目，开始发现热门内容。
                        </p>
                        <Button variant="outline" onClick={() => window.location.href = '/projects'}>
                            前往项目管理
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Hotspots List */}
            {hotspots.length > 0 && (
                <div className="space-y-3">
                    {hotspots.map((hotspot, index) => {
                        const platform = PLATFORM_MAP[hotspot.platform || ''] || { label: hotspot.platform, icon: '📌', color: 'bg-gray-500/20 text-gray-400' };
                        const heatLevel = getHeatLevel(hotspot.heat_score);
                        const rank = ((filters.page || 1) - 1) * (filters.page_size || 20) + index + 1;
                        
                        return (
                            <Card key={hotspot.id} className="bg-card/50 backdrop-blur hover:shadow-lg transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        {/* Rank */}
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg",
                                            rank <= 3 ? "bg-gradient-to-br from-yellow-500 to-orange-500 text-white" : "bg-muted text-muted-foreground"
                                        )}>
                                            {rank}
                                        </div>

                                        {/* Cover */}
                                        {hotspot.cover_url && (
                                            <img
                                                src={hotspot.cover_url}
                                                alt=""
                                                className="w-20 h-20 rounded-lg object-cover bg-muted flex-shrink-0"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        )}

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
                                            <h3 className="font-medium mb-1 line-clamp-2">{hotspot.title || '无标题'}</h3>
                                            <div className="text-sm text-muted-foreground">
                                                {hotspot.author_name && <span>@{hotspot.author_name}</span>}
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-4 text-sm">
                                            <div className="text-center">
                                                <div className="font-bold text-orange-400">{formatNumber(hotspot.heat_score)}</div>
                                                <div className="text-xs text-muted-foreground">热度</div>
                                            </div>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Heart className="w-4 h-4" />
                                                <span>{formatNumber(hotspot.like_count)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <MessageSquare className="w-4 h-4" />
                                                <span>{formatNumber(hotspot.comment_count)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Share2 className="w-4 h-4" />
                                                <span>{formatNumber(hotspot.share_count)}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1">
                                            {hotspot.content_url && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="p-2"
                                                    onClick={() => window.open(hotspot.content_url, '_blank')}
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                            )}
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
        </div>
    );
};

export default HotspotsPage;
