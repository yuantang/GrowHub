import React from 'react';
import { ContentListView } from '@/components/business/ContentListView';
import { Users } from 'lucide-react';

/**
 * 达人博主页面
 * 展示发帖博主（去重），用于发现优质博主
 */
const CreatorsPage: React.FC = () => {
    return (
        <div className="max-w-[1600px] mx-auto">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <Users className="w-6 h-6 text-primary" />
                    <h1 className="text-2xl font-bold">达人博主</h1>
                </div>
                <p className="text-muted-foreground text-sm">
                    发现优质博主，按粉丝数和互动量筛选潜在合作对象
                </p>
            </div>
            <ContentListView
                defaultFilters={{
                    deduplicate_authors: true,
                    sort_by: 'like_count',
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

export default CreatorsPage;
