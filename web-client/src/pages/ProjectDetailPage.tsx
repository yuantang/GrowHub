import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    fetchProject,
    fetchProjectContents,
    fetchProjectStatsChart,
    updateProject,
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
    FileText,
    Target,
    Clock,
    Bell,
    Sparkles,
    AlertTriangle,
    Calendar,
    MessageSquare,
    Users,
    Zap,
    Save,
    Search
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '@/utils';
import { ContentDataTable } from '@/components/business/ContentDataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AiKeywordDialog } from '@/components/business/AiKeywordDialog';


// Custom helper for array inputs (strings separated by comma)
const ArrayInput = ({ value, onChange, placeholder, className }: { 
    value: string[]; 
    onChange: (val: string[]) => void; 
    placeholder?: string;
    className?: string; 
}) => {
    const [tempValue, setTempValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    // Sync state only when not editing
    useEffect(() => {
        if (!isEditing) {
            setTempValue(value?.join(', ') || '');
        }
    }, [value, isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        const newValue = tempValue.split(/[,，]/) // Support both comma types
            .map(k => k.trim())
            .filter(Boolean);
        
        // Remove duplicates
        const uniqueValues = Array.from(new Set(newValue));
        
        // Only update if changed
        if (JSON.stringify(uniqueValues) !== JSON.stringify(value)) {
            onChange(uniqueValues);
        }
    };

    const handleFocus = () => {
        setIsEditing(true);
    };

    return (
        <Input
            className={className}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
        />
    );
};

// Custom helper for clean number inputs (handles 0 as empty, fixes leading zeros)
const CleanNumberInput = ({ value, onChange, placeholder, className }: { 
    value: number | string; 
    onChange: (val: number) => void; 
    placeholder?: string;
    className?: string;
}) => {
    // Helper to check if value is effectively 0
    const isZero = (v: number | string) => Number(v) === 0;

    // Initialize: if value is 0, show empty string
    const [localValue, setLocalValue] = useState<string>(isZero(value) ? '' : String(value));

    useEffect(() => {
        // Sync from parent prop to local state
        // If parent is 0, local should be empty
        if (isZero(value)) {
            if (localValue !== '') setLocalValue('');
        } else {
            // If parent has a value, make sure local matches it
            // use String(value) to handle both number and string types
            if (String(value) !== localValue) {
                setLocalValue(String(value));
            }
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        
        // 1. Handle empty input
        if (val === '') {
            setLocalValue('');
            onChange(0);
            return;
        }

        // 2. Allow digits only
        if (!/^\d+$/.test(val)) return;

        // 3. Parse integer to remove leading zeros immediately
        const num = parseInt(val, 10);

        if (num === 0) {
            // If user types '0' or '00', treat as empty/0
            setLocalValue('');
            onChange(0);
        } else {
            // If valid number, update local to clean string (e.g. '01' -> '1')
            // This prevents '0100' by forcing it to '100' immediately
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

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

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

    // AI Dialog State
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    const [aiDialogMode, setAiDialogMode] = useState<'risk' | 'trend'>('trend');
    const [aiTargetKeyword, setAiTargetKeyword] = useState('');

    // Settings Tab State
    const [settingsTab, setSettingsTab] = useState('basic');
    const [isSaving, setIsSaving] = useState(false);

    // Logs
    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState("dashboard");

    // Poll logs if active tab is 'logs'
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

    // Initial Load
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

    const updateSettings = async (updates: Partial<Project>) => {
        if (!project) return;
        try {
            setIsSaving(true);
            const prev = project;
            setProject({ ...prev, ...updates });
            await updateProject(projectId, updates);
        } catch (err) {
            console.error(err);
            loadProjectData();
        } finally {
            setIsSaving(false);
        }
    };

    const handleAiKeywordsSelect = (selected: string[]) => {
        if (!project) return;
        if (aiDialogMode === 'trend') {
            const current = project.keywords || [];
            const newKeywords = Array.from(new Set([...current, ...selected]));
            updateSettings({ keywords: newKeywords });
        } else {
            const current = project.sentiment_keywords || [];
            const newKeywords = Array.from(new Set([...current, ...selected]));
            updateSettings({ sentiment_keywords: newKeywords });
        }
    };

    const openAiDialog = (mode: 'risk' | 'trend') => {
        setAiDialogMode(mode);
        setAiTargetKeyword((project?.keywords && project.keywords.length > 0) ? project.keywords[0] : (project?.name || ''));
        setAiDialogOpen(true);
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

    // ========== Settings Sub-Components ==========
    const SettingCard: React.FC<{ title: string; icon: React.ReactNode; gradient?: string; children: React.ReactNode }> = ({ title, icon, gradient = 'from-slate-600 to-slate-700', children }) => (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className={cn("px-4 py-3 flex items-center gap-2 bg-gradient-to-r text-white", gradient)}>
                {icon}
                <span className="font-medium">{title}</span>
            </div>
            <div className="p-5 space-y-4">
                {children}
            </div>
        </div>
    );

    const FormRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{label}</label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );

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
                        <p className="text-sm text-muted-foreground mt-1">
                            关键词: {project.keywords.join(", ")} | 平台: {project.platforms.join(", ")}
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
                                <p className="text-xs text-muted-foreground mt-1">
                                    限量: {project.crawl_limit}条 | 范围: {project.crawl_date_range || '不限'}天
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

                {/* ========== SETTINGS (Redesigned) ========== */}
                <TabsContent value="settings">
                    <div className="space-y-6">
                        {/* Settings Navigation */}
                        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-4 h-12 p-1 bg-muted/30 rounded-lg border">
                                <TabsTrigger value="basic" className="flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md transition-all">
                                    <FileText className="w-4 h-4" /> <span>基础信息</span>
                                </TabsTrigger>
                                <TabsTrigger value="crawl" className="flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md transition-all">
                                    <Target className="w-4 h-4" /> <span>任务设置</span>
                                </TabsTrigger>
                                <TabsTrigger value="schedule" className="flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md transition-all">
                                    <Clock className="w-4 h-4" /> <span>调度配置</span>
                                </TabsTrigger>
                                <TabsTrigger value="alerts" className="flex items-center gap-2 text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md transition-all">
                                    <Bell className="w-4 h-4" /> <span>预警通知</span>
                                </TabsTrigger>
                            </TabsList>

                            {/* Tab 1: Basic Info */}
                            <TabsContent value="basic" className="mt-6">
                                <SettingCard title="基础信息" icon={<FileText className="w-4 h-4" />} gradient="from-blue-600 to-indigo-600">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <FormRow label="项目名称" hint="用于展示和识别此监控项目">
                                            <Input value={project.name} onChange={(e) => updateSettings({ name: e.target.value })} placeholder="输入项目名称" />
                                        </FormRow>
                                        <FormRow label="爬虫类型" hint="选择内容获取方式">
                                            <Select value={project.crawler_type} onChange={(e) => updateSettings({ crawler_type: e.target.value })}>
                                                <option value="search">综合搜索 (Search)</option>
                                                <option value="detail">详情抓取 (Detail)</option>
                                                <option value="creator">博主主页 (Creator)</option>
                                            </Select>
                                        </FormRow>
                                        <FormRow label="项目描述" hint="可选，备注此项目用途">
                                            <Input value={project.description || ''} onChange={(e) => updateSettings({ description: e.target.value })} placeholder="项目备注信息" />
                                        </FormRow>
                                    </div>
                                </SettingCard>
                            </TabsContent>

                            {/* Tab 2: Crawl Config */}
                            <TabsContent value="crawl" className="mt-6 space-y-6">
                                <SettingCard title="任务策略与关键词" icon={<Target className="w-4 h-4" />} gradient="from-violet-600 to-purple-600">
                                    <FormRow label="监控关键词" hint="多个关键词用逗号分隔，每个关键词会独立搜索">
                                        <div className="flex gap-2">
                                            <ArrayInput
                                                className="flex-1"
                                                value={project.keywords || []}
                                                onChange={(keywords) => updateSettings({ keywords })}
                                                placeholder="例如: 深度学习, AI绘画, ChatGPT (支持中英文逗号)"
                                            />
                                            <Button variant="outline" size="sm" className="shrink-0 text-violet-600 border-violet-200 hover:bg-violet-50" onClick={() => openAiDialog('trend')}>
                                                <Sparkles className="w-4 h-4 mr-1" /> AI 推荐
                                            </Button>
                                        </div>
                                    </FormRow>
                                </SettingCard>

                                <SettingCard title="平台与抓取参数" icon={<Zap className="w-4 h-4" />} gradient="from-emerald-600 to-teal-600">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <FormRow label="目标平台" hint="选择需要监控的社交媒体平台">
                                            <div className="flex flex-wrap gap-3 pt-1">
                                                {[{ id: 'xhs', label: '小红书' }, { id: 'douyin', label: '抖音' }, { id: 'bilibili', label: 'B站' }].map(p => (
                                                    <label key={p.id} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all", project.platforms?.includes(p.id) ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50")}>
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only"
                                                            checked={project.platforms?.includes(p.id)}
                                                            onChange={(e) => {
                                                                const current = project.platforms || [];
                                                                const updated = e.target.checked ? [...current, p.id] : current.filter(x => x !== p.id);
                                                                updateSettings({ platforms: updated });
                                                            }}
                                                        />
                                                        <span className="text-sm font-medium">{p.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </FormRow>
                                        <FormRow label="单次抓取数量" hint="每次执行时抓取的内容条数 (1-100)">
                                            <Input type="number" value={project.crawl_limit} onChange={(e) => updateSettings({ crawl_limit: parseInt(e.target.value) || 20 })} min={1} max={100} />
                                        </FormRow>
                                        <FormRow label="时间范围 (天)" hint="只抓取最近 N 天内发布的内容，0 表示不限制">
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    type="number"
                                                    className="w-28"
                                                    value={project.crawl_date_range || 7}
                                                    onChange={(e) => updateSettings({ crawl_date_range: parseInt(e.target.value) || 0 })}
                                                    min={0}
                                                    max={365}
                                                />
                                                <div className="flex gap-1">
                                                    {[7, 14, 30].map(d => (
                                                        <Button
                                                            key={d}
                                                            type="button"
                                                            variant={project.crawl_date_range === d ? 'default' : 'outline'}
                                                            size="sm"
                                                            className="h-9 px-3"
                                                            onClick={() => updateSettings({ crawl_date_range: d })}
                                                        >
                                                            {d}天
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        </FormRow>
                                    </div>
                                    <div className="flex flex-wrap gap-6 pt-2 border-t mt-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" checked={project.enable_comments} onChange={(e) => updateSettings({ enable_comments: e.target.checked })} />
                                            <span className="text-sm">抓取评论内容</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" checked={project.deduplicate_authors} onChange={(e) => updateSettings({ deduplicate_authors: e.target.checked })} />
                                            <span className="text-sm">博主去重 (每个博主只保留最新一条)</span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">并发数量:</span>
                                            <Input 
                                                type="number" 
                                                className="w-20 h-8" 
                                                value={project.max_concurrency} 
                                                onChange={(e) => updateSettings({ max_concurrency: parseInt(e.target.value) || 1 })} 
                                                min={1} 
                                                max={10} 
                                            />
                                            <span className="text-xs text-muted-foreground">(建议 1-5)</span>
                                        </div>
                                    </div>
                                </SettingCard>

                                {/* 高级过滤 - 折叠面板 */}
                                <details className="border border-border rounded-lg bg-card">
                                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-muted/50 flex items-center gap-2">
                                        <Search className="w-4 h-4" />
                                        高级过滤（可选）
                                    </summary>
                                    <div className="p-4 border-t border-border space-y-4">
                                        <p className="text-xs text-muted-foreground">设置过滤条件，只抓取符合条件的内容（0 = 不限制）</p>

                                        {/* 点赞数范围 */}
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">点赞数范围</label>
                                            <div className="flex items-center gap-2">
                                                <CleanNumberInput
                                                    value={project.min_likes}
                                                    onChange={val => updateSettings({ min_likes: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground">—</span>
                                                <CleanNumberInput
                                                    value={project.max_likes}
                                                    onChange={val => updateSettings({ max_likes: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* 评论数范围 */}
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">评论数范围</label>
                                            <div className="flex items-center gap-2">
                                                <CleanNumberInput
                                                    value={project.min_comments}
                                                    onChange={val => updateSettings({ min_comments: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground">—</span>
                                                <CleanNumberInput
                                                    value={project.max_comments}
                                                    onChange={val => updateSettings({ max_comments: val })}
                                                    placeholder="不限"
                                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* 分享/收藏范围 */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">分享数范围</label>
                                                <div className="flex items-center gap-1">
                                                    <CleanNumberInput
                                                        value={project.min_shares}
                                                        onChange={val => updateSettings({ min_shares: val })}
                                                        placeholder="不限"
                                                        className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                    />
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                    <CleanNumberInput
                                                        value={project.max_shares}
                                                        onChange={val => updateSettings({ max_shares: val })}
                                                        placeholder="不限"
                                                        className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">收藏数范围</label>
                                                <div className="flex items-center gap-1">
                                                    <CleanNumberInput
                                                        value={project.min_favorites}
                                                        onChange={val => updateSettings({ min_favorites: val })}
                                                        placeholder="不限"
                                                        className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                    />
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                    <CleanNumberInput
                                                        value={project.max_favorites}
                                                        onChange={val => updateSettings({ max_favorites: val })}
                                                        placeholder="不限"
                                                        className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </TabsContent>

                            {/* Tab 3: Schedule Config */}
                            <TabsContent value="schedule" className="mt-6">
                                <SettingCard title="自动调度配置" icon={<Clock className="w-4 h-4" />} gradient="from-amber-500 to-orange-500">
                                    {/* Status Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border mb-5">
                                        <div>
                                            <p className="text-sm font-medium">自动调度开关</p>
                                            <p className="text-xs text-muted-foreground">开启后将按配置自动运行抓取任务</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateSettings({ is_active: !project.is_active })}
                                            className={cn(
                                                "relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                                                project.is_active ? "bg-green-500" : "bg-gray-300"
                                            )}
                                        >
                                            <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", project.is_active ? "translate-x-8" : "translate-x-1")} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <FormRow label="调度类型" hint="选择自动运行策略">
                                            <Select value={project.schedule_type} onChange={(e) => updateSettings({ schedule_type: e.target.value })}>
                                                <option value="interval">间隔运行 (Interval)</option>
                                                <option value="cron">定时运行 (Cron)</option>
                                            </Select>
                                        </FormRow>
                                        <FormRow label={project.schedule_type === 'interval' ? '间隔时间 (秒)' : 'Cron 表达式'} hint={project.schedule_type === 'interval' ? '例如: 3600 表示每小时运行一次' : '例如: 0 8 * * * 表示每天早上8点运行'}>
                                            <Input
                                                value={project.schedule_value || ''}
                                                onChange={(e) => updateSettings({ schedule_value: e.target.value })}
                                                placeholder={project.schedule_type === 'interval' ? "3600" : "0 8 * * *"}
                                            />
                                        </FormRow>
                                    </div>

                                    {/* Quick Presets for Interval */}
                                    {project.schedule_type === 'interval' && (
                                        <div className="pt-4 border-t mt-4">
                                            <p className="text-xs text-muted-foreground mb-2">快速设置</p>
                                            <div className="flex flex-wrap gap-2">
                                                {[{ label: '30分钟', value: '1800' }, { label: '1小时', value: '3600' }, { label: '2小时', value: '7200' }, { label: '6小时', value: '21600' }, { label: '12小时', value: '43200' }, { label: '24小时', value: '86400' }].map(preset => (
                                                    <Button
                                                        key={preset.value}
                                                        type="button"
                                                        variant={project.schedule_value === preset.value ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => updateSettings({ schedule_value: preset.value })}
                                                    >
                                                        {preset.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </SettingCard>
                            </TabsContent>

                            {/* Tab 4: Alerts & Notifications */}
                            <TabsContent value="alerts" className="mt-6 space-y-6">
                                <SettingCard title="舆情分析配置" icon={<AlertTriangle className="w-4 h-4" />} gradient="from-rose-600 to-pink-600">
                                    <FormRow label="自定义舆情词 / 负面词" hint="内容中包含这些词会被标记为负面情感">
                                        <div className="flex gap-2">
                                            <Input
                                                className="flex-1"
                                                value={project.sentiment_keywords?.join(', ') || ''}
                                                onChange={(e) => updateSettings({ sentiment_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
                                                placeholder="例如: 差评, 避雷, 智商税, 假货"
                                            />
                                            <Button variant="outline" size="sm" className="shrink-0 text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => openAiDialog('risk')}>
                                                <Sparkles className="w-4 h-4 mr-1" /> AI 推荐
                                            </Button>
                                        </div>
                                    </FormRow>
                                    <div className="flex flex-wrap gap-6 pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500" checked={project.alert_on_negative} onChange={(e) => updateSettings({ alert_on_negative: e.target.checked })} />
                                            <span className="text-sm">开启负面内容实时预警</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" checked={project.alert_on_hotspot} onChange={(e) => updateSettings({ alert_on_hotspot: e.target.checked })} />
                                            <span className="text-sm">开启热点内容预警 (点赞 {'>'} 1000)</span>
                                        </label>
                                    </div>
                                </SettingCard>

                                <SettingCard title="通知渠道" icon={<Bell className="w-4 h-4" />} gradient="from-sky-600 to-cyan-600">
                                    <div className="flex flex-wrap gap-4">
                                        {[{ id: 'wechat_work', label: '企业微信', icon: <MessageSquare className="w-4 h-4" /> }, { id: 'email', label: '邮件', icon: <MessageCircle className="w-4 h-4" /> }, { id: 'webhook', label: 'Webhook', icon: <Zap className="w-4 h-4" /> }].map(ch => (
                                            <label key={ch.id} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all", project.alert_channels?.includes(ch.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={project.alert_channels?.includes(ch.id)}
                                                    onChange={(e) => {
                                                        const current = project.alert_channels || [];
                                                        const updated = e.target.checked ? [...current, ch.id] : current.filter(x => x !== ch.id);
                                                        updateSettings({ alert_channels: updated });
                                                    }}
                                                />
                                                {ch.icon}
                                                <span className="text-sm font-medium">{ch.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground pt-2">选择接收预警通知的渠道，需在系统设置中配置具体的接收地址</p>
                                </SettingCard>
                            </TabsContent>
                        </Tabs>

                        {/* Save indicator */}
                        {isSaving && (
                            <div className="fixed bottom-6 right-6 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin" /> 保存中...
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* AI Dialog */}
            <AiKeywordDialog
                isOpen={aiDialogOpen}
                onClose={() => setAiDialogOpen(false)}
                onSelect={handleAiKeywordsSelect}
                initialKeyword={aiTargetKeyword}
                mode={aiDialogMode}
            />
        </div>
    );
};

export default ProjectDetailPage;
