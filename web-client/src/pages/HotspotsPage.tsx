import React, { useState, useEffect } from 'react';
import {
    TrendingUp, Flame, Eye, Heart, MessageCircle, Share2,
    RefreshCw, ExternalLink, Star
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = 'http://localhost:8080/api';

interface HotspotContent {
    id: number;
    rank: number;
    platform: string;
    title: string;
    description: string | null;
    author_name: string;
    author_avatar: string | null;
    like_count: number;
    comment_count: number;
    share_count: number;
    view_count: number;
    engagement_rate: number;
    sentiment: string;
    category: string;
    publish_time: string | null;
    content_url: string | null;
    cover_url: string | null;
    heat_score: number;
}

interface TrendData {
    date: string;
    total: number;
    sentiment: {
        positive: number;
        neutral: number;
        negative: number;
    };
    alerts: number;
}

const PLATFORM_LABELS: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    bilibili: 'B站',
    weibo: '微博',
    zhihu: '知乎',
};

const PLATFORM_COLORS: Record<string, string> = {
    douyin: 'bg-pink-500/20 text-pink-400',
    xiaohongshu: 'bg-red-500/20 text-red-400',
    bilibili: 'bg-blue-500/20 text-blue-400',
    weibo: 'bg-orange-500/20 text-orange-400',
    zhihu: 'bg-cyan-500/20 text-cyan-400',
};

const SENTIMENT_COLORS: Record<string, string> = {
    positive: 'bg-green-500/20 text-green-400',
    neutral: 'bg-gray-500/20 text-gray-400',
    negative: 'bg-red-500/20 text-red-400',
};

const SENTIMENT_LABELS: Record<string, string> = {
    positive: '正面',
    neutral: '中性',
    negative: '负面',
};

const HotspotsPage: React.FC = () => {
    const [hotspots, setHotspots] = useState<HotspotContent[]>([]);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlatform, setSelectedPlatform] = useState<string>('');
    const [hours, setHours] = useState(24);

    const fetchHotspots = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                hours: String(hours),
                limit: '20',
            });
            if (selectedPlatform) {
                params.set('platform', selectedPlatform);
            }

            const response = await fetch(`${API_BASE}/growhub/content/hotspots?${params}`);
            const data = await response.json();
            setHotspots(data.items || []);
        } catch (error) {
            console.error('Failed to fetch hotspots:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrend = async () => {
        try {
            const params = new URLSearchParams({ days: '7' });
            if (selectedPlatform) {
                params.set('platform', selectedPlatform);
            }

            const response = await fetch(`${API_BASE}/growhub/content/trend?${params}`);
            const data = await response.json();
            setTrendData(data.data || []);
        } catch (error) {
            console.error('Failed to fetch trend:', error);
        }
    };

    useEffect(() => {
        fetchHotspots();
        fetchTrend();
    }, [selectedPlatform, hours]);

    const formatNumber = (num: number): string => {
        if (num >= 10000) {
            return (num / 10000).toFixed(1) + 'w';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return String(num);
    };

    const getRankBadge = (rank: number) => {
        if (rank === 1) return 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white';
        if (rank === 2) return 'bg-gradient-to-r from-gray-400 to-gray-500 text-white';
        if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white';
        return 'bg-muted text-muted-foreground';
    };

    // Calculate totals for trend chart
    const totalContent = trendData.reduce((sum, d) => sum + d.total, 0);
    const totalAlerts = trendData.reduce((sum, d) => sum + d.alerts, 0);
    const totalPositive = trendData.reduce((sum, d) => sum + d.sentiment.positive, 0);
    const totalNegative = trendData.reduce((sum, d) => sum + d.sentiment.negative, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Flame className="w-6 h-6 text-orange-500" />
                        热点内容排行
                    </h1>
                    <p className="text-muted-foreground mt-1">发现最热门的社交媒体内容</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedPlatform}
                        onChange={(e) => setSelectedPlatform(e.target.value)}
                        className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                    >
                        <option value="">全部平台</option>
                        {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <select
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                    >
                        <option value={6}>最近 6 小时</option>
                        <option value={24}>最近 24 小时</option>
                        <option value={48}>最近 2 天</option>
                        <option value={168}>最近 7 天</option>
                    </select>
                    <Button variant="outline" onClick={() => { fetchHotspots(); fetchTrend(); }}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        刷新
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/20">
                                <TrendingUp className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">7天内容总量</p>
                                <p className="text-2xl font-bold text-blue-400">{formatNumber(totalContent)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500/20">
                                <Star className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">正面内容</p>
                                <p className="text-2xl font-bold text-green-400">{formatNumber(totalPositive)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/20">
                                <MessageCircle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">负面内容</p>
                                <p className="text-2xl font-bold text-red-400">{formatNumber(totalNegative)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500/20">
                                <Flame className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">预警总数</p>
                                <p className="text-2xl font-bold text-orange-400">{formatNumber(totalAlerts)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Trend Chart (Simple Bar Visualization) */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">7日趋势</CardTitle>
                </CardHeader>
                <CardContent>
                    {trendData.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">暂无趋势数据</p>
                    ) : (
                        <div className="flex items-end justify-between h-32 gap-2">
                            {trendData.map((day, idx) => {
                                const maxTotal = Math.max(...trendData.map(d => d.total), 1);
                                const height = (day.total / maxTotal) * 100;
                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                                        <div
                                            className="w-full bg-gradient-to-t from-primary/80 to-primary/40 rounded-t transition-all hover:from-primary hover:to-primary/60"
                                            style={{ height: `${Math.max(height, 4)}%` }}
                                            title={`${day.total} 条内容`}
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {day.date.slice(5)}
                                        </span>
                                        <span className="text-xs font-medium">{day.total}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Hotspots List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Flame className="w-5 h-5 text-orange-500" />
                        热门内容 TOP 20
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">加载中...</div>
                    ) : hotspots.length === 0 ? (
                        <div className="text-center py-8">
                            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <p className="text-muted-foreground">暂无热点内容</p>
                            <p className="text-sm text-muted-foreground/70 mt-1">尝试扩大时间范围或切换平台</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {hotspots.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                    {/* Rank Badge */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankBadge(item.rank)}`}>
                                        {item.rank}
                                    </div>

                                    {/* Cover Image */}
                                    {item.cover_url && (
                                        <div className="w-20 h-14 rounded overflow-hidden flex-shrink-0">
                                            <img
                                                src={item.cover_url}
                                                alt={item.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 text-xs rounded ${PLATFORM_COLORS[item.platform] || 'bg-gray-500/20 text-gray-400'}`}>
                                                {PLATFORM_LABELS[item.platform] || item.platform}
                                            </span>
                                            <span className={`px-2 py-0.5 text-xs rounded ${SENTIMENT_COLORS[item.sentiment] || 'bg-gray-500/20'}`}>
                                                {SENTIMENT_LABELS[item.sentiment] || item.sentiment}
                                            </span>
                                        </div>
                                        <h3 className="font-medium truncate">{item.title}</h3>
                                        {item.description && (
                                            <p className="text-sm text-muted-foreground truncate mt-1">{item.description}</p>
                                        )}
                                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                            <span>@{item.author_name}</span>
                                            {item.publish_time && (
                                                <>
                                                    <span>·</span>
                                                    <span>{new Date(item.publish_time).toLocaleDateString()}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        {item.view_count > 0 && (
                                            <div className="flex items-center gap-1" title="播放量">
                                                <Eye className="w-4 h-4" />
                                                <span>{formatNumber(item.view_count)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1" title="点赞">
                                            <Heart className="w-4 h-4" />
                                            <span>{formatNumber(item.like_count)}</span>
                                        </div>
                                        <div className="flex items-center gap-1" title="评论">
                                            <MessageCircle className="w-4 h-4" />
                                            <span>{formatNumber(item.comment_count)}</span>
                                        </div>
                                        <div className="flex items-center gap-1" title="分享">
                                            <Share2 className="w-4 h-4" />
                                            <span>{formatNumber(item.share_count)}</span>
                                        </div>
                                    </div>

                                    {/* Heat Score & Link */}
                                    <div className="flex items-center gap-2">
                                        <div className="px-2 py-1 bg-orange-500/20 rounded text-orange-400 text-sm font-medium" title="热度分数">
                                            🔥 {formatNumber(item.heat_score)}
                                        </div>
                                        {item.content_url && (
                                            <a
                                                href={item.content_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 hover:bg-muted rounded transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default HotspotsPage;
