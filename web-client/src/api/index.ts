import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
});

// Types based on backend schemas and routers
export interface ConfigOptions {
    login_types: { value: string; label: string }[];
    crawler_types: { value: string; label: string }[];
    save_options: { value: string; label: string }[];
}

export interface Platform {
    value: string;
    label: string;
    icon: string;
}

export const PlatformEnum = {
    XHS: "xhs",
    DOUYIN: "dy",
    KUAISHOU: "ks",
    BILIBILI: "bili",
    WEIBO: "wb",
    TIEBA: "tieba",
    ZHIHU: "zhihu",
} as const;
export type PlatformEnum = typeof PlatformEnum[keyof typeof PlatformEnum];

export const LoginTypeEnum = {
    QRCODE: "qrcode",
    PHONE: "phone",
    COOKIE: "cookie",
} as const;
export type LoginTypeEnum = typeof LoginTypeEnum[keyof typeof LoginTypeEnum];

export const CrawlerTypeEnum = {
    SEARCH: "search",
    DETAIL: "detail",
    CREATOR: "creator",
    HOMEFEED: "homefeed",
    LOGIN: "login",
} as const;
export type CrawlerTypeEnum = typeof CrawlerTypeEnum[keyof typeof CrawlerTypeEnum];

export const SaveDataOptionEnum = {
    CSV: "csv",
    DB: "db",
    JSON: "json",
    SQLITE: "sqlite",
    MONGODB: "mongodb",
    EXCEL: "excel",
} as const;
export type SaveDataOptionEnum = typeof SaveDataOptionEnum[keyof typeof SaveDataOptionEnum];

export interface CrawlerStartRequest {
    platform: PlatformEnum | string;
    login_type: LoginTypeEnum | string;
    crawler_type: CrawlerTypeEnum | string;
    keywords: string;
    specified_ids?: string;
    creator_ids?: string;
    start_page: number;
    enable_comments: boolean;
    enable_sub_comments: boolean;
    save_option: SaveDataOptionEnum | string;
    cookies?: string;
    headless: boolean;
    crawl_limit_count?: number;
    min_likes?: number;
    min_shares?: number;
    min_comments?: number;
    min_favorites?: number;
    concurrency_num?: number;
}

export interface CrawlerStatus {
    status: "idle" | "running" | "stopping" | "error";
    platform?: string;
    crawler_type?: string;
    started_at?: string;
    error_message?: string;
}

export interface LogEntry {
    id: number;
    timestamp: string;
    level: "info" | "warning" | "error" | "success" | "debug";
    message: string;
}

export interface DataFileInfo {
    name: string;
    path: string;
    size: number;
    modified_at: number;
    record_count?: number;
    type: string;
}

// API functions
export const fetchConfigOptions = () => api.get<ConfigOptions>('/config/options').then(res => res.data);
export const fetchPlatforms = () => api.get<{ platforms: Platform[] }>('/config/platforms').then(res => (res.data as any).platforms);
export const startCrawler = (config: CrawlerStartRequest) => api.post('/crawler/start', config);
export const stopCrawler = () => api.post('/crawler/stop');
export const fetchCrawlerStatus = () => api.get<CrawlerStatus>('/crawler/status').then(res => res.data);
export const fetchLogs = (limit = 100) => api.get<{ logs: LogEntry[] }>(`/crawler/logs?limit=${limit}`).then(res => (res.data as any).logs);

// File content + delete function
export const fetchDataFiles = (platform?: string, fileType?: string) =>
    api.get<{ files: DataFileInfo[] }>('/data/files', { params: { platform, file_type: fileType } }).then(res => (res.data as any).files);

export const fetchFileContent = (filePath: string, preview = true, limit = 100) =>
    api.get(`/data/files/${encodeURIComponent(filePath)}`, { params: { preview, limit } }).then(res => res.data);

export const downloadDataFile = (filePath: string) =>
    api.get(`/data/download/${encodeURIComponent(filePath)}`, { responseType: 'blob' });

export const deleteDataFile = (filePath: string) =>
    api.delete(`/data/files/${encodeURIComponent(filePath)}`);

export const fetchStats = () => api.get('/data/stats').then(res => res.data);

// ============ Checkpoint API ============
export interface Checkpoint {
    task_id: string;
    platform: string;
    crawler_type: string;
    status: 'running' | 'paused' | 'completed' | 'failed';
    progress: {
        current_page: number;
        total_pages: number;
        processed_items: number;
        current_keyword?: string;
        keywords_completed: string[];
        keywords_remaining: string[];
    };
    config: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    error_message?: string;
}

export const fetchCheckpoints = () =>
    api.get<{ checkpoints: Checkpoint[] }>('/checkpoints').then(res => res.data.checkpoints);

export const fetchResumableCheckpoints = () =>
    api.get<{ checkpoints: Checkpoint[] }>('/checkpoints/resumable').then(res => res.data.checkpoints);

export const fetchCheckpoint = (taskId: string) =>
    api.get<Checkpoint>(`/checkpoints/${taskId}`).then(res => res.data);

export const deleteCheckpoint = (taskId: string) =>
    api.delete(`/checkpoints/${taskId}`);

export const pauseCheckpoint = (taskId: string) =>
    api.post(`/checkpoints/${taskId}/pause`);

export const cleanupCheckpoints = (olderThanDays = 7) =>
    api.post('/checkpoints/cleanup', null, { params: { older_than_days: olderThanDays } });

// ============ Accounts API ============
export interface Account {
    id: string;
    platform: string;
    name: string;
    status: 'active' | 'disabled' | 'banned' | 'cooling' | 'expired';
    last_used: string | null;
    request_count: number;
    success_rate: number;
    cookies?: string;
    notes?: string;
}

export interface AccountStats {
    total_accounts: number;
    active_accounts: number;
    platforms: Record<string, { total: number; active: number; total_requests: number }>;
}

export interface AccountsResponse {
    accounts: Record<string, Account[]>;
    stats: AccountStats;
}

export const fetchAllAccounts = () =>
    api.get<AccountsResponse>('/accounts').then(res => res.data);

export const fetchAccountsByPlatform = (platform: string) =>
    api.get<{ accounts: Account[] }>(`/accounts/${platform}`).then(res => res.data.accounts);

export const addAccount = (platform: string, account: Partial<Account>) =>
    api.post(`/accounts/${platform}`, account);

export const updateAccount = (platform: string, accountId: string, updates: Partial<Account>) =>
    api.put(`/accounts/${platform}/${accountId}`, updates);

export const deleteAccount = (platform: string, accountId: string) =>
    api.delete(`/accounts/${platform}/${accountId}`);

export const activateAccount = (platform: string, accountId: string) =>
    api.post(`/accounts/${platform}/${accountId}/activate`);

export const disableAccount = (platform: string, accountId: string) =>
    api.post(`/accounts/${platform}/${accountId}/disable`);

export const fetchAccountsOverview = () =>
    api.get<{ stats: AccountStats }>('/accounts/stats/overview').then(res => res.data.stats);

// ============ AI API ============
export const fetchAIKeywords = (keyword: string, mode: 'risk' | 'trend', model?: string) =>
    api.post<{ keywords: string[] }>('/ai/suggest', { keyword, mode, model }).then(res => res.data.keywords);

// ============ Project API ============

export interface Project {
    id: number;
    name: string;
    description?: string;
    keywords: string[];
    sentiment_keywords: string[];
    platforms: string[];
    crawler_type: string;
    crawl_limit: number;
    crawl_date_range: number;
    enable_comments: boolean;
    deduplicate_authors: boolean;
    schedule_type: string;
    schedule_value: string;
    max_concurrency: number;
    is_active: boolean;
    alert_on_negative: boolean;
    alert_on_hotspot: boolean;
    alert_channels: string[];
    // Stats
    total_crawled: number;
    total_alerts: number;
    today_crawled: number;
    today_alerts: number;
    last_run_at?: string;
    next_run_at?: string;
    run_count: number;
    // 高级过滤
    min_likes: number;
    max_likes: number;
    min_comments: number;
    max_comments: number;
    min_shares: number;
    max_shares: number;
    min_favorites: number;
    max_favorites: number;
    // 断点信息
    latest_checkpoint?: {
        task_id: string;
        status: string;
        total_notes: number;
        total_comments: number;
        total_errors: number;
        current_page: number;
        last_update: string;
    } | null;
}


export const fetchProject = (id: number) =>
    api.get<Project>(`/growhub/projects/${id}`).then(res => res.data);

export const updateProject = (id: number, data: Partial<Project>) =>
    api.put<{ message: string; project: Project }>(`/growhub/projects/${id}`, data).then(res => res.data);

// ============ Project Detail API ============
export interface ProjectContentFilters {
    platform?: string;
    sentiment?: string;
    deduplicate_authors?: boolean;
}

export interface ProjectContentItem {
    id: number;
    platform: string;
    title: string;
    description: string;
    url: string;
    author: string;
    author_id?: string;
    author_avatar?: string;
    author_fans?: number;
    author_likes?: number;
    cover_url?: string;
    publish_time: string;
    crawl_time?: string;  // Fix: add missing crawl_time
    sentiment: string;
    view_count: number;
    like_count: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
    is_alert: boolean;
    source_keyword: string;
    // 新增字段：支持视频播放
    content_type?: string;
    video_url?: string;
    media_urls?: string[];
}

export interface ProjectContentListResponse {
    items: ProjectContentItem[];
    total: number;
    page: number;
    page_size: number;
    error?: string;
}

export interface ProjectStatsChartResponse {
    dates: string[];
    sentiment_trend: {
        positive: number[];
        neutral: number[];
        negative: number[];
    };
    platform_dist: { name: string; value: number }[];
}

export const fetchProjectContents = (projectId: number, page: number, pageSize: number, filters?: ProjectContentFilters) =>
    api.get<ProjectContentListResponse>(`/growhub/projects/${projectId}/contents`, { params: { page, page_size: pageSize, ...filters } }).then(res => res.data);

export const fetchProjectStatsChart = (projectId: number, days = 7) =>
    api.get<ProjectStatsChartResponse>(`/growhub/projects/${projectId}/stats-chart`, { params: { days } }).then(res => res.data);


// ============ GrowHub Content (Data Pool) API ============

export interface GrowHubContentItem {
    id: number;
    platform: string;
    platform_content_id: string;
    content_type: string;
    title: string;
    description: string;
    content_url: string;
    cover_url: string;
    video_url?: string;  // 可播放的视频URL
    author_id: string;
    author_name: string;
    author_avatar: string;
    author_fans_count?: number;
    author_follows_count?: number;  // 作者关注数
    author_likes_count?: number;    // 作者获赞数
    author_contact?: string;
    ip_location?: string;           // IP归属地
    media_urls?: string[];
    like_count: number;
    comment_count: number;
    share_count: number;
    collect_count: number;
    view_count: number;
    engagement_rate: number;
    category: string;
    sentiment: string;
    source_keyword: string;
    is_alert: boolean;
    alert_level: string | null;
    is_handled: boolean;
    publish_time: string | null;
    crawl_time: string;
}

export interface GrowHubContentListResponse {
    items: GrowHubContentItem[];
    total: number;
}

export interface GrowHubContentStats {
    total: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_collects: number;
    total_views: number;
    avg_likes: number;
    by_platform: Record<string, number>;
    by_sentiment: Record<string, number>;
    by_category: Record<string, number>;
    alerts: {
        total: number;
        unhandled: number;
    };
}

export interface TopAnalysisItem {
    id: number;
    title: string;
    like_count: number;
    comment_count: number;
}

export interface GrowHubContentFilters {
    page?: number;
    page_size?: number;
    deduplicate_authors?: boolean;
    platform?: string;
    category?: string;
    sentiment?: string;
    is_alert?: boolean;
    is_handled?: boolean;
    search?: string;
    source_keyword?: string;
    start_date?: string;
    end_date?: string;
    min_likes?: number;
    min_comments?: number;
    min_shares?: number;
    max_likes?: number;
    max_comments?: number;
    max_shares?: number;
    crawl_start_date?: string;
    crawl_end_date?: string;
    sort_by?: string;
    sort_order?: string;
}

// Helper to clean params (remove null/undefined/empty string)
const cleanParams = (params: any) => {
    const cleaned: any = {};
    Object.keys(params).forEach(key => {
        const value = params[key];
        if (value !== undefined && value !== null && value !== '') {
            cleaned[key] = value;
        }
    });
    return cleaned;
};

export const fetchGrowHubContents = (page: number, pageSize: number, filters?: GrowHubContentFilters) =>
    api.get<GrowHubContentListResponse>('/growhub/content/list', { params: cleanParams({ page, page_size: pageSize, ...filters }) }).then(res => res.data);

export const fetchGrowHubStats = (filters?: GrowHubContentFilters) =>
    api.get<GrowHubContentStats>('/growhub/content/stats', { params: cleanParams({ ...filters }) }).then(res => res.data);

export const fetchTopAnalysis = (limit = 10, filters?: GrowHubContentFilters) =>
    api.get<TopAnalysisItem[]>('/growhub/content/top_analysis', { params: cleanParams({ limit, ...filters }) }).then(res => res.data);

export const fetchGrowHubTrend = (days = 7, filters?: GrowHubContentFilters) =>
    api.get<{ platform: string | null; days: number; data: any[] }>('/growhub/content/trend', { params: cleanParams({ days, ...filters }) }).then(res => res.data);

export const getGrowHubExportUrl = (filters: GrowHubContentFilters) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            if (key === 'page' || key === 'page_size') return;
            params.append(key, String(value));
        }
    });
    return `/api/growhub/content/export?${params.toString()}`;
};

export default api;


