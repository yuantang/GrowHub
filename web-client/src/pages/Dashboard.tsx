import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LogConsole } from '@/components/LogConsole';
import { useLogs } from '@/hooks/useLogs';
import type { ConfigOptions, Platform, CrawlerStartRequest } from '@/api';
import {
    fetchConfigOptions,
    fetchPlatforms,
    startCrawler,
    stopCrawler,
    fetchCrawlerStatus
} from '@/api';
import { Play, Square, Loader2, Plus, Trash2, Users, Check, AlertCircle, Sparkles } from 'lucide-react';
import { MonitorTaskWizard } from '@/components/MonitorTaskWizard';

// Account interface
interface AccountInfo {
    id: string;
    platform: string;
    name: string;
    status: string;
    last_used: string | null;
    request_count: number;
    success_rate: number;
}

// Task config for multi-platform support
interface TaskConfig {
    id: string;
    platform: string;
    crawler_type: string;
    keywords: string;
    specified_ids: string;
    creator_ids: string;
    enabled: boolean;
}

const Dashboard: React.FC = () => {
    const logs = useLogs();
    const [options, setOptions] = useState<ConfigOptions | null>(null);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [accounts, setAccounts] = useState<Record<string, AccountInfo[]>>({});
    const [loadingAccounts, setLoadingAccounts] = useState(false);

    // Multi-task configuration
    const [tasks, setTasks] = useState<TaskConfig[]>([
        {
            id: '1',
            platform: 'xhs',
            crawler_type: 'search',
            keywords: '',
            specified_ids: '',
            creator_ids: '',
            enabled: true,
        }
    ]);

    // Global settings
    const [globalConfig, setGlobalConfig] = useState({
        login_type: 'qrcode',
        save_option: 'json',
        start_page: 1,
        enable_comments: true,
        enable_sub_comments: false,
        headless: false,
        use_multi_account: false,
        crawl_limit_count: 0,
        min_likes: 0,
        min_shares: 0,
        min_comments: 0,
        min_favorites: 0,
    });

    // Fetch accounts
    const fetchAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        try {
            const response = await fetch('/api/accounts');
            const data = await response.json();
            setAccounts(data.accounts || {});
        } catch (error) {
            console.error('Failed to fetch accounts', error);
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    useEffect(() => {
        fetchConfigOptions().then(setOptions);
        fetchPlatforms().then(setPlatforms);
        fetchAccounts();

        // Poll status
        const interval = setInterval(() => {
            fetchCrawlerStatus().then(status => {
                setIsRunning(status.status === 'running' || status.status === 'stopping');
            });
        }, 2000);
        return () => clearInterval(interval);
    }, [fetchAccounts]);

    // Add new task
    const addTask = () => {
        const newTask: TaskConfig = {
            id: Date.now().toString(),
            platform: 'xhs',
            crawler_type: 'search',
            keywords: '',
            specified_ids: '',
            creator_ids: '',
            enabled: true,
        };
        setTasks([...tasks, newTask]);
    };

    // Remove task
    const removeTask = (id: string) => {
        if (tasks.length > 1) {
            setTasks(tasks.filter(t => t.id !== id));
        }
    };

    // Update task
    const updateTask = (id: string, updates: Partial<TaskConfig>) => {
        setTasks(tasks.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    // Get enabled tasks
    const getEnabledTasks = () => tasks.filter(t => t.enabled);

    // Start crawler (runs first enabled task for now)
    const handleStart = async () => {
        const enabledTasks = getEnabledTasks();
        if (enabledTasks.length === 0) {
            alert('请至少启用一个任务');
            return;
        }

        // For now, start the first enabled task
        // TODO: Implement sequential or parallel multi-task execution
        const task = enabledTasks[0];

        const config: CrawlerStartRequest = {
            platform: task.platform,
            login_type: globalConfig.login_type,
            crawler_type: task.crawler_type,
            keywords: task.keywords,
            specified_ids: task.specified_ids,
            creator_ids: task.creator_ids,
            start_page: globalConfig.start_page,
            save_option: globalConfig.save_option,
            enable_comments: globalConfig.enable_comments,
            enable_sub_comments: globalConfig.enable_sub_comments,
            headless: globalConfig.headless,
            crawl_limit_count: globalConfig.crawl_limit_count,
            min_likes: globalConfig.min_likes,
            min_shares: globalConfig.min_shares,
            min_comments: globalConfig.min_comments,
            min_favorites: globalConfig.min_favorites,
        };

        try {
            setIsRunning(true);
            await startCrawler(config);
        } catch (error) {
            console.error('Failed to start crawler', error);
            setIsRunning(false);
        }
    };

    const handleStop = async () => {
        try {
            await stopCrawler();
        } catch (error) {
            console.error('Failed to stop crawler', error);
        }
    };

    // Get account count for platform
    const getAccountCount = (platform: string) => {
        const platformAccounts = accounts[platform] || [];
        const active = platformAccounts.filter(a => a.status === 'active').length;
        return { total: platformAccounts.length, active };
    };

    if (!options) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Multi-Task Configuration */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <span>任务配置</span>
                        <span className="text-sm font-normal text-muted-foreground">
                            ({getEnabledTasks().length} 个任务启用)
                        </span>
                    </CardTitle>
                    <Button onClick={addTask} variant="outline" size="sm">
                        <Plus className="w-4 h-4 mr-1" /> 添加任务
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {tasks.map((task, index) => (
                        <div
                            key={task.id}
                            className={cn(
                                "p-4 rounded-lg border transition-all",
                                task.enabled ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30 opacity-60"
                            )}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => updateTask(task.id, { enabled: !task.enabled })}
                                        className={cn(
                                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                            task.enabled
                                                ? "border-primary bg-primary text-white"
                                                : "border-muted-foreground/30"
                                        )}
                                    >
                                        {task.enabled && <Check className="w-4 h-4" />}
                                    </button>
                                    <span className="font-medium">任务 {index + 1}</span>
                                    {(() => {
                                        const count = getAccountCount(task.platform);
                                        return count.active > 0 ? (
                                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {count.active} 个账号可用
                                            </span>
                                        ) : (
                                            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                无可用账号
                                            </span>
                                        );
                                    })()}
                                </div>
                                {tasks.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeTask(task.id)}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Platform */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">平台</label>
                                    <Select
                                        value={task.platform}
                                        onChange={e => updateTask(task.id, { platform: e.target.value })}
                                        disabled={!task.enabled}
                                    >
                                        {platforms.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </Select>
                                </div>

                                {/* Crawler Type */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">爬取类型</label>
                                    <Select
                                        value={task.crawler_type}
                                        onChange={e => updateTask(task.id, { crawler_type: e.target.value })}
                                        disabled={!task.enabled}
                                    >
                                        {options.crawler_types.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </Select>
                                </div>

                                {/* Dynamic input based on crawler type */}
                                <div className="space-y-2">
                                    {task.crawler_type === 'search' && (
                                        <>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-sm font-medium">关键词 (逗号分隔)</label>
                                                <MonitorTaskWizard
                                                    onStartTask={(query) => updateTask(task.id, { keywords: query })}
                                                    trigger={
                                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50">
                                                            <Sparkles className="w-3 h-3 mr-1" /> AI 智能助手
                                                        </Button>
                                                    }
                                                />
                                            </div>
                                            <Input
                                                value={task.keywords}
                                                placeholder="python, AI, 编程..."
                                                onChange={e => updateTask(task.id, { keywords: e.target.value })}
                                                disabled={!task.enabled}
                                            />
                                        </>
                                    )}
                                    {task.crawler_type === 'detail' && (
                                        <>
                                            <label className="text-sm font-medium">帖子ID (逗号分隔)</label>
                                            <Input
                                                value={task.specified_ids}
                                                placeholder="id1, id2..."
                                                onChange={e => updateTask(task.id, { specified_ids: e.target.value })}
                                                disabled={!task.enabled}
                                            />
                                        </>
                                    )}
                                    {task.crawler_type === 'creator' && (
                                        <>
                                            <label className="text-sm font-medium">创作者ID (逗号分隔)</label>
                                            <Input
                                                value={task.creator_ids}
                                                placeholder="creator1, creator2..."
                                                onChange={e => updateTask(task.id, { creator_ids: e.target.value })}
                                                disabled={!task.enabled}
                                            />
                                        </>
                                    )}
                                    {task.crawler_type === 'homefeed' && (
                                        <div className="flex items-center h-full">
                                            <span className="text-sm text-muted-foreground">首页推荐无需额外配置</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Global Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Login Config */}
                <Card>
                    <CardHeader>
                        <CardTitle>登录配置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">登录方式</label>
                            <Select
                                value={globalConfig.login_type}
                                onChange={e => setGlobalConfig({ ...globalConfig, login_type: e.target.value })}
                            >
                                {options.login_types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </Select>
                        </div>
                        <div className="flex items-center space-x-2 pt-4">
                            <input
                                type="checkbox"
                                id="headless"
                                checked={globalConfig.headless}
                                onChange={e => setGlobalConfig({ ...globalConfig, headless: e.target.checked })}
                                className="rounded border-input bg-background"
                            />
                            <label htmlFor="headless" className="text-sm">无头模式 (无 GUI 运行浏览器)</label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="use_multi_account"
                                checked={globalConfig.use_multi_account}
                                onChange={e => setGlobalConfig({ ...globalConfig, use_multi_account: e.target.checked })}
                                className="rounded border-input bg-background"
                            />
                            <label htmlFor="use_multi_account" className="text-sm">启用多账号轮换</label>
                        </div>
                    </CardContent>
                </Card>

                {/* Output Config */}
                <Card>
                    <CardHeader>
                        <CardTitle>输出配置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">保存格式</label>
                            <Select
                                value={globalConfig.save_option}
                                onChange={e => setGlobalConfig({ ...globalConfig, save_option: e.target.value })}
                            >
                                {options.save_options.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">起始页</label>
                            <Input
                                type="number"
                                min={1}
                                value={globalConfig.start_page}
                                onChange={e => setGlobalConfig({ ...globalConfig, start_page: parseInt(e.target.value) })}
                            />
                        </div>
                        <div className="pt-4 space-y-2">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="comments"
                                    checked={globalConfig.enable_comments}
                                    onChange={e => setGlobalConfig({ ...globalConfig, enable_comments: e.target.checked })}
                                />
                                <label htmlFor="comments" className="text-sm">评论抓取</label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="subcomments"
                                    checked={globalConfig.enable_sub_comments}
                                    onChange={e => setGlobalConfig({ ...globalConfig, enable_sub_comments: e.target.checked })}
                                />
                                <label htmlFor="subcomments" className="text-sm">子评论</label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Account Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>账号概览</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchAccounts}
                                disabled={loadingAccounts}
                            >
                                {loadingAccounts ? <Loader2 className="w-4 h-4 animate-spin" /> : '刷新'}
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {platforms.map(platform => {
                                const count = getAccountCount(platform.value);
                                return (
                                    <div
                                        key={platform.value}
                                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                                    >
                                        <span className="font-medium">{platform.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-sm px-2 py-0.5 rounded",
                                                count.active > 0
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-gray-100 text-gray-500"
                                            )}>
                                                {count.active} / {count.total} 可用
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-4 border-t">
                            <a
                                href="/accounts"
                                className="text-sm text-primary hover:underline"
                            >
                                管理账号 →
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Config */}
            <Card>
                <CardHeader>
                    <CardTitle>高级过滤</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">数量限制 (0为只受页数限制)</label>
                        <Input
                            type="number"
                            min={0}
                            value={globalConfig.crawl_limit_count}
                            onChange={e => setGlobalConfig({ ...globalConfig, crawl_limit_count: parseInt(e.target.value) || 0 })}
                            placeholder="例如: 100"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">最小点赞</label>
                            <Input
                                type="number"
                                min={0}
                                value={globalConfig.min_likes}
                                onChange={e => setGlobalConfig({ ...globalConfig, min_likes: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">最小分享</label>
                            <Input
                                type="number"
                                min={0}
                                value={globalConfig.min_shares}
                                onChange={e => setGlobalConfig({ ...globalConfig, min_shares: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">最小评论</label>
                            <Input
                                type="number"
                                min={0}
                                value={globalConfig.min_comments}
                                onChange={e => setGlobalConfig({ ...globalConfig, min_comments: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">最小收藏</label>
                            <Input
                                type="number"
                                min={0}
                                value={globalConfig.min_favorites}
                                onChange={e => setGlobalConfig({ ...globalConfig, min_favorites: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>



            {/* Actions */}
            <div className="flex items-center justify-between bg-card p-4 rounded-lg border border-border">
                <div className="text-sm text-muted-foreground">
                    状态: <span className={cn("font-bold", isRunning ? "text-green-500" : "text-muted-foreground")}>{isRunning ? "运行中" : "空闲"}</span>
                    <span className="ml-4">
                        已配置 {getEnabledTasks().length} 个任务
                    </span>
                </div>
                <div className="flex gap-4">
                    {!isRunning ? (
                        <Button onClick={handleStart} className="w-32" disabled={getEnabledTasks().length === 0}>
                            <Play className="w-4 h-4 mr-2" /> 开始爬虫
                        </Button>
                    ) : (
                        <Button onClick={handleStop} variant="destructive" className="w-32">
                            <Square className="w-4 h-4 mr-2" /> 停止
                        </Button>
                    )}
                </div>
            </div>

            {/* Logs */}
            <div>
                <h3 className="text-lg font-semibold mb-4">系统控制台</h3>
                <LogConsole logs={logs} />
            </div>
        </div >
    );
};

export default Dashboard;
