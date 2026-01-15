import React, { useEffect, useState } from 'react';
import { ContentListView } from '@/components/business/ContentListView';
import { fetchGrowHubContents, type GrowHubContentFilters } from '@/api';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertTriangle, Bell, Shield, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * 舆情监控页面
 * 展示预警内容，用于风险识别和舆情管理
 * 只显示 is_alert=true 的内容
 */
const SentimentPage: React.FC = () => {
    const [hasAlerts, setHasAlerts] = useState<boolean | null>(null);

    // 检查是否有预警数据
    useEffect(() => {
        const checkAlerts = async () => {
            try {
                const res = await fetchGrowHubContents({ is_alert: true, page: 1, page_size: 1 });
                setHasAlerts(res.total > 0);
            } catch (error) {
                setHasAlerts(false);
            }
        };
        checkAlerts();
    }, []);

    return (
        <div className="max-w-[1600px] mx-auto">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <h1 className="text-2xl font-bold">舆情监控</h1>
                </div>
                <p className="text-muted-foreground text-sm">
                    监控敏感内容和负面舆情，及时发现风险信号。触发预警的内容会自动显示在此。
                </p>
            </div>

            {/* Tips Card */}
            <Card className="mb-6 bg-amber-500/5 border-amber-500/20">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <Bell className="w-5 h-5 text-amber-500 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-medium text-amber-400 mb-1">如何触发舆情预警？</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• 在项目设置中配置"舆情敏感词"（如：差评、投诉、避雷等）</li>
                                <li>• 或将项目"任务目的"设置为"舆情监控"</li>
                                <li>• 当抓取的内容匹配敏感词时，会自动标记为预警并显示在此</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Alert Stats Summary */}
            {hasAlerts === false && (
                <Card className="mb-6 bg-green-500/5 border-green-500/20">
                    <CardContent className="p-8 text-center">
                        <Shield className="w-16 h-16 mx-auto text-green-500/50 mb-4" />
                        <h3 className="text-lg font-medium text-green-400 mb-2">暂无预警内容</h3>
                        <p className="text-muted-foreground text-sm mb-4">
                            当前没有触发预警的内容，这是个好消息！
                        </p>
                        <div className="flex justify-center gap-3">
                            <Button variant="outline" onClick={() => window.location.href = '/projects'}>
                                配置监控项目
                            </Button>
                            <Button variant="outline" onClick={() => window.location.href = '/data-management'}>
                                查看全量数据
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Content List - Only show alerts */}
            {hasAlerts !== false && (
                <ContentListView
                    defaultFilters={{
                        is_alert: true,
                        sort_by: 'crawl_time',
                        sort_order: 'desc',
                    }}
                    showStatsCards={true}
                    showCharts={false}
                    showFilters={true}
                    showExport={true}
                />
            )}
        </div>
    );
};

export default SentimentPage;
