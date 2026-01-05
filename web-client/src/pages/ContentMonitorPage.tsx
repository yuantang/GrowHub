import React, { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle, TrendingUp, Eye, MessageCircle, Heart, Share2,
    RefreshCw, CheckCircle,
    ThumbsDown, Minus, ThumbsUp, Bell, Search, Wifi, WifiOff
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useGrowHubWebSocket } from '@/hooks/useGrowHubWebSocket';

const API_BASE = 'http://localhost:8080/api';

interface ContentItem {
    id: number;
    platform: string;
    content_type: string;
    title: string;
    description: string;
    author_name: string;
    like_count: number;
    comment_count: number;
    share_count: number;
    view_count: number;
    engagement_rate: number;
    category: string;
    sentiment: string;
    is_alert: boolean;
    alert_level: string | null;
    is_handled: boolean;
    publish_time: string | null;
    crawl_time: string;
}

interface ContentStats {
    total: number;
    by_platform: Record<string, number>;
    by_sentiment: Record<string, number>;
    by_category: Record<string, number>;
    alerts: { total: number; unhandled: number };
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
    douyin: { label: '抖音', color: 'bg-pink-500/20 text-pink-400' },
    xiaohongshu: { label: '小红书', color: 'bg-red-500/20 text-red-400' },
    bilibili: { label: 'B站', color: 'bg-blue-500/20 text-blue-400' },
    weibo: { label: '微博', color: 'bg-orange-500/20 text-orange-400' },
    zhihu: { label: '知乎', color: 'bg-sky-500/20 text-sky-400' },
};

const SENTIMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    positive: { label: '正面', icon: ThumbsUp, color: 'text-green-400' },
    neutral: { label: '中性', icon: Minus, color: 'text-gray-400' },
    negative: { label: '负面', icon: ThumbsDown, color: 'text-red-400' },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
    sentiment: { label: '舆情', color: 'bg-red-500/20 text-red-400' },
    hotspot: { label: '热点', color: 'bg-orange-500/20 text-orange-400' },
    competitor: { label: '竞品', color: 'bg-purple-500/20 text-purple-400' },
    influencer: { label: '达人', color: 'bg-blue-500/20 text-blue-400' },
    general: { label: '普通', color: 'bg-gray-500/20 text-gray-400' },
};

const ALERT_LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
    low: { label: '低', color: 'bg-yellow-500/20 text-yellow-400' },
    medium: { label: '中', color: 'bg-orange-500/20 text-orange-400' },
    high: { label: '高', color: 'bg-red-500/20 text-red-400' },
    critical: { label: '紧急', color: 'bg-red-600/30 text-red-300' },
};

const ContentMonitorPage: React.FC = () => {
    const [contents, setContents] = useState<ContentItem[]>([]);
    const [stats, setStats] = useState<ContentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'alerts'>('all');

    // Filters
    const [platform, setPlatform] = useState('');
    const [sentiment, setSentiment] = useState('');
    const [category, setCategory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [alertHandled, setAlertHandled] = useState<boolean | null>(null);

    const [analyzeText, setAnalyzeText] = useState('');
    const [analyzeResult, setAnalyzeResult] = useState<any>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const fetchContents = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (platform) params.append('platform', platform);
            if (sentiment) params.append('sentiment', sentiment);
            if (category) params.append('category', category);
            if (searchTerm) params.append('search', searchTerm);
            if (activeTab === 'alerts') params.append('is_alert', 'true');
            if (alertHandled !== null) params.append('is_handled', String(alertHandled));
            params.append('page_size', '50');

            const response = await fetch(`${API_BASE}/growhub/content/list?${params}`);
            const data = await response.json();
            setContents(data.items || []);
        } catch (error) {
            console.error('Failed to fetch contents:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/content/stats`);
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    // WebSocket for real-time alerts
    const { isConnected, lastMessage } = useGrowHubWebSocket({
        channel: 'alerts',
        onMessage: useCallback((msg: any) => {
            if (msg.type === 'new_alert' && msg.data) {
                // Show toast notification logic here (omitted for simplicity, can alert or console)
                console.log('New alert received:', msg.data);

                // Refresh list if we are watching all or alerts
                fetchContents();
                fetchStats();
            }
        }, [])
    });

    useEffect(() => {
        fetchContents();
        fetchStats();
    }, [platform, sentiment, category, activeTab, alertHandled]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContents();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleMarkHandled = async (contentId: number) => {
        try {
            await fetch(`${API_BASE}/growhub/content/alerts/${contentId}/handle`, {
                method: 'POST',
            });
            fetchContents();
            fetchStats();
        } catch (error) {
            console.error('Failed to mark handled:', error);
        }
    };

    const analyzeContent = async () => {
        if (!analyzeText.trim()) return;

        setAnalyzing(true);
        try {
            const response = await fetch(`${API_BASE}/growhub/content/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: analyzeText }),
            });
            const result = await response.json();
            setAnalyzeResult(result);
        } catch (error) {
            console.error('Failed to analyze:', error);
            alert('分析失败');
        } finally {
            setAnalyzing(false);
        }
    };

    const formatNumber = (num: number) => {
        if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return String(num);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        内容监控
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-normal border transition-colors ${isConnected
                            ? 'bg-green-500/10 border-green-500/20 text-green-500'
                            : 'bg-red-500/10 border-red-500/20 text-red-500'
                            }`}>
                            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            {isConnected ? '实时监控已连接' : '已断开'}
                        </span>
                    </h1>
                    <p className="text-muted-foreground mt-1">实时监控多平台内容，智能识别舆情预警</p>
                </div>
                <Button onClick={fetchContents}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-5 gap-4">
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">总内容数</p>
                                    <p className="text-2xl font-bold">{formatNumber(stats.total)}</p>
                                </div>
                                <Eye className="w-8 h-8 text-primary/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">正面内容</p>
                                    <p className="text-2xl font-bold text-green-400">{stats.by_sentiment.positive || 0}</p>
                                </div>
                                <ThumbsUp className="w-8 h-8 text-green-500/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">负面内容</p>
                                    <p className="text-2xl font-bold text-red-400">{stats.by_sentiment.negative || 0}</p>
                                </div>
                                <ThumbsDown className="w-8 h-8 text-red-500/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`${stats.alerts.unhandled > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-card/50'}`}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">待处理预警</p>
                                    <p className={`text-2xl font-bold ${stats.alerts.unhandled > 0 ? 'text-red-400' : ''}`}>
                                        {stats.alerts.unhandled}
                                    </p>
                                </div>
                                <AlertTriangle className={`w-8 h-8 ${stats.alerts.unhandled > 0 ? 'text-red-500 animate-pulse' : 'text-muted-foreground/50'}`} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">热点内容</p>
                                    <p className="text-2xl font-bold text-orange-400">{stats.by_category.hotspot || 0}</p>
                                </div>
                                <TrendingUp className="w-8 h-8 text-orange-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tabs & Filters */}
            <Card className="bg-card/50">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Tabs */}
                            <div className="flex bg-muted/30 rounded-lg p-1">
                                <button
                                    onClick={() => setActiveTab('all')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-background text-foreground' : 'text-muted-foreground'
                                        }`}
                                >
                                    全部内容
                                </button>
                                <button
                                    onClick={() => setActiveTab('alerts')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'alerts' ? 'bg-background text-foreground' : 'text-muted-foreground'
                                        }`}
                                >
                                    <Bell className="w-4 h-4" />
                                    舆情预警
                                    {stats?.alerts.unhandled ? (
                                        <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                                            {stats.alerts.unhandled}
                                        </span>
                                    ) : null}
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="搜索内容..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm w-64"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                                className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                            >
                                <option value="">全部平台</option>
                                {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
                                    <option key={key} value={key}>{cfg.label}</option>
                                ))}
                            </select>

                            <select
                                value={sentiment}
                                onChange={(e) => setSentiment(e.target.value)}
                                className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                            >
                                <option value="">全部情感</option>
                                <option value="positive">正面</option>
                                <option value="neutral">中性</option>
                                <option value="negative">负面</option>
                            </select>

                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                            >
                                <option value="">全部分类</option>
                                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                                    <option key={key} value={key}>{cfg.label}</option>
                                ))}
                            </select>

                            {activeTab === 'alerts' && (
                                <select
                                    value={alertHandled === null ? '' : String(alertHandled)}
                                    onChange={(e) => setAlertHandled(e.target.value === '' ? null : e.target.value === 'true')}
                                    className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                >
                                    <option value="">全部状态</option>
                                    <option value="false">待处理</option>
                                    <option value="true">已处理</option>
                                </select>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Content List */}
            <div className="space-y-3">
                {loading ? (
                    <Card className="bg-card/50">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            加载中...
                        </CardContent>
                    </Card>
                ) : contents.length === 0 ? (
                    <Card className="bg-card/50">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            暂无内容数据
                        </CardContent>
                    </Card>
                ) : (
                    contents.map((item) => {
                        const platformCfg = PLATFORM_CONFIG[item.platform] || { label: item.platform, color: 'bg-gray-500/20 text-gray-400' };
                        const sentimentCfg = SENTIMENT_CONFIG[item.sentiment] || SENTIMENT_CONFIG.neutral;
                        const SentimentIcon = sentimentCfg.icon;
                        const categoryCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.general;
                        const alertCfg = item.alert_level ? ALERT_LEVEL_CONFIG[item.alert_level] : null;

                        return (
                            <Card
                                key={item.id}
                                className={`bg-card/50 hover:bg-card/80 transition-colors ${item.is_alert && !item.is_handled ? 'border-red-500/30' : ''
                                    }`}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        {/* Left: Platform & Sentiment */}
                                        <div className="flex flex-col items-center gap-2">
                                            <span className={`px-2 py-1 text-xs rounded ${platformCfg.color}`}>
                                                {platformCfg.label}
                                            </span>
                                            <SentimentIcon className={`w-5 h-5 ${sentimentCfg.color}`} />
                                        </div>

                                        {/* Middle: Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-medium text-sm line-clamp-1">
                                                        {item.title || '(无标题)'}
                                                    </h3>
                                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                        {item.description || '暂无描述'}
                                                    </p>
                                                </div>

                                                {/* Alert Badge */}
                                                {item.is_alert && alertCfg && (
                                                    <span className={`shrink-0 px-2 py-1 text-xs rounded flex items-center gap-1 ${alertCfg.color}`}>
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {alertCfg.label}级预警
                                                    </span>
                                                )}
                                            </div>

                                            {/* Meta */}
                                            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                                <span>@{item.author_name || '未知'}</span>
                                                <span className={`px-1.5 py-0.5 rounded ${categoryCfg.color}`}>
                                                    {categoryCfg.label}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Heart className="w-3 h-3" /> {formatNumber(item.like_count)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MessageCircle className="w-3 h-3" /> {formatNumber(item.comment_count)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Share2 className="w-3 h-3" /> {formatNumber(item.share_count)}
                                                </span>
                                                {item.view_count > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Eye className="w-3 h-3" /> {formatNumber(item.view_count)}
                                                    </span>
                                                )}
                                                <span className="ml-auto">{formatDate(item.crawl_time)}</span>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex items-center gap-2">
                                            {item.is_alert && !item.is_handled && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleMarkHandled(item.id)}
                                                    className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                                                >
                                                    <CheckCircle className="w-4 h-4 mr-1" />
                                                    标记已处理
                                                </Button>
                                            )}
                                            {item.is_alert && item.is_handled && (
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                                    已处理
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* AI Analyze Section */}
            <Card className="bg-card/50">
                <CardHeader>
                    <CardTitle className="text-lg">🤖 AI内容分析</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <textarea
                            value={analyzeText}
                            onChange={(e) => setAnalyzeText(e.target.value)}
                            placeholder="输入任意文本内容，AI将自动分析情感倾向、分类和是否需要预警..."
                            className="w-full px-4 py-3 bg-background border border-border rounded-lg h-32 resize-none"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Button onClick={analyzeContent} disabled={analyzing || !analyzeText.trim()}>
                            {analyzing ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    分析中...
                                </>
                            ) : (
                                '开始分析'
                            )}
                        </Button>

                        {analyzeResult && (
                            <div className="flex items-center gap-4 text-sm">
                                <span className="flex items-center gap-1">
                                    情感:
                                    <span className={SENTIMENT_CONFIG[analyzeResult.sentiment]?.color}>
                                        {SENTIMENT_CONFIG[analyzeResult.sentiment]?.label}
                                    </span>
                                    ({analyzeResult.sentiment_score?.toFixed(2)})
                                </span>
                                <span>分类: {CATEGORY_CONFIG[analyzeResult.category]?.label}</span>
                                {analyzeResult.is_alert && (
                                    <span className="text-red-400 flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        需要预警: {analyzeResult.alert_reason}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ContentMonitorPage;
