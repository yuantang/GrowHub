import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    fetchProject,
    fetchProjectContents,
    fetchProjectStatsChart,
    updateProject,
    fetchAIKeywords,
} from '@/api';
import type {
    Project,
    ProjectContentItem,
    ProjectStatsChartResponse
} from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
    Loader2,
    ArrowLeft,
    Settings,
    RefreshCw,
    MessageCircle,
    Play,
    TrendingUp,
    PieChart as PieChartIcon,
    BarChart3,
    Terminal,
    Sparkles,
    AlertTriangle,
    Save,
    Search,
    MessageSquare,
    Zap,
    Users
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '@/utils';
import { ContentDataTable } from '@/components/business/ContentDataTable';
import { Input } from '@/components/ui/Input';

// Clean Number Input Helper
const CleanNumberInput = ({ value, onChange, placeholder, className }: { 
    value: number | string; 
    onChange: (val: number) => void; 
    placeholder?: string;
    className?: string;
}) => {
    const isZero = (v: number | string) => Number(v) === 0;
    const [localValue, setLocalValue] = useState<string>(isZero(value) ? '' : String(value));

    useEffect(() => {
        if (isZero(value)) {
            if (localValue !== '') setLocalValue('');
        } else {
            if (String(value) !== localValue) {
                setLocalValue(String(value));
            }
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setLocalValue('');
            onChange(0);
            return;
        }
        if (!/^\d+$/.test(val)) return;
        const num = parseInt(val, 10);
        if (num === 0) {
            setLocalValue('');
            onChange(0);
        } else {
            setLocalValue(String(num));
            onChange(num);
        }
    };

    return (
        <Input
            value={localValue}
            onChange={handleChange}
            placeholder={placeholder}
            className={className}
        />
    );
};

// Platform Map
const PLATFORM_MAP: Record<string, { label: string; icon: string; color: string }> = {
    xhs: { label: '小红书', icon: '📕', color: 'bg-red-500/10 text-red-500' },
    douyin: { label: '抖音', icon: '🎵', color: 'bg-slate-500/20 text-slate-300' },
    bilibili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    weibo: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    kuaishou: { label: '快手', icon: '📹', color: 'bg-yellow-500/10 text-yellow-500' },
    zhihu: { label: '知乎', icon: '❓', color: 'bg-blue-500/10 text-blue-500' },
    // Aliases to safely handle legacy data
    dy: { label: '抖音', icon: '🎵', color: 'bg-slate-500/20 text-slate-300' },
    bili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    wb: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    ks: { label: '快手', icon: '📹', color: 'bg-yellow-500/10 text-yellow-500' },
};

// Chart Colors
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// AI Keyword Suggest Component
const AIKeywordSuggest: React.FC<{ onSelect: (keywords: string[]) => void }> = ({ onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [target, setTarget] = useState('');
    const [mode, setMode] = useState<'risk' | 'trend'>('risk');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selected, setSelected] = useState<string[]>([]);

    const handleAnalyze = async () => {
        if (!target.trim()) return;
        setLoading(true);
        try {
            const keywords = await fetchAIKeywords(target, mode, 'google/gemini-2.0-flash-exp:free');
            if (keywords && keywords.length > 0) {
                setSuggestions(keywords);
                setSelected(keywords.slice(0, 5));
            } else {
                const fallback = mode === 'risk'
                    ? [`${target} 差评`, `${target} 避雷`, `${target} 假货`, `${target} 吐槽`, `${target} 踩坑`, `${target} 退款`, `${target} 质量差`, `${target} 不推荐`]
                    : [`${target} 测评`, `${target} 推荐`, `${target} 好用`, `${target} 教程`, `${target} 种草`, `${target} 攻略`, `${target} 分享`, `${target} 体验`];
                setSuggestions(fallback);
                setSelected(fallback.slice(0, 5));
            }
        } catch (e) {
            console.error('AI analysis failed:', e);
            const fallback = mode === 'risk'
                ? [`${target} 差评`, `${target} 避雷`, `${target} 问题`, `${target} 吐槽`, `${target} 踩坑`]
                : [`${target} 测评`, `${target} 推荐`, `${target} 好用`, `${target} 教程`, `${target} 种草`];
            setSuggestions(fallback);
            setSelected(fallback.slice(0, 3));
        } finally {
            setLoading(false);
        }
    };

    const toggleKeyword = (kw: string) => {
        setSelected(prev =>
            prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]
        );
    };

    const handleConfirm = () => {
        onSelect(selected);
        setIsOpen(false);
        setTarget('');
        setSuggestions([]);
        setSelected([]);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="text-xs px-2 py-1 rounded bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 flex items-center gap-1 transition-colors"
            >
                <Sparkles className="w-3 h-3" />
                AI 智能联想
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md shadow-2xl border border-border">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-violet-500" />
                            AI 关键词联想
                        </h3>

                        {suggestions.length === 0 ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">输入品牌/产品名</label>
                                    <input
                                        type="text"
                                        value={target}
                                        onChange={e => setTarget(e.target.value)}
                                        placeholder="如：SK-II 神仙水、iPhone 16"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">联想模式</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMode('risk')}
                                            className={cn("flex-1 px-3 py-2 rounded-lg border text-sm transition-colors", mode === 'risk' ? "bg-rose-500/10 border-rose-500 text-rose-600" : "bg-background border-border")}
                                        >
                                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                                            舆情预警词
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMode('trend')}
                                            className={cn("flex-1 px-3 py-2 rounded-lg border text-sm transition-colors", mode === 'trend' ? "bg-purple-500/10 border-purple-500 text-purple-600" : "bg-background border-border")}
                                        >
                                            <TrendingUp className="w-4 h-4 inline mr-1" />
                                            热点趋势词
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                                        取消
                                    </Button>
                                    <Button
                                        onClick={handleAnalyze}
                                        disabled={!target.trim() || loading}
                                        className="flex-1 bg-violet-600 hover:bg-violet-700"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                                        {loading ? '分析中...' : '开始联想'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    基于 <span className="font-medium text-foreground">{target}</span> 联想的
                                    {mode === 'risk' ? '舆情预警' : '热点趋势'}关键词：
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {suggestions.map(kw => (
                                        <button
                                            key={kw}
                                            onClick={() => toggleKeyword(kw)}
                                            className={cn("px-3 py-1.5 rounded-full text-sm border transition-colors", selected.includes(kw) ? "bg-violet-500 text-white border-violet-500" : "bg-background border-border hover:border-violet-300")}
                                        >
                                            {kw}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-2 pt-4 border-t border-border mt-2">
                                    <Button variant="outline" onClick={() => { setSuggestions([]); setTarget(''); }} className="flex-1">
                                        重试
                                    </Button>
                                    <Button onClick={handleConfirm} className="flex-1 bg-violet-600 hover:bg-violet-700">
                                        确认添加 ({selected.length})
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

const ProjectDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projectId = Number(id);

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [statsChart, setStatsChart] = useState<ProjectStatsChartResponse | null>(null);
    const [contents, setContents] = useState<ProjectContentItem[]>([]);
    const [contentsLoading, setContentsLoading] = useState(false);
    const [contentsPage, setContentsPage] = useState(1);
    const [contentsTotal, setContentsTotal] = useState(0);
    const [deduplicateAuthors, setDeduplicateAuthors] = useState(false);

    // Edit Form State (local state for Settings tab)
    const [editForm, setEditForm] = useState<Partial<Project>>({});
    const [keywordsStr, setKeywordsStr] = useState('');
    const [sentimentKeywordsStr, setSentimentKeywordsStr] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState("dashboard");

    // Sync project data to editForm
    useEffect(() => {
        if (project) {
            setEditForm(JSON.parse(JSON.stringify(project)));
            setKeywordsStr((project.keywords || []).join(', '));
            setSentimentKeywordsStr((project.sentiment_keywords || []).join(', '));
        }
    }, [project]);

    // Poll logs
    useEffect(() => {
        if (activeTab === 'logs' && projectId) {
            loadLogs();
            const interval = setInterval(loadLogs, 3000);
            return () => clearInterval(interval);
        }
    }, [activeTab, projectId]);

    const loadLogs = async () => {
        try {
            const res = await fetch(`/api/growhub/projects/${projectId}/logs`);
            const data = await res.json();
            if (data.logs) {
                setLogs(data.logs);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (!projectId) return;
        loadProjectData();
    }, [projectId]);

    const loadProjectData = async () => {
        try {
            setLoading(true);
            const data = await fetchProject(projectId);
            setProject(data);
            setDeduplicateAuthors(data.deduplicate_authors || false);
            const chartData = await fetchProjectStatsChart(projectId, 7);
            setStatsChart(chartData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (project) {
            loadContents();
        }
    }, [project, contentsPage, deduplicateAuthors]);

    const loadContents = async () => {
        try {
            setContentsLoading(true);
            const res = await fetchProjectContents(projectId, contentsPage, 20, { deduplicate_authors: deduplicateAuthors });
            setContents(res.items);
            setContentsTotal(res.total);
        } catch (err) {
            console.error(err);
        } finally {
            setContentsLoading(false);
        }
    };

    const handleRefresh = () => {
        loadProjectData();
        loadContents();
    };

    const handleSaveEdit = async () => {
        if (!project) return;
        setIsSaving(true);
        try {
            const platformNormalize: Record<string, string> = {
                "douyin": "dy",
                "bilibili": "bili",
                "weibo": "wb",
                "kuaishou": "ks",
                "xhs": "xhs",
                "dy": "dy",
                "bili": "bili",
                "wb": "wb",
                "ks": "ks",
                "zhihu": "zhihu"
            };

            const payload = {
                ...editForm,
                // Parse string inputs back to arrays
                keywords: keywordsStr.split(/[,，\n\s]+/).map(k => k.trim()).filter(Boolean),
                sentiment_keywords: sentimentKeywordsStr.split(/[,，\n\s]+/).map(k => k.trim()).filter(Boolean),
                // Normalize and deduplicate platforms
                platforms: Array.from(new Set((editForm.platforms || []).map(p => platformNormalize[p] || p)))
            };
            // Ensure numeric fields are numbers
            payload.crawl_limit = Number(payload.crawl_limit || 20);
            payload.crawl_date_range = Number(payload.crawl_date_range || 1);
            
            await updateProject(projectId, payload);
            await loadProjectData();
            // Optional: Success message or Toast could be added here
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    if (!project) {
        return <div className="text-center py-20">项目不存在</div>;
    }

    const trendData = statsChart?.dates.map((date, i) => ({
        date,
        positive: statsChart.sentiment_trend.positive[i],
        neutral: statsChart.sentiment_trend.neutral[i],
        negative: statsChart.sentiment_trend.negative[i],
    })) || [];

    const platformsList = ['xhs', 'douyin', 'bilibili', 'weibo', 'kuaishou', 'zhihu'];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> 返回
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {project.name}
                            <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full border",
                                project.is_active
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-gray-50 text-gray-600 border-gray-200"
                            )}>
                                {project.is_active ? '运行中' : '已停止'}
                            </span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                            <span>关键词: {project.keywords.join(", ")}</span>
                            {project.sentiment_keywords && project.sentiment_keywords.length > 0 && (
                                <span className="flex items-center gap-1 text-amber-500/80">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {(project.sentiment_keywords || []).join(", ")}
                                </span>
                            )}
                            <span className="text-muted-foreground/30">|</span>
                            <span>平台: {
                                Array.from(new Set(project.platforms.map(p => PLATFORM_MAP[p]?.label || p))).join(", ")
                            }</span>
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={async () => {
                            try {
                                await fetch(`/api/growhub/projects/${projectId}/run`, { method: 'POST' });
                                alert('任务已启动！可在"内容列表"中查看新抓取的内容。');
                                loadProjectData();
                            } catch (e) { console.error(e); }
                        }}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Play className="h-4 w-4 mr-1" /> 立即执行
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-1" /> 刷新
                    </Button>
                </div>
            </div>

            {/* Main Tabs */}
            <Tabs defaultValue="dashboard" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                    <TabsTrigger value="dashboard" className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" /> 数据大屏
                    </TabsTrigger>
                    <TabsTrigger value="content" className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" /> 内容列表
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="flex items-center gap-2">
                        <Terminal className="h-4 w-4" /> 运行日志
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" /> 设置
                    </TabsTrigger>
                </TabsList>

                {/* Dashboard */}
                <TabsContent value="dashboard" className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">累计抓取</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{project.total_crawled.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground mt-1">今日 +{project.today_crawled}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">累计预警</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-rose-600">{project.total_alerts.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground mt-1">今日 +{project.today_alerts}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">运行次数</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{project.run_count}</div>
                                <p className="text-xs text-muted-foreground mt-1">下次: {project.next_run_at ? new Date(project.next_run_at).toLocaleTimeString() : '-'}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">任务配置概要</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold truncate">{project.crawler_type === 'search' ? '综合搜索' : project.crawler_type === 'detail' ? '详情抓取' : '博主主页'}</div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    关键词: {project.keywords.join(", ")}
                                    {project.sentiment_keywords && project.sentiment_keywords.length > 0 && ` | 舆情: ${project.sentiment_keywords.join(", ")}`}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    监控: {Array.from(new Set(project.platforms.map(p => PLATFORM_MAP[p]?.label || p))).join(", ")} | 限量: {project.crawl_limit}条 | 范围: {project.crawl_date_range || '不限'}天
                                </p>
                            </CardContent>
                        </Card>
                        {project.latest_checkpoint && (
                            <Card className="border-primary/20 bg-primary/5">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm font-medium text-primary">当前任务进度</CardTitle>
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded-full",
                                            project.latest_checkpoint.status === 'running' ? "bg-blue-100 text-blue-700 animate-pulse" : 
                                            project.latest_checkpoint.status === 'completed' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                                        )}>
                                            {project.latest_checkpoint.status === 'running' ? '运行中' : 
                                                project.latest_checkpoint.status === 'completed' ? '已完成' : '已暂停'}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-2xl font-bold text-primary">{project.latest_checkpoint.total_notes} <span className="text-xs font-normal text-muted-foreground">条内容</span></div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                页码: {project.latest_checkpoint.current_page} | 评论: {project.latest_checkpoint.total_comments}
                                            </p>
                                        </div>
                                        {project.latest_checkpoint.total_errors > 0 && (
                                            <div className="text-xs text-rose-500 font-medium flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> {project.latest_checkpoint.total_errors} 错误
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="col-span-2">
                            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> 7日情感趋势</CardTitle></CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="neutral" name="中性" stroke="#8884d8" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="positive" name="正面" stroke="#00C49F" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="negative" name="负面" stroke="#FF8042" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="col-span-1">
                            <CardHeader><CardTitle className="flex items-center gap-2"><PieChartIcon className="h-4 w-4" /> 平台分布</CardTitle></CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={statsChart?.platform_dist || []} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                            {(statsChart?.platform_dist || []).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Content List */}
                <TabsContent value="content">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>监控内容列表 ({contentsTotal})</CardTitle>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center space-x-2 mr-2">
                                    <input type="checkbox" id="content_dedup" className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4" checked={deduplicateAuthors} onChange={(e) => setDeduplicateAuthors(e.target.checked)} />
                                    <label htmlFor="content_dedup" className="text-xs text-muted-foreground select-none cursor-pointer">博主去重</label>
                                </div>
                                <Button size="sm" variant="outline" onClick={loadContents} disabled={contentsLoading}>
                                    <RefreshCw className={cn("h-4 w-4", contentsLoading && "animate-spin")} />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ContentDataTable
                                data={contents.map(item => {
                                    const imageList = item.media_urls || (item.cover_url ? [item.cover_url] : []);
                                    const validImages = imageList.filter(Boolean);
                                    const isVideo = item.content_type === 'video';
                                    return {
                                        id: item.id || Math.random().toString(),
                                        platform: item.platform,
                                        author: { 
                                            name: item.author || '未知作者', 
                                            avatar: item.author_avatar,
                                            id: item.author_id,
                                            unique_id: item.author_unique_id,
                                            stats: {
                                                fans: item.author_fans,
                                                liked: item.author_likes
                                            }
                                        },
                                        content: { title: item.title || '(无标题)', desc: item.description || '', url: item.url, tags: item.source_keyword ? [item.source_keyword] : [] },
                                        media: { cover: item.cover_url || (validImages.length > 0 ? validImages[0] : undefined), type: isVideo ? 'video' : 'image', video_url: item.video_url, image_list: validImages },
                                        stats: { liked: item.like_count || 0, comments: item.comment_count || 0, collected: item.collect_count || 0, share: item.share_count || 0, view: item.view_count || 0 },
                                        meta: { publish_time: item.publish_time ? new Date(item.publish_time).toLocaleString() : '-', crawl_time: item.crawl_time ? new Date(item.crawl_time).toLocaleString() : '-', source_keyword: item.source_keyword, is_alert: item.is_alert }
                                    };
                                })}
                                loading={contentsLoading}
                                total={contentsTotal}
                                page={contentsPage}
                                pageSize={20}
                                onPageChange={setContentsPage}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Logs */}
                <TabsContent value="logs">
                    <Card className="bg-slate-950 border-slate-800 text-slate-50">
                        <CardHeader className="border-b border-slate-800 pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-mono flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-green-500" /> Live Execution Logs
                                </CardTitle>
                                <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-slate-800 hover:text-white" onClick={loadLogs}>
                                    <RefreshCw className="w-3 h-3 mr-1" /> 刷新
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="h-[500px] overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-slate-950">
                                {logs.length === 0 ? (
                                    <div className="text-slate-500 italic">暂无日志数据 / 等待任务启动...</div>
                                ) : logs.map((log, i) => (
                                    <div key={i} className="whitespace-pre-wrap break-words border-b border-white/5 pb-1 mb-1 last:border-0 hover:bg-white/10 leading-relaxed transition-colors">
                                        <span className="text-slate-500 mr-2 shrink-0">{log.substring(0, 21)}</span>
                                        <span className={cn(
                                            "inline-block",
                                            log.includes("❌") ? "text-red-400" : 
                                            log.includes("✅") ? "text-green-400" : 
                                            log.includes("⚠️") ? "text-yellow-400" : 
                                            log.includes("🚀") ? "text-blue-400" : 
                                            log.includes("📊") ? "text-cyan-400 font-bold" :
                                            log.includes("🏁") ? "text-emerald-400 font-bold" :
                                            "text-slate-300"
                                        )}>
                                            {log.substring(21)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Settings Tab - Unified Form */}
                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-indigo-500" />
                                项目配置
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-5 max-w-3xl">
                                {/* Name */}
                                <div>
                                    <label className="text-sm font-medium mb-2 block">项目名称 *</label>
                                    <input
                                        type="text"
                                        value={editForm.name || ''}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        placeholder="如：品牌舆情监控"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    />
                                </div>
                                {/* Description */}
                                <div>
                                    <label className="text-sm font-medium mb-2 block">项目描述</label>
                                    <input
                                        type="text"
                                        value={editForm.description || ''}
                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                        placeholder="可选的项目说明..."
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    />
                                </div>
                                
                                {/* Keywords */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium">
                                            监控关键词 *
                                            <span className="text-muted-foreground font-normal ml-2">多个关键词用逗号或空格分隔</span>
                                        </label>
                                        <AIKeywordSuggest
                                            onSelect={(keywords) => {
                                                const current = keywordsStr ? keywordsStr + ', ' : '';
                                                setKeywordsStr(current + keywords.join(', '));
                                            }}
                                        />
                                    </div>
                                    <textarea
                                        value={keywordsStr}
                                        onChange={e => setKeywordsStr(e.target.value)}
                                        placeholder="品牌A, 竞品B, 行业热词..."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none"
                                    />
                                </div>

                                {/* Sentiment Keywords */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium">
                                            舆情及预警敏感词
                                            <span className="text-muted-foreground font-normal ml-2 text-xs">匹配后标记为预警，按重要程度排序</span>
                                        </label>
                                        <AIKeywordSuggest
                                            onSelect={(keywords) => {
                                                const current = sentimentKeywordsStr ? sentimentKeywordsStr + ', ' : '';
                                                setSentimentKeywordsStr(current + keywords.join(', '));
                                            }}
                                        />
                                    </div>
                                    <textarea
                                        value={sentimentKeywordsStr}
                                        onChange={e => setSentimentKeywordsStr(e.target.value)}
                                        placeholder="价格太贵, 质量不好, 虚假宣传, 避雷..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none text-sm"
                                    />
                                </div>

                                {/* Platforms */}
                                <div>
                                    <label className="text-sm font-medium mb-2 block">监控平台 *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {platformsList.map(key => {
                                            const p = PLATFORM_MAP[key] || { label: key, icon: '📱', color: '' };
                                            const isActive = (editForm.platforms || []).includes(key);
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = editForm.platforms || [];
                                                        const updated = current.includes(key)
                                                            ? current.filter(x => x !== key)
                                                            : [...current, key];
                                                        setEditForm({ ...editForm, platforms: updated });
                                                    }}
                                                    className={cn(
                                                        "px-3 py-2 rounded-lg border transition-colors flex items-center gap-2",
                                                        isActive
                                                            ? "bg-primary/10 border-primary text-primary"
                                                            : "bg-background border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    <span>{p.icon}</span> {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Schedule */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">调度方式</label>
                                        <select
                                            value={editForm.schedule_type || 'interval'}
                                            onChange={e => setEditForm({ ...editForm, schedule_type: e.target.value })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        >
                                            <option value="interval">固定间隔</option>
                                            <option value="cron">Cron 表达式</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">
                                            {editForm.schedule_type === 'interval' ? '执行频率' : 'Cron 表达式'}
                                        </label>
                                        {editForm.schedule_type === 'interval' ? (
                                            <select
                                                value={editForm.schedule_value || '3600'}
                                                onChange={e => setEditForm({ ...editForm, schedule_value: e.target.value })}
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                            >
                                                <option value="1800">每 30 分钟</option>
                                                <option value="3600">每 1 小时</option>
                                                <option value="7200">每 2 小时</option>
                                                <option value="21600">每 6 小时</option>
                                                <option value="43200">每 12 小时</option>
                                                <option value="86400">每天</option>
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={editForm.schedule_value || ''}
                                                onChange={e => setEditForm({ ...editForm, schedule_value: e.target.value })}
                                                placeholder="0 9 * * *"
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Crawler Config */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">抓取模式</label>
                                        <select
                                            value={editForm.crawler_type || 'search'}
                                            onChange={e => setEditForm({ ...editForm, crawler_type: e.target.value })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        >
                                            <option value="search">关键词搜索</option>
                                            <option value="detail">指定内容详情</option>
                                            <option value="creator">指定博主主页</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">爬虫时间范围</label>
                                        <select
                                            value={editForm.crawl_date_range || 7}
                                            onChange={e => setEditForm({ ...editForm, crawl_date_range: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        >
                                            <option value="1">最近 1 天</option>
                                            <option value="3">最近 3 天</option>
                                            <option value="7">最近 7 天</option>
                                            <option value="30">最近 30 天</option>
                                            <option value="90">最近 3 个月</option>
                                            <option value="0">不限时间</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">每次抓取数量</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={editForm.crawl_limit || 20}
                                            onChange={e => setEditForm({ ...editForm, crawl_limit: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="edit_dedup"
                                        checked={editForm.deduplicate_authors || false}
                                        onChange={(e) => setEditForm({ ...editForm, deduplicate_authors: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <label htmlFor="edit_dedup" className="text-sm font-medium leading-none cursor-pointer">
                                        开启博主去重 (只保留最新内容)
                                    </label>
                                </div>

                                {/* Advanced Filters */}
                                <details className="border border-border rounded-lg">
                                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-muted/50 flex items-center gap-2">
                                        <Search className="w-4 h-4" />
                                        高级过滤（可选）
                                    </summary>
                                    <div className="p-4 border-t border-border space-y-4">
                                        <p className="text-xs text-muted-foreground">设置过滤条件，只抓取符合条件的内容（0 = 不限制）</p>
                                        
                                        {/* Likes */}
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">点赞数范围</label>
                                            <div className="flex items-center gap-2">
                                                <CleanNumberInput
                                                    value={editForm.min_likes || 0}
                                                    onChange={val => setEditForm({ ...editForm, min_likes: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground">—</span>
                                                <CleanNumberInput
                                                    value={editForm.max_likes || 0}
                                                    onChange={val => setEditForm({ ...editForm, max_likes: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Comments */}
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">评论数范围</label>
                                            <div className="flex items-center gap-2">
                                                <CleanNumberInput
                                                    value={editForm.min_comments || 0}
                                                    onChange={val => setEditForm({ ...editForm, min_comments: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground">—</span>
                                                <CleanNumberInput
                                                    value={editForm.max_comments || 0}
                                                    onChange={val => setEditForm({ ...editForm, max_comments: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Fans */}
                                        <div>
                                            <label className="text-sm font-medium mb-2 block text-violet-500">博主粉丝数范围</label>
                                            <div className="flex items-center gap-2">
                                                <CleanNumberInput
                                                    value={editForm.min_fans || 0}
                                                    onChange={val => setEditForm({ ...editForm, min_fans: val })}
                                                    placeholder="最少粉丝"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground">—</span>
                                                <CleanNumberInput
                                                    value={editForm.max_fans || 0}
                                                    onChange={val => setEditForm({ ...editForm, max_fans: val })}
                                                    placeholder="最多粉丝"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="checkbox"
                                                id="requireContactEdit"
                                                checked={editForm.require_contact === true}
                                                onChange={e => setEditForm({ ...editForm, require_contact: e.target.checked })}
                                                className="w-4 h-4 cursor-pointer"
                                            />
                                            <label htmlFor="requireContactEdit" className="text-sm cursor-pointer font-medium text-violet-500">
                                                必须包含联系方式 (微信/手机/邮箱)
                                            </label>
                                        </div>
                                    </div>
                                </details>

                                {/* Notifications */}
                                <div>
                                    <h3 className="text-sm font-medium mb-3">预警通知</h3>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="alertNegEdit"
                                                checked={editForm.alert_on_negative !== false}
                                                onChange={e => setEditForm({ ...editForm, alert_on_negative: e.target.checked })}
                                                className="w-4 h-4"
                                            />
                                            <label htmlFor="alertNegEdit" className="text-sm">开启负面内容预警</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="alertHotEdit"
                                                checked={editForm.alert_on_hotspot === true}
                                                onChange={e => setEditForm({ ...editForm, alert_on_hotspot: e.target.checked })}
                                                className="w-4 h-4"
                                            />
                                            <label htmlFor="alertHotEdit" className="text-sm">开启热点内容预警</label>
                                        </div>
                                    </div>
                                    <div className="mt-3">
                                        <label className="text-xs text-muted-foreground block mb-2">通知渠道</label>
                                        <div className="flex gap-4">
                                            {[{id:'wechat_work', label:'企业微信', icon: <MessageSquare className="w-4 h-4" />}, {id:'email', label:'邮件', icon: <MessageCircle className="w-4 h-4" />}, {id:'webhook', label:'Webhook', icon: <Zap className="w-4 h-4" />}].map(ch => (
                                                <label key={ch.id} className={cn("flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm", (editForm.alert_channels || []).includes(ch.id) ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={(editForm.alert_channels || []).includes(ch.id)}
                                                        onChange={e => {
                                                            const current = editForm.alert_channels || [];
                                                            const updated = e.target.checked
                                                                ? [...current, ch.id]
                                                                : current.filter(x => x !== ch.id);
                                                            setEditForm({ ...editForm, alert_channels: updated });
                                                        }}
                                                    />
                                                    {ch.icon}
                                                    {ch.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <div className="pt-6 border-t border-border">
                                    <Button 
                                        onClick={handleSaveEdit} 
                                        disabled={isSaving}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        {isSaving ? '保存中...' : '保存修改'}
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground mt-2">
                                        修改配置后，下一次任务执行将自动生效
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default ProjectDetailPage;
