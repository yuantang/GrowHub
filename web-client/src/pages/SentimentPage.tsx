import React from 'react';
import { ContentListView } from '@/components/business/ContentListView';
import { AlertTriangle } from 'lucide-react';

/**
 * 舆情监控页面
 * 展示预警内容，用于风险识别和舆情管理
 */
const SentimentPage: React.FC = () => {
    return (
        <div className="max-w-[1600px] mx-auto">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <h1 className="text-2xl font-bold">舆情监控</h1>
                </div>
                <p className="text-muted-foreground text-sm">
                    监控敏感内容和负面舆情，及时发现风险信号
                </p>
            </div>
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
        </div>
    );
};

export default SentimentPage;
