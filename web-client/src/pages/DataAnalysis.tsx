import React, { useEffect, useState, useMemo } from 'react';
import { fetchDataFiles, fetchFileContent } from '@/api';
import type { DataFileInfo } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import { Loader2, Filter, TrendingUp, Users, Heart, MessageCircle, ChevronLeft, ChevronRight, ExternalLink, Share2, Star, Image as ImageIcon, Play, X, Video as VideoIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ContentDataTable } from '@/components/business/ContentDataTable';

// Common data interface trying to cover multiple platforms
interface MediaItem {
    title?: string;
    desc?: string;
    content?: string;
    nickname?: string;
    user_id?: string;
    avatar?: string;
    note_url?: string;
    video_url?: string;
    image_list?: string | any[];
    tag_list?: string | any[];
    liked_count?: string | number;
    comment_count?: string | number;
    collected_count?: string | number;
    share_count?: string | number;
    create_time?: number | string;
    last_modify_ts?: number;
    note_id?: string;
    aweme_id?: string;
    ip_location?: string;
    type?: string;
    contact_info?: string;
    [key: string]: any;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const DataAnalysis: React.FC = () => {
    const [files, setFiles] = useState<DataFileInfo[]>([]);
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [rawData, setRawData] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

    // Filters
    const [keyword, setKeyword] = useState('');
    const [minLikes, setMinLikes] = useState<number | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    useEffect(() => {
        fetchDataFiles(undefined, 'json').then(data => {
            setFiles(data);
            if (data.length > 0) {
                // Auto select first file if available
                // setSelectedFile(data[0].path);
            }
        });
    }, []);

    useEffect(() => {
        if (!selectedFile) return;
        setLoading(true);
        // Request a large limit to analyze most of the file
        fetchFileContent(selectedFile, true, 5000).then(res => {
            if (res.data && Array.isArray(res.data)) {
                setRawData(res.data);
            } else {
                setRawData([]);
            }
        }).catch(err => {
            console.error(err);
            setRawData([]);
        }).finally(() => {
            setLoading(false);
        });
    }, [selectedFile]);

    useEffect(() => {
        setCurrentPage(1);
    }, [keyword, minLikes, selectedFile]);

    // Derived Data
    const processedData = useMemo(() => {
        let data = rawData;

        // 1. Normalize and formatting
        data = data.map(item => {
            const newItem = { ...item };

            // 1.2 Unified Numeric Stats Mapping
            newItem.liked_count = Number(item.liked_count || item.like_cnt || item.attitudes_count || 0);
            newItem.comment_count = Number(item.comment_count || item.video_comment || item.comments_count || 0);
            newItem.collected_count = Number(item.collected_count || item.video_favorite_count || 0);
            newItem.share_count = Number(item.share_count || item.video_share_count || item.shared_count || 0); // shared_count from Weibo

            const viewCount = Number(item.view_count || item.video_play_count || item.viewd_count || 0);
            if (viewCount > 0) newItem.view_count = viewCount;

            // 1.3 Date Handling
            let ts = Number(newItem.create_time || 0);
            if (ts > 0 && ts < 10000000000) {
                ts = ts * 1000;
                newItem.create_time = ts;
            }

            // 1.4 Title/Desc Fallbacks
            if (!newItem.title) {
                // Kuaishou uses caption, Weibo uses content
                newItem.title = item.caption || item.content || item.desc || '(无标题)';
            }
            if (!newItem.desc) {
                newItem.desc = item.caption || item.content || item.title || '';
            }

            // 1.5 Video URL (Playable) vs Page URL
            // Douyin: video_download_url
            // Kuaishou: video_play_url
            if (!newItem.video_url) {
                if (item.video_download_url) newItem.video_url = item.video_download_url;
                else if (item.video_play_url) newItem.video_url = item.video_play_url;
            }

            // 1.6 Images
            if (!newItem.image_list) {
                if (item.note_download_url) {
                    newItem.image_list = item.note_download_url.split(',');
                } else if (item.video_cover_url) { // Bilibili/Kuaishou
                    newItem.image_list = [item.video_cover_url];
                } else if (item.cover_url) {
                    newItem.image_list = [item.cover_url];
                }
            }
            // Ensure image_list is array
            if ((!newItem.image_list || (Array.isArray(newItem.image_list) && newItem.image_list.length === 0)) && item.video_cover_url) {
                newItem.image_list = [item.video_cover_url];
            }

            // 1.7 Jump URL Normalization (Note URL)
            // Bilibili store saves page url in 'video_url', but we want it in note_url for jumping
            if (!newItem.note_url) {
                // If it's a Bilibili link (av/bv)
                if (item.video_url && (item.video_url.includes('bilibili.com') || item.video_url.includes('weibo.cn'))) {
                    newItem.note_url = item.video_url;
                    // If it's bilibili page link, do NOT use it as playable video_url
                    if (item.video_url.includes('bilibili.com') && !item.video_url.endsWith('.mp4')) {
                        newItem.video_url = undefined;
                    }
                }
            }

            // Map Author Stats (Douyin: user_fans, user_follows, user_likes)
            if (item.user_fans !== undefined || item.user_follows !== undefined || item.user_likes !== undefined) {
                newItem.author_stats = {
                    fans: item.user_fans || 0,
                    follows: item.user_follows || 0,
                    liked: item.user_likes || 0
                };
            }

            return newItem;
        });

        // 2. Filter
        if (keyword) {
            const k = keyword.toLowerCase();
            data = data.filter(item =>
                (item.title && item.title.toLowerCase().includes(k)) ||
                (item.desc && item.desc.toLowerCase().includes(k)) ||
                (item.content && item.content.toLowerCase().includes(k))
            );
        }

        if (minLikes !== '') {
            data = data.filter(item => (item.liked_count as number) >= Number(minLikes));
        }

        return data;

    }, [rawData, keyword, minLikes]);

    // Statistics
    const stats = useMemo(() => {
        const total = processedData.length;
        const totalLikes = processedData.reduce((acc, cur) => acc + (cur.liked_count as number), 0);
        const totalComments = processedData.reduce((acc, cur) => acc + (cur.comment_count as number), 0);
        const avgLikes = total > 0 ? Math.round(totalLikes / total) : 0;

        return { total, totalLikes, totalComments, avgLikes };
    }, [processedData]);

    // Charts Data
    const topPosts = useMemo(() => {
        return [...processedData]
            .sort((a, b) => (b.liked_count as number) - (a.liked_count as number))
            .slice(0, 10)
            .map(item => ({
                name: (item.title || item.desc || 'No Title').substring(0, 10) + '...',
                likes: item.liked_count,
                comments: item.comment_count
            }));
    }, [processedData]);

    // Helper to extract timestamp
    const getTs = (item: MediaItem) => {
        if (item.create_time) return new Date(item.create_time).getTime();
        if (item.last_modify_ts) return item.last_modify_ts;
        return 0;
    }

    const timelineData = useMemo(() => {
        const sorted = [...processedData].filter(i => getTs(i) > 0).sort((a, b) => getTs(a) - getTs(b));
        // Group by day
        const grouped: { [key: string]: number } = {};
        sorted.forEach(item => {
            const date = new Date(getTs(item)).toLocaleDateString();
            grouped[date] = (grouped[date] || 0) + 1;
        });

        return Object.entries(grouped).map(([date, count]) => ({ date, count }));
    }, [processedData]);

    const totalPages = Math.ceil(processedData.length / pageSize);
    const currentTableData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return processedData.slice(start, start + pageSize);
    }, [processedData, currentPage]);

    const getJumpUrl = (item: MediaItem) => {
        if (item.note_url) return item.note_url;
        if (item.note_id) return `https://www.xiaohongshu.com/explore/${item.note_id}`;
        if (item.aweme_id) return `https://www.douyin.com/video/${item.aweme_id}`;
        return '#';
    };

    const getFirstImage = (item: MediaItem) => {
        if (typeof item.image_list === 'string') {
            const imgs = item.image_list.split(',');
            return imgs[0] || '';
        }
        if (Array.isArray(item.image_list) && item.image_list.length > 0) {
            // handle object or string array
            const first = item.image_list[0];
            return typeof first === 'string' ? first : first?.url || '';
        }
        return '';
    };

    const parseTags = (item: MediaItem) => {
        if (!item.tag_list) return [];
        if (typeof item.tag_list === 'string') return item.tag_list.split(',').filter(t => t.trim());
        if (Array.isArray(item.tag_list)) return item.tag_list;
        return [];
    };


    const getUserProfileUrl = (item: MediaItem) => {
        if (!item.user_id) return '#';
        const isDouyin = item.note_url?.includes('douyin') || item.video_url?.includes('douyin') || item.aweme_id;
        const isBilibili = item.video_url?.includes('bilibili') || item.note_url?.includes('bilibili');
        const isWeibo = item.note_url?.includes('weibo') || item.video_url?.includes('weibo');
        const isKuaishou = item.video_url?.includes('kuaishou') || item.note_url?.includes('kuaishou') || (item.video_play_url && item.video_play_url.includes('kuaishou'));

        if (isDouyin) return `https://www.douyin.com/user/${item.user_id}`;
        if (isBilibili) return `https://space.bilibili.com/${item.user_id}`;
        if (isWeibo) return `https://weibo.com/u/${item.user_id}`;
        if (isKuaishou) return `https://www.kuaishou.com/profile/${item.user_id}`;

        return `https://www.xiaohongshu.com/user/profile/${item.user_id}`;
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-10">
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-lg border border-border items-end md:items-center shadow-sm">
                <div className="flex-1 w-full md:w-auto space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">选择数据文件 (JSON)</label>
                    <Select
                        value={selectedFile}
                        onChange={e => setSelectedFile(e.target.value)}
                        className="w-full"
                    >
                        <option value="" disabled>-- 请选择文件 --</option>
                        {files.filter(f => f.type === 'json').map(f => (
                            <option key={f.path} value={f.path}>{f.name} ({f.record_count}条)</option>
                        ))}
                    </Select>
                </div>

                <div className="flex-1 w-full md:w-auto space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">关键词过滤</label>
                    <div className="relative">
                        <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder="标题/内容..."
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="flex-1 w-full md:w-auto space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">最少点赞数</label>
                    <Input
                        type="number"
                        value={minLikes}
                        onChange={e => setMinLikes(e.target.value ? Number(e.target.value) : '')}
                        placeholder="0"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            ) : !selectedFile ? (
                <div className="text-center py-20 text-muted-foreground bg-card/50 rounded-lg border border-dashed border-border">
                    请从上方选择一个数据文件进行分析
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">总内容数</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.total}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">总点赞</CardTitle>
                                <Heart className="h-4 w-4 text-rose-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.totalLikes.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">总评论</CardTitle>
                                <MessageCircle className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.totalComments.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">平均点赞</CardTitle>
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.avgLikes.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Charts Row 1 */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="col-span-2 md:col-span-1">
                            <CardHeader>
                                <CardTitle>发布时间趋势</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timelineData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                        />
                                        <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} activeDot={{ r: 8 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="col-span-2 md:col-span-1">
                            <CardHeader>
                                <CardTitle>Top 10 解析 (点赞 & 评论)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topPosts}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="likes" name="点赞" fill="#fb7185" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="comments" name="评论" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detailed Data Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>详细数据列表</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ContentDataTable
                                data={currentTableData.map(item => {
                                    const imageList = Array.isArray(item.image_list)
                                        ? item.image_list
                                        : (item.image_list ? (item.image_list as string).split(',') : []);

                                    const validImages = imageList.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean);
                                    const isVideo = item.type === 'video' || !!item.video_url;
                                    const jumpUrl = getJumpUrl(item);

                                    return {
                                        id: item.note_id || item.aweme_id || Math.random().toString(),
                                        platform: item.type,
                                        author: {
                                            name: item.nickname || item.user_id || '-',
                                            avatar: item.avatar,
                                            id: item.user_id,
                                            url: getUserProfileUrl(item),
                                            contact: typeof item.contact_info === 'string' ? item.contact_info : (item.contact_info ? JSON.stringify(item.contact_info) : undefined),
                                            ip_location: item.ip_location,
                                            stats: item.author_stats ? {
                                                fans: item.author_stats.fans,
                                                follows: item.author_stats.follows,
                                                liked: item.author_stats.liked
                                            } : undefined
                                        },
                                        content: {
                                            title: item.title || '(无标题)',
                                            desc: item.desc || '',
                                            url: jumpUrl,
                                            tags: parseTags(item)
                                        },
                                        media: {
                                            cover: getFirstImage(item) || item.cover_url,
                                            type: isVideo ? 'video' : 'image',
                                            video_url: item.video_url,
                                            image_list: validImages
                                        },
                                        stats: {
                                            liked: Number(item.liked_count || 0),
                                            comments: Number(item.comment_count || 0),
                                            collected: Number(item.collected_count || 0),
                                            share: Number(item.share_count || 0),
                                            view: Number(item.view_count || 0)
                                        },
                                        meta: {
                                            publish_time: item.create_time ? new Date(item.create_time).toLocaleString() : '-',
                                        }
                                    };
                                })}
                                total={processedData.length}
                                page={currentPage}
                                pageSize={pageSize}
                                onPageChange={(p) => setCurrentPage(p)}
                            />
                        </CardContent>
                    </Card>
                </>
            )}

        </div>
    );
};

export default DataAnalysis;
