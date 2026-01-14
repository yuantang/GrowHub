import React, { useEffect, useState, useCallback } from 'react';
import {
    fetchGrowHubContents, fetchGrowHubStats, fetchTopAnalysis, fetchGrowHubTrend, getGrowHubExportUrl
} from '@/api';
import type {
    GrowHubContentItem, GrowHubContentStats, GrowHubContentFilters
} from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
    Download, Search, Database,
    Heart, MessageCircle, Share2, Calendar
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { ContentDataTable } from '@/components/business/ContentDataTable';

// ==================== Data Pool Tab ====================

const DataPoolTab: React.FC = () => {
    // State
    const [stats, setStats] = useState<GrowHubContentStats | null>(null);
    const [contents, setContents] = useState<GrowHubContentItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    // Charts Data
    const [trendData, setTrendData] = useState<any[]>([]);
    const [topData, setTopData] = useState<any[]>([]);

    // 计算最近N天日期范围
    const getLastNDaysRange = (days: number) => {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - days + 1);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        return { start: formatDate(start), end: formatDate(today) };
    };

    // 默认最近30天
    const defaultDateRange = getLastNDaysRange(30);

    // Filters - 默认使用本周时间
    const [filters, setFilters] = useState<GrowHubContentFilters>({
        page: 1,
        page_size: 20,
        sort_by: 'crawl_time',
        sort_order: 'desc',
        start_date: defaultDateRange.start,
        end_date: defaultDateRange.end
    });

    // Temp filter state for inputs - 同样使用本周时间
    const [tempFilters, setTempFilters] = useState<GrowHubContentFilters>({
        start_date: defaultDateRange.start,
        end_date: defaultDateRange.end
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Apply filters to ALL data fetches including stats and charts
            const [contentsRes, statsRes, trendRes, topRes] = await Promise.all([
                fetchGrowHubContents(filters.page || 1, filters.page_size || 20, filters),
                fetchGrowHubStats(filters),
                fetchGrowHubTrend(7, filters),
                fetchTopAnalysis(10, filters)
            ]);

            setContents(contentsRes.items);
            setTotal(contentsRes.total);
            setStats(statsRes);
            setTrendData(trendRes.data);
            setTopData(topRes);
        } catch (error) {
            console.error("Failed to load data pool:", error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleFilterChange = (key: keyof GrowHubContentFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
        setTempFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApplyFilters = () => {
        setFilters(prev => ({ ...prev, ...tempFilters, page: 1 }));
    };

    const handleResetFilters = () => {
        const reset: GrowHubContentFilters = {
            page: 1,
            page_size: filters.page_size || 20,
            sort_by: 'crawl_time',
            sort_order: 'desc',
            start_date: defaultDateRange.start,
            end_date: defaultDateRange.end
        };
        setFilters(reset);
        setTempFilters({
            start_date: defaultDateRange.start,
            end_date: defaultDateRange.end
        });
    };

    const handlePageChange = (newPage: number) => {
        setFilters(prev => ({ ...prev, page: newPage }));
    };

    const handlePageSizeChange = (newPageSize: number) => {
        setFilters(prev => ({ ...prev, page_size: newPageSize, page: 1 }));
    };

    const formatNumber = (num: number) => {
        if (!num) return '0';
        if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
        if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
        return num.toLocaleString();
    };

    const getUserProfileUrl = (item: GrowHubContentItem) => {
        if (!item.author_id) return '#';
        const p = item.platform;
        if (p === 'douyin' || p === 'dy') return `https://www.douyin.com/user/${item.author_id}`;
        if (p === 'bilibili' || p === 'bili') return `https://space.bilibili.com/${item.author_id}`;
        if (p === 'weibo' || p === 'wb') return `https://weibo.com/u/${item.author_id}`;
        if (p === 'kuaishou' || p === 'ks') return `https://www.kuaishou.com/profile/${item.author_id}`;
        if (p === 'xiaohongshu' || p === 'xhs') return `https://www.xiaohongshu.com/user/profile/${item.author_id}`;
        return '#';
    };

    // 时间快捷方式
    const getDateRange = (type: string): { start: string; end: string } => {
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        switch (type) {
            case 'today':
                return { start: formatDate(today), end: formatDate(today) };
            case 'yesterday': {
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                return { start: formatDate(yesterday), end: formatDate(yesterday) };
            }
            case 'thisWeek': {
                const monday = new Date(today);
                monday.setDate(today.getDate() - today.getDay() + 1);
                return { start: formatDate(monday), end: formatDate(today) };
            }
            case 'lastWeek': {
                const lastMonday = new Date(today);
                lastMonday.setDate(today.getDate() - today.getDay() - 6);
                const lastSunday = new Date(lastMonday);
                lastSunday.setDate(lastMonday.getDate() + 6);
                return { start: formatDate(lastMonday), end: formatDate(lastSunday) };
            }
            case 'thisMonth': {
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                return { start: formatDate(firstDay), end: formatDate(today) };
            }
            case 'lastMonth': {
                const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
                return { start: formatDate(firstDay), end: formatDate(lastDay) };
            }
            case 'last7Days': {
                const start = new Date(today);
                start.setDate(today.getDate() - 6);
                return { start: formatDate(start), end: formatDate(today) };
            }
            case 'last30Days': {
                const start = new Date(today);
                start.setDate(today.getDate() - 29);
                return { start: formatDate(start), end: formatDate(today) };
            }
            case 'last90Days': {
                const start = new Date(today);
                start.setDate(today.getDate() - 89);
                return { start: formatDate(start), end: formatDate(today) };
            }
            default:
                return { start: '', end: '' };
        }
    };

    const applyDateShortcut = (type: string, field: 'publish' | 'crawl') => {
        const { start, end } = getDateRange(type);
        if (field === 'publish') {
            setTempFilters(prev => ({ ...prev, start_date: start, end_date: end }));
        } else {
            setTempFilters(prev => ({ ...prev, crawl_start_date: start, crawl_end_date: end }));
        }
    };

    const timeShortcuts = [
        { label: '今天', value: 'today' },
        { label: '昨天', value: 'yesterday' },
        { label: '本周', value: 'thisWeek' },
        { label: '上周', value: 'lastWeek' },
        { label: '本月', value: 'thisMonth' },
        { label: '上月', value: 'lastMonth' },
        { label: '近7天', value: 'last7Days' },
        { label: '近30天', value: 'last30Days' },
        { label: '近90天', value: 'last90Days' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Filter Section */}
            <Card className="border-border/50">
                <CardContent className="p-5">
                    <div className="space-y-4">
                        {/* Row 1: Basic Filters - 平台、关键词、标题搜索 */}
                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">平台</span>
                                <Select
                                    value={filters.platform || 'all'}
                                    onChange={e => handleFilterChange('platform', e.target.value === 'all' ? undefined : e.target.value)}
                                    className="w-[120px] h-9 text-sm"
                                >
                                    <option value="all">全部平台</option>
                                    <option value="xhs">小红书</option>
                                    <option value="dy">抖音</option>
                                    <option value="bili">B站</option>
                                    <option value="wb">微博</option>
                                    <option value="ks">快手</option>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">关键词/任务</span>
                                <Input
                                    placeholder="输入关键词或任务名..."
                                    className="w-[200px] h-9 text-sm"
                                    value={tempFilters.source_keyword || ''}
                                    onChange={e => setTempFilters(prev => ({ ...prev, source_keyword: e.target.value }))}
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">标题搜索</span>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="搜索标题内容..."
                                        className="w-[240px] h-9 text-sm pl-8"
                                        value={tempFilters.search || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, search: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Row 2: 发布时间筛选 */}
                        <div className="flex flex-wrap gap-4 items-end pt-3 border-t border-border/50">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">发布时间</span>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Input
                                            type="date"
                                            className="w-[140px] h-9 text-sm pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0"
                                            value={tempFilters.start_date || ''}
                                            onChange={e => setTempFilters(prev => ({ ...prev, start_date: e.target.value }))}
                                        />
                                        <Calendar className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                    <span className="text-muted-foreground text-sm">至</span>
                                    <div className="relative">
                                        <Input
                                            type="date"
                                            className="w-[140px] h-9 text-sm pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0"
                                            value={tempFilters.end_date || ''}
                                            onChange={e => setTempFilters(prev => ({ ...prev, end_date: e.target.value }))}
                                        />
                                        <Calendar className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            {/* 快捷时间按钮 */}
                            <div className="flex gap-1.5 ">
                                {timeShortcuts.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => applyDateShortcut(s.value, 'publish')}
                                        className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* 博主去重开关 */}
                            <div className="flex items-center space-x-2 ml-auto">
                                <input
                                    type="checkbox"
                                    id="dedup"
                                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 accel-checkbox"
                                    checked={filters.deduplicate_authors || false}
                                    onChange={(e) => handleFilterChange('deduplicate_authors', e.target.checked)}
                                />
                                <label htmlFor="dedup" className="text-xs font-medium leading-none text-muted-foreground select-none cursor-pointer">
                                    博主去重
                                </label>
                            </div>
                        </div>

                        {/* Row 3: 互动筛选 */}
                        <div className="flex flex-wrap gap-4 items-end pt-3 border-t border-border/50">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Heart className="w-3 h-3 text-rose-400" /> 点赞数
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number" placeholder="最小"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.min_likes || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, min_likes: parseInt(e.target.value) || undefined }))}
                                    />
                                    <span className="text-muted-foreground">-</span>
                                    <Input
                                        type="number" placeholder="最大"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.max_likes || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, max_likes: parseInt(e.target.value) || undefined }))}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3 text-blue-400" /> 评论数
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number" placeholder="最小"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.min_comments || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, min_comments: parseInt(e.target.value) || undefined }))}
                                    />
                                    <span className="text-muted-foreground">-</span>
                                    <Input
                                        type="number" placeholder="最大"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.max_comments || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, max_comments: parseInt(e.target.value) || undefined }))}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Share2 className="w-3 h-3 text-green-400" /> 分享数
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        type="number" placeholder="最小"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.min_shares || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, min_shares: parseInt(e.target.value) || undefined }))}
                                    />
                                    <span className="text-muted-foreground">-</span>
                                    <Input
                                        type="number" placeholder="最大"
                                        className="w-[100px] h-9 text-sm"
                                        value={tempFilters.max_shares || ''}
                                        onChange={e => setTempFilters(prev => ({ ...prev, max_shares: parseInt(e.target.value) || undefined }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Row 4: 操作按钮 - 放在最下面 */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                            <Button size="sm" variant="ghost" onClick={handleResetFilters}>
                                重置
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => window.open(getGrowHubExportUrl(filters), '_blank')}>
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                导出
                            </Button>
                            <Button size="sm" onClick={handleApplyFilters} className="px-6">
                                <Search className="w-3.5 h-3.5 mr-1.5" />
                                查询
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                            <Database className="w-4 h-4 mr-2 text-blue-500" />
                            总内容数
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.total.toLocaleString() || '-'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatNumber(stats?.alerts.total || 0)} 条预警内容
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border-pink-200/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                            <Heart className="w-4 h-4 mr-2 text-pink-500" />
                            总点赞数
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(stats?.total_likes || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            平均 {stats?.avg_likes} 赞/篇
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                            <MessageCircle className="w-4 h-4 mr-2 text-purple-500" />
                            总评论数
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(stats?.total_comments || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatNumber(stats?.total_collects || 0)} 收藏
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                            <Share2 className="w-4 h-4 mr-2 text-green-500" />
                            总分享数
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(stats?.total_shares || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatNumber(stats?.total_views || 0)} 阅读
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[380px]">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">✨ 趋势分析 (与筛选条件同步)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="total" name="发布量" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                <Line type="monotone" dataKey="alerts" name="预警量" stroke="#EF4444" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">🔥 Top 10 热门内容</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 w-full min-h-0 pb-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={topData}
                                margin={{ top: 10, right: 40, left: 0, bottom: 10 }}
                                barCategoryGap="15%"
                            >
                                <defs>
                                    <linearGradient id="topBarGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#8B5CF6" />
                                        <stop offset="100%" stopColor="#EC4899" />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    type="number"
                                    tick={{ fontSize: 11, fill: '#6B7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => value >= 10000 ? `${(value / 10000).toFixed(0)}万` : String(value)}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="title"
                                    width={180}
                                    tick={{ fontSize: 12, fill: '#E5E7EB', textAnchor: 'end' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value: string) => value.length > 14 ? value.slice(0, 14) + '...' : value}
                                />
                                <RechartsTooltip
                                    cursor={false}
                                    contentStyle={{
                                        background: 'rgba(30, 30, 40, 0.95)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                        padding: '10px 14px'
                                    }}
                                    labelStyle={{ fontWeight: 500, marginBottom: 4, color: '#F9FAFB' }}
                                    itemStyle={{ color: '#EC4899' }}
                                    formatter={(value: any) => {
                                        const v = Number(value) || 0;
                                        return [v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString(), '点赞数'];
                                    }}
                                />
                                <Bar
                                    dataKey="like_count"
                                    name="点赞数"
                                    fill="url(#topBarGradient)"
                                    radius={[0, 8, 8, 0]}
                                    background={false}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Data Table with ContentDataTable - 与数据分析模块保持完全一致 */}
            <div className="rounded-md border border-border bg-card overflow-hidden">
                <ContentDataTable
                    pageScroll
                    data={contents.map(item => {
                        // 处理图片列表
                        const imageList = item.media_urls || (item.cover_url ? [item.cover_url] : []);
                        const validImages = imageList.filter(Boolean);

                        // 判断是否为视频类型 (兼容处理: 如果有视频链接也视为视频)
                        const isVideo = item.content_type === 'video' || !!item.video_url;

                        // 解析标签
                        const tags: string[] = [];
                        if (item.source_keyword) tags.push(item.source_keyword);

                        return {
                            id: item.id || Math.random().toString(),
                            platform: item.platform,
                            author: {
                                name: item.author_name || '未知作者',
                                avatar: item.author_avatar,
                                id: item.author_id,
                                unique_id: item.author_unique_id,
                                url: getUserProfileUrl(item),
                                contact: item.author_contact,
                                ip_location: item.ip_location,
                                stats: (item.author_fans_count || item.author_follows_count || item.author_likes_count) ? {
                                    fans: item.author_fans_count,
                                    follows: item.author_follows_count,
                                    liked: item.author_likes_count
                                } : undefined
                            },
                            content: {
                                title: item.title || '(无标题)',
                                desc: item.description || '',
                                url: item.content_url,
                                tags: tags
                            },
                            media: {
                                cover: item.cover_url || (validImages.length > 0 ? validImages[0] : undefined),
                                type: isVideo ? 'video' : 'image',
                                video_url: item.video_url,  // 直接使用数据库中的 video_url
                                image_list: validImages
                            },
                            stats: {
                                liked: item.like_count || 0,
                                comments: item.comment_count || 0,
                                collected: item.collect_count || 0,
                                share: item.share_count || 0,
                                view: item.view_count || 0
                            },
                            meta: {
                                publish_time: item.publish_time ? new Date(item.publish_time).toLocaleString() : '-',
                                crawl_time: item.crawl_time ? new Date(item.crawl_time).toLocaleString() : '-',
                                source_keyword: item.source_keyword,
                                is_alert: item.is_alert,
                                alert_level: item.alert_level || undefined
                            }
                        };
                    })}
                    loading={loading}
                    total={total}
                    page={filters.page || 1}
                    pageSize={filters.page_size || 20}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                />
            </div>
        </div>
    );
};

// ==================== Main Data Management View ====================

const DataView: React.FC = () => {
    return (
        <div className="max-w-[1600px] mx-auto">
            <DataPoolTab />
        </div>
    );
};

export default DataView;


