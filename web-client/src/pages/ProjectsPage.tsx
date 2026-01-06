import React, { useState, useEffect } from 'react';
import {
    FolderOpen, Plus, Play, Pause, Trash2, RefreshCw,
    Clock, Search, AlertTriangle, TrendingUp, Loader2, Zap
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = 'http://localhost:8080/api';

interface Project {
    id: number;
    name: string;
    description?: string;
    keywords: string[];
    platforms: string[];
    crawler_type: string;
    crawl_limit: number;
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
}

interface Platform {
    value: string;
    label: string;
    icon: string;
}

const PLATFORM_MAP: Record<string, { label: string; icon: string; color: string }> = {
    xhs: { label: '小红书', icon: '📕', color: 'bg-red-500/10 text-red-500' },
    douyin: { label: '抖音', icon: '🎵', color: 'bg-black/10 text-gray-800' },
    bilibili: { label: 'B站', icon: '📺', color: 'bg-pink-500/10 text-pink-500' },
    weibo: { label: '微博', icon: '📱', color: 'bg-orange-500/10 text-orange-500' },
    zhihu: { label: '知乎', icon: '❓', color: 'bg-blue-500/10 text-blue-500' },
};

const ProjectsPage: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // 新建项目表单
    const [newProject, setNewProject] = useState({
        name: '',
        description: '',
        keywords: '',
        platforms: ['xhs'] as string[],
        crawler_type: 'search',
        crawl_limit: 20,
        schedule_type: 'interval',
        schedule_value: '3600',
        alert_on_negative: true,
        alert_on_hotspot: false,
        auto_start: false,
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
                    schedule_type: 'interval',
                    schedule_value: '3600',
                    alert_on_negative: true,
                    alert_on_hotspot: false,
                    auto_start: false,
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

    const runProjectNow = async (project: Project) => {
        setActionLoading(project.id);
        try {
            await fetch(`${API_BASE}/growhub/projects/${project.id}/run`, {
                method: 'POST'
            });
            fetchProjects();
        } catch (error) {
            console.error('Failed to run project:', error);
        } finally {
            setActionLoading(null);
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
                        <Card key={project.id} className="bg-card/50 hover:bg-card/70 transition-colors">
                            <CardContent className="py-5">
                                <div className="flex items-start justify-between">
                                    {/* Left: Project Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-3 h-3 rounded-full ${project.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                            <h3 className="font-semibold text-lg">{project.name}</h3>
                                            <span className={`text-xs px-2 py-0.5 rounded ${project.is_active ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                                                {project.is_active ? '运行中' : '已停止'}
                                            </span>
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
                                        <div className="flex items-center gap-2">
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

                            {/* 关键词 */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    监控关键词 *
                                    <span className="text-muted-foreground font-normal ml-2">多个关键词用逗号或空格分隔</span>
                                </label>
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
                            <div className="grid grid-cols-2 gap-4">
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
        </div>
    );
};

export default ProjectsPage;
