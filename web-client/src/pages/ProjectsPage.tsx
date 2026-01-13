import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FolderOpen, Plus, Play, Pause, Trash2, RefreshCw,
    Clock, Search, AlertTriangle, TrendingUp, Loader2, Zap, Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchAIKeywords } from '@/api';

const API_BASE = '/api';

interface Project {
    id: number;
    name: string;
    description?: string;
    keywords: string[];
    platforms: string[];
    crawler_type: string;
    crawl_limit: number;
    crawl_date_range?: number;
    enable_comments: boolean;
    schedule_type: string;
    schedule_value: string;
    is_active: boolean;
    alert_on_negative: boolean;
    alert_on_hotspot: boolean;
    alert_channels: string[];
    last_run_at?: string;
    next_run_at?: string;
    run_count: number;
    total_crawled: number;
    total_alerts: number;
    today_crawled: number;
    today_alerts: number;
    created_at?: string;
    is_running?: boolean; // 任务正在执行中
}

interface Platform {
    value: string;
    label: string;
    icon: string;
}

const PLATFORM_MAP: Record<string, { label: string; icon: string; color: string }> = {
    xhs: { label: '小红书', icon: '📕', color: 'bg-red-500/10 text-red-500' },
    dy: { label: '抖音', icon: '🎵', color: 'bg-slate-500/20 text-slate-300' },
    douyin: { label: '抖音', icon: '🎵', color: 'bg-slate-500/20 text-slate-300' },
    bili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    bilibili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    wb: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    weibo: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    ks: { label: '快手', icon: '📹', color: 'bg-yellow-500/10 text-yellow-500' },
    kuaishou: { label: '快手', icon: '📹', color: 'bg-yellow-500/10 text-yellow-500' },
    zhihu: { label: '知乎', icon: '❓', color: 'bg-blue-500/10 text-blue-500' },
};

// AI 关键词联想组件
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
                // API 返回空，使用本地备用关键词
                const fallback = mode === 'risk'
                    ? [`${target} 差评`, `${target} 避雷`, `${target} 假货`, `${target} 吐槽`, `${target} 踩坑`, `${target} 退款`, `${target} 质量差`, `${target} 不推荐`]
                    : [`${target} 测评`, `${target} 推荐`, `${target} 好用`, `${target} 教程`, `${target} 种草`, `${target} 攻略`, `${target} 分享`, `${target} 体验`];
                setSuggestions(fallback);
                setSelected(fallback.slice(0, 5));
            }
        } catch (e) {
            console.error('AI analysis failed:', e);
            // 发生错误时也使用本地备用
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
                    <div className="bg-card rounded-lg p-6 w-full max-w-md">
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
                                            className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${mode === 'risk'
                                                ? 'bg-rose-500/10 border-rose-500 text-rose-600'
                                                : 'bg-background border-border'
                                                }`}
                                        >
                                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                                            舆情预警词
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMode('trend')}
                                            className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${mode === 'trend'
                                                ? 'bg-purple-500/10 border-purple-500 text-purple-600'
                                                : 'bg-background border-border'
                                                }`}
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

                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                                    {suggestions.map(kw => (
                                        <button
                                            key={kw}
                                            type="button"
                                            onClick={() => toggleKeyword(kw)}
                                            className={`px-3 py-1.5 rounded-full text-sm border transition-all ${selected.includes(kw)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-background border-border hover:border-primary/50'
                                                }`}
                                        >
                                            {kw}
                                        </button>
                                    ))}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    已选择 {selected.length} 个关键词
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button variant="outline" onClick={() => setSuggestions([])} className="flex-1">
                                        重新输入
                                    </Button>
                                    <Button
                                        onClick={handleConfirm}
                                        disabled={selected.length === 0}
                                        className="flex-1"
                                    >
                                        添加选中关键词
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


const ProjectsPage: React.FC = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [runningProjects, setRunningProjects] = useState<Set<number>>(new Set()); // 跟踪正在执行的项目

    // 新建项目表单
    const [newProject, setNewProject] = useState({
        name: '',
        description: '',
        keywords: '',
        platforms: ['xhs'] as string[],
        crawler_type: 'search',
        crawl_limit: 20,
        crawl_date_range: 7, // 默认最近7天
        schedule_type: 'interval',
        schedule_value: '3600',
        alert_on_negative: true,
        alert_on_hotspot: false,
        auto_start: false,
        // 高级过滤 - 范围
        min_likes: 0,
        max_likes: 0,
        min_comments: 0,
        max_comments: 0,
        min_shares: 0,
        max_shares: 0,
        min_favorites: 0,
        max_favorites: 0,
        enable_comments: true,
        deduplicate_authors: false,
    });


    useEffect(() => {
        fetchProjects();
        fetchPlatforms();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/growhub/projects`);
            const data = await response.json();
            setProjects(data || []);
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPlatforms = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/projects/platforms/options`);
            const data = await response.json();
            setPlatforms(data.platforms || []);
        } catch (error) {
            console.error('Failed to fetch platforms:', error);
        }
    };

    const createProject = async () => {
        if (!newProject.name.trim()) return;

        try {
            const payload = {
                ...newProject,
                keywords: newProject.keywords.split(/[,，\s]+/).filter(k => k.trim()),
            };

            const response = await fetch(`${API_BASE}/growhub/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowCreateModal(false);
                setNewProject({
                    name: '',
                    description: '',
                    keywords: '',
                    platforms: ['xhs'],
                    crawler_type: 'search',
                    crawl_limit: 20,
                    crawl_date_range: 7,
                    schedule_type: 'interval',
                    schedule_value: '3600',
                    alert_on_negative: true,
                    alert_on_hotspot: false,
                    auto_start: false,
                    min_likes: 0,
                    max_likes: 0,
                    min_comments: 0,
                    max_comments: 0,
                    min_shares: 0,
                    max_shares: 0,
                    min_favorites: 0,
                    max_favorites: 0,
                    enable_comments: true,
                    deduplicate_authors: false,
                });
                fetchProjects();
            }
        } catch (error) {
            console.error('Failed to create project:', error);
        }
    };

    const toggleProject = async (project: Project) => {
        setActionLoading(project.id);
        try {
            const endpoint = project.is_active ? 'stop' : 'start';
            await fetch(`${API_BASE}/growhub/projects/${project.id}/${endpoint}`, {
                method: 'POST'
            });
            fetchProjects();
        } catch (error) {
            console.error('Failed to toggle project:', error);
        } finally {
            setActionLoading(null);
        }
    };

    // Preflight 检查结果
    const [preflightResult, setPreflightResult] = useState<{
        show: boolean;
        project?: Project;
        data?: {
            can_run: boolean;
            message: string;
            checks: Array<{
                name: string;
                label: string;
                status: 'pass' | 'fail' | 'warn';
                message: string;
                blocking: boolean;
                action?: { label: string; url: string };
            }>;
        };
    }>({ show: false });

    const runProjectNow = async (project: Project) => {
        setActionLoading(project.id);

        try {
            // 先进行前置检查
            const preflightRes = await fetch(`${API_BASE}/growhub/projects/${project.id}/preflight`);
            const preflight = await preflightRes.json();

            if (!preflight.can_run) {
                // 有阻断项，显示检查结果
                setPreflightResult({
                    show: true,
                    project,
                    data: preflight
                });
                setActionLoading(null);
                return;
            }

            // 检查通过，执行任务
            setRunningProjects(prev => new Set(prev).add(project.id));

            await fetch(`${API_BASE}/growhub/projects/${project.id}/run`, {
                method: 'POST'
            });

            // 执行成功后，等待一段时间后刷新数据
            setTimeout(() => {
                setRunningProjects(prev => {
                    const next = new Set(prev);
                    next.delete(project.id);
                    return next;
                });
                fetchProjects();
            }, 5000);

        } catch (error) {
            console.error('Failed to run project:', error);
            setRunningProjects(prev => {
                const next = new Set(prev);
                next.delete(project.id);
                return next;
            });
        } finally {
            setActionLoading(null);
        }
    };

    // 强制执行（跳过检查）
    const forceRunProject = async (project: Project) => {
        setPreflightResult({ show: false });
        setRunningProjects(prev => new Set(prev).add(project.id));

        try {
            await fetch(`${API_BASE}/growhub/projects/${project.id}/run`, {
                method: 'POST'
            });
            setTimeout(() => {
                setRunningProjects(prev => {
                    const next = new Set(prev);
                    next.delete(project.id);
                    return next;
                });
                fetchProjects();
            }, 5000);
        } catch (error) {
            console.error('Failed to run project:', error);
        }
    };



    const deleteProject = async (project: Project) => {
        if (!confirm(`确定要删除项目"${project.name}"吗？`)) return;

        try {
            await fetch(`${API_BASE}/growhub/projects/${project.id}`, {
                method: 'DELETE'
            });
            fetchProjects();
        } catch (error) {
            console.error('Failed to delete project:', error);
        }
    };

    const formatDateTime = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('zh-CN');
    };

    const formatSchedule = (type: string, value: string) => {
        if (type === 'interval') {
            const seconds = parseInt(value);
            if (seconds < 60) return `每 ${seconds} 秒`;
            if (seconds < 3600) return `每 ${Math.round(seconds / 60)} 分钟`;
            if (seconds < 86400) return `每 ${Math.round(seconds / 3600)} 小时`;
            return `每 ${Math.round(seconds / 86400)} 天`;
        }
        return value;
    };

    const togglePlatform = (platform: string) => {
        setNewProject(prev => {
            const platforms = prev.platforms.includes(platform)
                ? prev.platforms.filter(p => p !== platform)
                : [...prev.platforms, platform];
            return { ...prev, platforms };
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <FolderOpen className="w-7 h-7 text-indigo-500" />
                        监控项目
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        统一管理关键词、调度和通知，一处配置，全自动运行
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchProjects}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        刷新
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        新建项目
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{projects.length}</div>
                        <div className="text-sm text-muted-foreground">总项目数</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-500">
                            {projects.filter(p => p.is_active).length}
                        </div>
                        <div className="text-sm text-muted-foreground">运行中</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-blue-500">
                            {projects.reduce((sum, p) => sum + (p.today_crawled || 0), 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">今日抓取</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-orange-500">
                            {projects.reduce((sum, p) => sum + (p.today_alerts || 0), 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">今日预警</div>
                    </CardContent>
                </Card>
            </div>

            {/* Project List */}
            {loading ? (
                <Card className="bg-card/50">
                    <CardContent className="py-12 text-center">
                        <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            ) : projects.length === 0 ? (
                <Card className="bg-card/50">
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>暂无监控项目</p>
                        <p className="text-sm mt-1">点击"新建项目"开始自动化监控</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {projects.map(project => (
                        <Card
                            key={project.id}
                            className="bg-card/50 hover:bg-card/70 transition-colors cursor-pointer"
                            onClick={() => navigate(`/projects/${project.id}`)}
                        >
                            <CardContent className="py-5">
                                <div className="flex items-start justify-between">
                                    {/* Left: Project Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-3 h-3 rounded-full ${runningProjects.has(project.id)
                                                ? 'bg-blue-500 animate-ping'
                                                : project.is_active
                                                    ? 'bg-green-500 animate-pulse'
                                                    : 'bg-gray-400'
                                                }`} />
                                            <h3 className="font-semibold text-lg">{project.name}</h3>
                                            {runningProjects.has(project.id) ? (
                                                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 flex items-center gap-1">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    执行中...
                                                </span>
                                            ) : (
                                                <span className={`text-xs px-2 py-0.5 rounded ${project.is_active ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                                                    {project.is_active ? '运行中' : '已停止'}
                                                </span>
                                            )}
                                        </div>

                                        {project.description && (
                                            <p className="text-sm text-muted-foreground mb-3">{project.description}</p>
                                        )}

                                        {/* Keywords */}
                                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                                            <Search className="w-4 h-4 text-muted-foreground" />
                                            {project.keywords.slice(0, 5).map((kw, idx) => (
                                                <span key={idx} className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                                                    {kw}
                                                </span>
                                            ))}
                                            {project.keywords.length > 5 && (
                                                <span className="text-xs text-muted-foreground">
                                                    +{project.keywords.length - 5} 个
                                                </span>
                                            )}
                                        </div>

                                        {/* Platforms & Schedule */}
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                {project.platforms.map(p => (
                                                    <span key={p} className={`text-xs px-2 py-0.5 rounded ${PLATFORM_MAP[p]?.color || 'bg-gray-100'}`}>
                                                        {PLATFORM_MAP[p]?.icon} {PLATFORM_MAP[p]?.label || p}
                                                    </span>
                                                ))}
                                            </div>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatSchedule(project.schedule_type, project.schedule_value)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right: Stats & Actions */}
                                    <div className="flex items-center gap-6">
                                        {/* Stats */}
                                        <div className="grid grid-cols-2 gap-4 text-sm text-right">
                                            <div>
                                                <div className="font-medium">{project.total_crawled}</div>
                                                <div className="text-xs text-muted-foreground">累计抓取</div>
                                            </div>
                                            <div>
                                                <div className="font-medium text-orange-500">{project.total_alerts}</div>
                                                <div className="text-xs text-muted-foreground">累计预警</div>
                                            </div>
                                            <div>
                                                <div className="text-xs">上次: {formatDateTime(project.last_run_at)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs">下次: {formatDateTime(project.next_run_at)}</div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => runProjectNow(project)}
                                                disabled={actionLoading === project.id}
                                                title="立即执行"
                                            >
                                                {actionLoading === project.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Zap className="w-4 h-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleProject(project)}
                                                disabled={actionLoading === project.id}
                                                title={project.is_active ? '停止' : '启动'}
                                            >
                                                {project.is_active ? (
                                                    <Pause className="w-4 h-4 text-yellow-500" />
                                                ) : (
                                                    <Play className="w-4 h-4 text-green-500" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => deleteProject(project)}
                                                className="text-red-500 hover:text-red-600"
                                                title="删除"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>

                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-indigo-500" />
                            新建监控项目
                        </h2>

                        <div className="space-y-5">
                            {/* 项目名称 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">项目名称 *</label>
                                <input
                                    type="text"
                                    value={newProject.name}
                                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                    placeholder="如：品牌舆情监控"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>

                            {/* 项目描述 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">项目描述</label>
                                <input
                                    type="text"
                                    value={newProject.description}
                                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                                    placeholder="可选的项目说明..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>

                            {/* 关键词 - 带 AI 联想 */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium">
                                        监控关键词 *
                                        <span className="text-muted-foreground font-normal ml-2">多个关键词用逗号或空格分隔</span>
                                    </label>
                                    <AIKeywordSuggest
                                        onSelect={(keywords) => {
                                            const current = newProject.keywords ? newProject.keywords + ', ' : '';
                                            setNewProject({ ...newProject, keywords: current + keywords.join(', ') });
                                        }}
                                    />
                                </div>
                                <textarea
                                    value={newProject.keywords}
                                    onChange={e => setNewProject({ ...newProject, keywords: e.target.value })}
                                    placeholder="品牌A, 竞品B, 行业热词..."
                                    rows={3}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none"
                                />
                            </div>

                            {/* 平台选择 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">监控平台 *</label>
                                <div className="flex flex-wrap gap-2">
                                    {platforms.map(p => (
                                        <button
                                            key={p.value}
                                            onClick={() => togglePlatform(p.value)}
                                            className={`px-3 py-2 rounded-lg border transition-colors ${newProject.platforms.includes(p.value)
                                                ? 'bg-primary/10 border-primary text-primary'
                                                : 'bg-background border-border hover:border-primary/50'
                                                }`}
                                        >
                                            {p.icon} {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 调度配置 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">调度方式</label>
                                    <select
                                        value={newProject.schedule_type}
                                        onChange={e => setNewProject({ ...newProject, schedule_type: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value="interval">固定间隔</option>
                                        <option value="cron">Cron 表达式</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">
                                        {newProject.schedule_type === 'interval' ? '执行频率' : 'Cron 表达式'}
                                    </label>
                                    {newProject.schedule_type === 'interval' ? (
                                        <select
                                            value={newProject.schedule_value}
                                            onChange={e => setNewProject({ ...newProject, schedule_value: e.target.value })}
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
                                            value={newProject.schedule_value}
                                            onChange={e => setNewProject({ ...newProject, schedule_value: e.target.value })}
                                            placeholder="0 9 * * *"
                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* 抓取配置 */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">抓取模式</label>
                                    <select
                                        value={newProject.crawler_type}
                                        onChange={e => setNewProject({ ...newProject, crawler_type: e.target.value })}
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
                                        value={newProject.crawl_date_range}
                                        onChange={e => setNewProject({ ...newProject, crawl_date_range: parseInt(e.target.value) })}
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
                                        value={newProject.crawl_limit}
                                        onChange={e => setNewProject({ ...newProject, crawl_limit: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="new_dedup"
                                    checked={newProject.deduplicate_authors || false}
                                    onChange={(e) => setNewProject({ ...newProject, deduplicate_authors: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <label htmlFor="new_dedup" className="text-sm font-medium leading-none cursor-pointer">
                                    开启博主去重 (只保留最新内容)
                                </label>
                            </div>

                            {/* 高级过滤 - 折叠面板 */}
                            <details className="border border-border rounded-lg">
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
                                            <input
                                                type="number"
                                                min={0}
                                                value={newProject.min_likes || 0}
                                                onChange={e => setNewProject({ ...newProject, min_likes: parseInt(e.target.value) || 0 })}
                                                placeholder="最小"
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                            />
                                            <span className="text-muted-foreground">—</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={newProject.max_likes || 0}
                                                onChange={e => setNewProject({ ...newProject, max_likes: parseInt(e.target.value) || 0 })}
                                                placeholder="最大"
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* 评论数范围 */}
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">评论数范围</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0}
                                                value={newProject.min_comments || 0}
                                                onChange={e => setNewProject({ ...newProject, min_comments: parseInt(e.target.value) || 0 })}
                                                placeholder="最小"
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                            />
                                            <span className="text-muted-foreground">—</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={newProject.max_comments || 0}
                                                onChange={e => setNewProject({ ...newProject, max_comments: parseInt(e.target.value) || 0 })}
                                                placeholder="最大"
                                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* 分享/收藏范围 */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">分享数范围</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={newProject.min_shares || 0}
                                                    onChange={e => setNewProject({ ...newProject, min_shares: parseInt(e.target.value) || 0 })}
                                                    placeholder="最小"
                                                    className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground text-xs">—</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={newProject.max_shares || 0}
                                                    onChange={e => setNewProject({ ...newProject, max_shares: parseInt(e.target.value) || 0 })}
                                                    placeholder="最大"
                                                    className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">收藏数范围</label>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={newProject.min_favorites || 0}
                                                    onChange={e => setNewProject({ ...newProject, min_favorites: parseInt(e.target.value) || 0 })}
                                                    placeholder="最小"
                                                    className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                                <span className="text-muted-foreground text-xs">—</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={newProject.max_favorites || 0}
                                                    onChange={e => setNewProject({ ...newProject, max_favorites: parseInt(e.target.value) || 0 })}
                                                    placeholder="最大"
                                                    className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2">
                                        <input
                                            type="checkbox"
                                            id="enableComments"
                                            checked={newProject.enable_comments !== false}
                                            onChange={e => setNewProject({ ...newProject, enable_comments: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <label htmlFor="enableComments" className="text-sm cursor-pointer">同时抓取评论内容</label>
                                    </div>
                                </div>
                            </details>


                            {/* 预警配置 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">预警规则</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newProject.alert_on_negative}
                                            onChange={e => setNewProject({ ...newProject, alert_on_negative: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                                        负面内容预警
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newProject.alert_on_hotspot}
                                            onChange={e => setNewProject({ ...newProject, alert_on_hotspot: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <TrendingUp className="w-4 h-4 text-green-500" />
                                        热点内容推送
                                    </label>
                                </div>
                            </div>

                            {/* 立即启动 */}
                            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="autoStart"
                                    checked={newProject.auto_start}
                                    onChange={e => setNewProject({ ...newProject, auto_start: e.target.checked })}
                                    className="w-4 h-4"
                                />
                                <label htmlFor="autoStart" className="cursor-pointer">
                                    创建后立即启动自动监控
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                                取消
                            </Button>
                            <Button
                                onClick={createProject}
                                disabled={!newProject.name.trim() || !newProject.keywords.trim() || newProject.platforms.length === 0}
                            >
                                创建项目
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preflight Check Dialog */}
            {preflightResult.show && preflightResult.data && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-500" />
                            执行前检查
                        </h2>

                        <p className="text-sm text-muted-foreground mb-4">
                            项目 <span className="font-medium text-foreground">{preflightResult.project?.name}</span> 有以下问题需要解决：
                        </p>

                        <div className="space-y-3 mb-6">
                            {preflightResult.data.checks.map((check, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 p-3 rounded-lg ${check.status === 'pass' ? 'bg-green-500/10' :
                                        check.status === 'fail' ? 'bg-red-500/10' :
                                            'bg-yellow-500/10'
                                        }`}
                                >
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${check.status === 'pass' ? 'bg-green-500 text-white' :
                                        check.status === 'fail' ? 'bg-red-500 text-white' :
                                            'bg-yellow-500 text-white'
                                        }`}>
                                        {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '!'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">{check.label}</div>
                                        <div className="text-xs text-muted-foreground">{check.message}</div>
                                        {check.action && (
                                            <a
                                                href={check.action.url}
                                                className="text-xs text-primary hover:underline mt-1 inline-block"
                                            >
                                                {check.action.label} →
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setPreflightResult({ show: false })}
                                className="flex-1"
                            >
                                取消
                            </Button>
                            <Button
                                onClick={() => preflightResult.project && forceRunProject(preflightResult.project)}
                                className="flex-1 bg-orange-600 hover:bg-orange-700"
                            >
                                仍然执行
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
};

export default ProjectsPage;
