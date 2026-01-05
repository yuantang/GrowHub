import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Loader2,
    Trash2,
    RefreshCw,
    Play,
    Pause,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    Archive
} from 'lucide-react';
import type { Checkpoint } from '@/api';
import {
    fetchCheckpoints,
    fetchResumableCheckpoints,
    deleteCheckpoint,
    pauseCheckpoint,
    cleanupCheckpoints,
    startCrawler
} from '@/api';

const PLATFORM_LABELS: Record<string, string> = {
    xhs: '小红书',
    dy: '抖音',
    bili: 'B站',
    wb: '微博',
    ks: '快手',
    tieba: '贴吧',
    zhihu: '知乎',
};

const CRAWLER_TYPE_LABELS: Record<string, string> = {
    search: '关键词搜索',
    detail: '帖子详情',
    creator: '创作者',
    homefeed: '首页推荐',
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    running: {
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        label: '运行中'
    },
    paused: {
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        icon: <Pause className="w-3 h-3" />,
        label: '已暂停'
    },
    completed: {
        color: 'bg-green-100 text-green-700 border-green-200',
        icon: <CheckCircle className="w-3 h-3" />,
        label: '已完成'
    },
    failed: {
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: <XCircle className="w-3 h-3" />,
        label: '失败'
    },
};

const CheckpointsPage: React.FC = () => {
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'resumable'>('all');

    const loadCheckpoints = useCallback(async () => {
        setLoading(true);
        try {
            const data = filter === 'resumable'
                ? await fetchResumableCheckpoints()
                : await fetchCheckpoints();
            setCheckpoints(data);
        } catch (error) {
            console.error('Failed to fetch checkpoints', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadCheckpoints();
    }, [loadCheckpoints]);

    const handleDelete = async (taskId: string) => {
        if (!confirm('确定要删除这个断点记录吗？')) return;

        try {
            await deleteCheckpoint(taskId);
            loadCheckpoints();
        } catch (error) {
            console.error('Failed to delete checkpoint', error);
        }
    };

    const handlePause = async (taskId: string) => {
        try {
            await pauseCheckpoint(taskId);
            loadCheckpoints();
        } catch (error) {
            console.error('Failed to pause checkpoint', error);
        }
    };

    const handleResume = async (checkpoint: Checkpoint) => {
        try {
            // Resume crawler with checkpoint config
            const config = checkpoint.config as any;
            await startCrawler({
                platform: checkpoint.platform,
                login_type: config.login_type || 'qrcode',
                crawler_type: checkpoint.crawler_type,
                keywords: config.keywords || '',
                start_page: checkpoint.progress.current_page,
                enable_comments: config.enable_comments || false,
                enable_sub_comments: config.enable_sub_comments || false,
                save_option: config.save_option || 'csv',
                headless: config.headless || true,
            });
            alert('已恢复爬取任务');
            loadCheckpoints();
        } catch (error: any) {
            console.error('Failed to resume', error);
            alert(`恢复失败: ${error.response?.data?.detail || error.message}`);
        }
    };

    const handleCleanup = async () => {
        if (!confirm('确定要清理7天前的断点记录吗？')) return;

        try {
            await cleanupCheckpoints(7);
            loadCheckpoints();
        } catch (error) {
            console.error('Failed to cleanup checkpoints', error);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('zh-CN');
    };

    const getProgressPercent = (checkpoint: Checkpoint) => {
        const { current_page, total_pages } = checkpoint.progress;
        if (total_pages <= 0) return 0;
        return Math.min(100, Math.round((current_page / total_pages) * 100));
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">断点续爬</h1>
                    <p className="text-muted-foreground">管理爬取任务的断点记录，支持暂停和恢复</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCleanup}>
                        <Archive className="w-4 h-4 mr-2" />
                        清理旧记录
                    </Button>
                    <Button variant="outline" onClick={loadCheckpoints} disabled={loading}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                        刷新
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">总记录</p>
                                <p className="text-2xl font-bold">{checkpoints.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded-lg">
                                <Pause className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">可恢复</p>
                                <p className="text-2xl font-bold text-yellow-600">
                                    {checkpoints.filter(c => c.status === 'paused').length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">已完成</p>
                                <p className="text-2xl font-bold text-green-600">
                                    {checkpoints.filter(c => c.status === 'completed').length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <XCircle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">失败</p>
                                <p className="text-2xl font-bold text-red-600">
                                    {checkpoints.filter(c => c.status === 'failed').length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter */}
            <div className="flex gap-2">
                <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('all')}
                >
                    全部
                </Button>
                <Button
                    variant={filter === 'resumable' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('resumable')}
                >
                    可恢复
                </Button>
            </div>

            {/* Checkpoint List */}
            {loading ? (
                <div className="flex justify-center p-10">
                    <Loader2 className="animate-spin w-8 h-8" />
                </div>
            ) : checkpoints.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium mb-2">暂无断点记录</h3>
                        <p className="text-muted-foreground">开始爬取任务后，断点信息会自动保存在这里</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {checkpoints.map(checkpoint => {
                        const statusConfig = STATUS_CONFIG[checkpoint.status] || STATUS_CONFIG.failed;
                        const progress = getProgressPercent(checkpoint);

                        return (
                            <Card key={checkpoint.task_id}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-medium">
                                                    {PLATFORM_LABELS[checkpoint.platform] || checkpoint.platform}
                                                </span>
                                                <span className="text-muted-foreground">-</span>
                                                <span className="text-muted-foreground">
                                                    {CRAWLER_TYPE_LABELS[checkpoint.crawler_type] || checkpoint.crawler_type}
                                                </span>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs border flex items-center gap-1",
                                                    statusConfig.color
                                                )}>
                                                    {statusConfig.icon}
                                                    {statusConfig.label}
                                                </span>
                                            </div>

                                            <div className="text-sm text-muted-foreground space-y-1">
                                                <p>
                                                    任务ID: <code className="bg-muted px-1 rounded">{checkpoint.task_id}</code>
                                                </p>
                                                <p>
                                                    进度: 第 {checkpoint.progress.current_page} 页 / 共 {checkpoint.progress.total_pages} 页
                                                    ({checkpoint.progress.processed_items} 项)
                                                </p>
                                                {checkpoint.progress.current_keyword && (
                                                    <p>当前关键词: {checkpoint.progress.current_keyword}</p>
                                                )}
                                                <p>
                                                    创建: {formatDate(checkpoint.created_at)} |
                                                    更新: {formatDate(checkpoint.updated_at)}
                                                </p>
                                                {checkpoint.error_message && (
                                                    <p className="text-red-600">错误: {checkpoint.error_message}</p>
                                                )}
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full transition-all",
                                                        checkpoint.status === 'completed' ? 'bg-green-500' :
                                                            checkpoint.status === 'failed' ? 'bg-red-500' :
                                                                checkpoint.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'
                                                    )}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-4">
                                            {checkpoint.status === 'running' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handlePause(checkpoint.task_id)}
                                                >
                                                    <Pause className="w-4 h-4 mr-1" />
                                                    暂停
                                                </Button>
                                            )}
                                            {checkpoint.status === 'paused' && (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() => handleResume(checkpoint)}
                                                >
                                                    <Play className="w-4 h-4 mr-1" />
                                                    恢复
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(checkpoint.task_id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CheckpointsPage;
