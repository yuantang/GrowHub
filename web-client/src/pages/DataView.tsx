import React from 'react';
import { ContentListView } from '@/components/business/ContentListView';

/**
 * 数据管理页面
 * 展示全量数据，是数据仓库/数据中心
 */
const DataView: React.FC = () => {
    return (
        <div className="max-w-[1600px] mx-auto">
            <ContentListView
                showStatsCards={true}
                showCharts={true}
                showFilters={true}
                showExport={true}
            />
        </div>
    );
};

export default DataView;
