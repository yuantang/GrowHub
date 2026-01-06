import React, { useState, useEffect } from 'react';
import {
    Calendar, Clock, Play, Pause, Trash2, Plus, RefreshCw,
    CheckCircle, XCircle, AlertCircle, Loader2, Settings, History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = 'http://localhost:8080/api';

interface ScheduledTask {
    id: string;
    name: string;
    task_type: string;
    description?: string;
    cron_expression?: string;
    interval_seconds?: number;
    params: Record<string, any>;
    is_active: boolean;
    last_run?: string;
    next_run?: string;
    run_count: number;
    created_at: string;
}

interface ExecutionLog {
    id: string;
    task_id: string;
    task_name: string;
    status: string;
    started_at: string;
    finished_at?: string;
    duration_seconds?: number;
    error_message?: string;
}

interface TaskType {
    value: string;
    label: string;
    description: string;
}

interface CronPreset {
    label: string;
    value: string;
}

const TASK_TYPE_LABELS: Record<string, string> = {
    crawler: '爬虫任务',
    keyword_monitor: '关键词监控',
    content_analysis: '内容分析',
    report: '生成报告',
    cleanup: '数据清理'
};

const PLATFORM_OPTIONS = [
    { value: 'xhs', label: '小红书' },
    { value: 'douyin', label: '抖音' },
    { value: 'bilibili', label: 'B站' },
    { value: 'weibo', label: '微博' },
    { value: 'zhihu', label: '知乎' },
];

const SchedulerPage: React.FC = () => {
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
    const [cronPresets, setCronPresets] = useState<CronPreset[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');

    // Create task form
    const [newTask, setNewTask] = useState({
        name: '',
        task_type: 'crawler',
        description: '',
        cron_expression: '',
        interval_seconds: 0,
        useInterval: false,
        params: {} as Record<string, any>
    });

    useEffect(() => {
        fetchTasks();
        fetchLogs();
        fetchTaskTypes();
        fetchCronPresets();
    }, []);

    const fetchTasks = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/scheduler/tasks`);
            const data = await response.json();
            setTasks(data.items || []);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
    };

    const fetchLogs = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/scheduler/logs?limit=50`);
            const data = await response.json();
            setLogs(data.items || []);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        }
    };

    const fetchTaskTypes = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/scheduler/task-types`);
            const data = await response.json();
            setTaskTypes(data.types || []);
        } catch (error) {
            console.error('Failed to fetch task types:', error);
        }
    };

    const fetchCronPresets = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/scheduler/cron-presets`);
            const data = await response.json();
            setCronPresets(data.presets || []);
        } catch (error) {
            console.error('Failed to fetch cron presets:', error);
        }
    };

    const createTask = async () => {
        if (!newTask.name.trim()) return;

        setLoading(true);
        try {
            const payload: any = {
                name: newTask.name,
                task_type: newTask.task_type,
                description: newTask.description || undefined,
                params: newTask.params
            };

            if (newTask.useInterval) {
                payload.interval_seconds = newTask.interval_seconds || 300;
            } else {
                payload.cron_expression = newTask.cron_expression || '0 * * * *';
            }

            const response = await fetch(`${API_BASE}/growhub/scheduler/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowCreateModal(false);
                setNewTask({
                    name: '',
                    task_type: 'crawler',
                    description: '',
                    cron_expression: '',
                    interval_seconds: 0,
                    useInterval: false,
                    params: {}
                });
                fetchTasks();
            }
        } catch (error) {
            console.error('Failed to create task:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleTask = async (taskId: string, isActive: boolean) => {
        try {
            const endpoint = isActive ? 'pause' : 'resume';
            await fetch(`${API_BASE}/growhub/scheduler/tasks/${taskId}/${endpoint}`, {
                method: 'POST'
            });
            fetchTasks();
        } catch (error) {
            console.error('Failed to toggle task:', error);
        }
    };

    const runTaskNow = async (taskId: string) => {
        try {
            await fetch(`${API_BASE}/growhub/scheduler/tasks/${taskId}/run`, {
                method: 'POST'
            });
            fetchTasks();
            fetchLogs();
        } catch (error) {
            console.error('Failed to run task:', error);
        }
    };

    const deleteTask = async (taskId: string) => {
        if (!confirm('确定要删除这个任务吗？')) return;

        try {
            await fetch(`${API_BASE}/growhub/scheduler/tasks/${taskId}`, {
                method: 'DELETE'
            });
            fetchTasks();
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    };

    const formatDateTime = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('zh-CN');
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'running':
                return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            default:
                return <AlertCircle className="w-4 h-4 text-yellow-500" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Calendar className="w-7 h-7 text-blue-500" />
                        任务调度中心
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        管理定时任务，实现自动化数据采集与分析
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { fetchTasks(); fetchLogs(); }}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        刷新
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        新建任务
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{tasks.length}</div>
                        <div className="text-sm text-muted-foreground">总任务数</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-500">
                            {tasks.filter(t => t.is_active).length}
                        </div>
                        <div className="text-sm text-muted-foreground">运行中</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-yellow-500">
                            {tasks.filter(t => !t.is_active).length}
                        </div>
                        <div className="text-sm text-muted-foreground">已暂停</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                            {tasks.reduce((sum, t) => sum + t.run_count, 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">总执行次数</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border pb-2">
                <button
                    onClick={() => setActiveTab('tasks')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${activeTab === 'tasks'
                            ? 'bg-primary/10 text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <Settings className="w-4 h-4" />
                    任务列表
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${activeTab === 'logs'
                            ? 'bg-primary/10 text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <History className="w-4 h-4" />
                    执行日志
                </button>
            </div>

            {/* Tasks List */}
            {activeTab === 'tasks' && (
                <div className="space-y-4">
                    {tasks.length === 0 ? (
                        <Card className="bg-card/50">
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>暂无定时任务</p>
                                <p className="text-sm mt-1">点击"新建任务"开始自动化</p>
                            </CardContent>
                        </Card>
                    ) : (
                        tasks.map(task => (
                            <Card key={task.id} className="bg-card/50">
                                <CardContent className="py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-3 h-3 rounded-full ${task.is_active ? 'bg-green-500' : 'bg-gray-500'}`} />
                                            <div>
                                                <div className="font-medium">{task.name}</div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-4">
                                                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                                        {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                                                    </span>
                                                    {task.cron_expression && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {task.cron_expression}
                                                        </span>
                                                    )}
                                                    {task.interval_seconds && (
                                                        <span>每 {task.interval_seconds} 秒</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                            <div className="text-right">
                                                <div>上次执行: {formatDateTime(task.last_run)}</div>
                                                <div>下次执行: {formatDateTime(task.next_run)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium text-foreground">{task.run_count}</div>
                                                <div>执行次数</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => runTaskNow(task.id)}
                                                    title="立即执行"
                                                >
                                                    <Play className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => toggleTask(task.id, task.is_active)}
                                                    title={task.is_active ? '暂停' : '恢复'}
                                                >
                                                    {task.is_active ? (
                                                        <Pause className="w-4 h-4" />
                                                    ) : (
                                                        <Play className="w-4 h-4 text-green-500" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => deleteTask(task.id)}
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
                        ))
                    )}
                </div>
            )}

            {/* Execution Logs */}
            {activeTab === 'logs' && (
                <Card className="bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-lg">执行历史</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {logs.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>暂无执行记录</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {logs.map(log => (
                                    <div
                                        key={log.id}
                                        className="flex items-center justify-between p-3 bg-background/50 rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(log.status)}
                                            <div>
                                                <div className="font-medium">{log.task_name}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {formatDateTime(log.started_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm">
                                            {log.duration_seconds !== undefined && (
                                                <div>耗时: {log.duration_seconds.toFixed(2)}s</div>
                                            )}
                                            {log.error_message && (
                                                <div className="text-red-500 text-xs max-w-xs truncate">
                                                    {log.error_message}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Create Task Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">新建定时任务</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">任务名称 *</label>
                                <input
                                    type="text"
                                    value={newTask.name}
                                    onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                                    placeholder="如: 每小时爬取小红书"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">任务类型</label>
                                <select
                                    value={newTask.task_type}
                                    onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                >
                                    {taskTypes.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Task-specific params */}
                            {newTask.task_type === 'crawler' && (
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">爬取平台</label>
                                    <select
                                        value={newTask.params.platform || 'xhs'}
                                        onChange={(e) => setNewTask({
                                            ...newTask,
                                            params: { ...newTask.params, platform: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        {PLATFORM_OPTIONS.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">调度方式</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={!newTask.useInterval}
                                            onChange={() => setNewTask({ ...newTask, useInterval: false })}
                                        />
                                        Cron 表达式
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={newTask.useInterval}
                                            onChange={() => setNewTask({ ...newTask, useInterval: true })}
                                        />
                                        固定间隔
                                    </label>
                                </div>
                            </div>

                            {!newTask.useInterval ? (
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">Cron 表达式</label>
                                    <select
                                        value={newTask.cron_expression}
                                        onChange={(e) => setNewTask({ ...newTask, cron_expression: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value="">选择预设...</option>
                                        {cronPresets.map(p => (
                                            <option key={p.value} value={p.value}>{p.label} ({p.value})</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">间隔时间 (秒)</label>
                                    <input
                                        type="number"
                                        min={60}
                                        value={newTask.interval_seconds || 300}
                                        onChange={(e) => setNewTask({ ...newTask, interval_seconds: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">最小 60 秒</p>
                                </div>
                            )}

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">描述 (可选)</label>
                                <input
                                    type="text"
                                    value={newTask.description}
                                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                    placeholder="任务描述..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                                取消
                            </Button>
                            <Button onClick={createTask} disabled={loading || !newTask.name.trim()}>
                                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                创建任务
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchedulerPage;
