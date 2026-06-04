import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    // 避免后端被爬虫任务占满时页面无限转圈
    timeout: 120000,
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
    min_favorites?: number;
    min_fans?: number;
    max_fans?: number;
    require_contact?: boolean;
    sentiment_keywords?: string[];
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

// ========== System ==========
export interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
}

export const fetchLocalFileSystem = async (path?: string): Promise<FileEntry[]> => {
  const params = new URLSearchParams();
  if (path) params.append("path", path);
  const response = await api.get(`/growhub/system/fs/list?${params.toString()}`);
  return response.data;
};

export const parseLocalExcel = async (path: string): Promise<any[]> => {
  const response = await api.post('/growhub/system/fs/parse_excel', { path });
  return response.data;
};

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
    role?: string; // content/data
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

// ============ GrowHub Account Pool API ============
export interface GrowHubAccount {
    id: string;
    platform: string;
    account_name: string;
    cookies: string;
    status: string;
    health_score: number;
    use_count: number;
    success_count: number;
    fail_count: number;
    last_used?: string;
    last_check?: string;
    group: string;
    tags: string[];
    notes?: string;
    updated_at?: string;
}

export interface GrowHubAccountStats {
    total: number;
    by_status: Record<string, number>;
    by_platform: Record<string, number>;
    avg_health: number;
    total_uses: number;
    success_rate: number;
}

export const fetchGrowHubAccounts = (platform?: string, status?: string) =>
    api.get<{ items: GrowHubAccount[] }>('/growhub/accounts/', { params: cleanParams({ platform, status }) }).then(res => res.data);

export const fetchGrowHubAccountStats = () =>
    api.get<GrowHubAccountStats>('/growhub/accounts/statistics').then(res => res.data);
export const fetchGrowHubAccount = (accountId: string) =>
    api.get<GrowHubAccount>(`/growhub/accounts/${accountId}`).then(res => res.data);

export interface AccountPublishProfile {
  nickname: string;
  nickname_display: string;
  source: string;
  warning?: string;
}

export const fetchAccountPublishProfile = (accountId: string, platform = "dy") =>
  api
    .get<{ success: boolean; data: AccountPublishProfile }>(
      `/growhub/accounts/${accountId}/publish-profile`,
      { params: { platform } }
    )
    .then((res) => res.data);

export const addGrowHubAccount = (data: Partial<GrowHubAccount>) =>
    api.post('/growhub/accounts/', data).then(res => res.data);

export const checkGrowHubAccountHealth = (accountId: string) =>
    api.post(`/growhub/accounts/${accountId}/check`).then(res => res.data);

export const checkAllGrowHubAccounts = () =>
    api.post('/growhub/accounts/check-all').then(res => res.data);

export const deleteGrowHubAccount = (accountId: string) =>
    api.delete(`/growhub/accounts/${accountId}`).then(res => res.data);

export const startGrowHubQRLogin = (platform: string) =>
    api.post('/growhub/accounts/qr-login/start', { platform }).then(res => res.data);

export const getGrowHubQRLoginStatus = (sessionId: string) =>
    api.get(`/growhub/accounts/qr-login/status/${sessionId}`).then(res => res.data);

export const cancelGrowHubQRLogin = (sessionId: string) =>
    api.post(`/growhub/accounts/qr-login/cancel/${sessionId}`).then(res => res.data);

export interface CookieBridgeStatus {
    reachable: boolean;
    base_url: string;
    client_count?: number;
    clients: Array<{
        client_id: string;
        connected?: boolean;
        nicknames?: Record<string, string>;
        platforms?: Record<string, unknown>;
    }>;
    error?: string;
}

export interface CookieBridgeSyncResult {
    success: boolean;
    message: string;
    synced: number;
    updated: number;
    skipped: number;
    errors?: string[];
    base_url?: string;
}

export const fetchCookieBridgeStatus = () =>
    api.get<CookieBridgeStatus>('/growhub/accounts/cookiebridge/status').then(res => res.data);

export const syncCookieBridgeToAccountPool = (only_connected = true) =>
    api
        .post<CookieBridgeSyncResult>('/growhub/accounts/cookiebridge/sync', {
            only_connected,
        })
        .then(res => res.data);

// ============ Project API ============

export interface Project {
    id: number;
    name: string;
    description?: string;
    keywords: string[];
    sentiment_keywords: string[];
    platforms: string[];
    capture_mode?: string;  // hot_content | hot_creator | watch_content | watch_creator
    watch_targets?: { type: string; platform: string; url: string; content_id?: string; label?: string }[];
    purpose: string;  // 由 capture_mode 推导
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
    alert_on_new_content: boolean;
    alert_on_hotspot: boolean;
    alert_channels: (string | number)[];
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
    min_fans: number;
    max_fans: number;
    require_contact: boolean;
    creator_account_type?: 'all' | 'competitor' | 'partner';
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


export const fetchProjects = () =>
    api.get<Project[]>('/growhub/projects').then(res => res.data);

export const fetchDashboardStats = () =>
    api.get<any>('/growhub/projects/dashboard/stats').then(res => res.data);

export const createProject = (data: any) =>
    api.post<Project>('/growhub/projects', data).then(res => res.data);

export interface ParseWatchUrlsResult {
    targets: { type: string; platform: string; url: string; content_id?: string; label?: string }[];
    valid_count: number;
    invalid_count: number;
    invalid_lines: string[];
}

export const parseWatchUrls = (urls_text: string, mode: string = "watch_content") =>
    api
        .post<ParseWatchUrlsResult>('/growhub/projects/parse-watch-urls', { urls_text, mode })
        .then((res) => res.data);

export const fetchProject = (id: number) =>
    api.get<Project>(`/growhub/projects/${id}`).then(res => res.data);

export const updateProject = (id: number, data: Partial<Project>) =>
    api.put<{ message: string; project: Project }>(`/growhub/projects/${id}`, data).then(res => res.data);

export const deleteProject = (id: number) =>
    api.delete(`/growhub/projects/${id}`).then(res => res.data);

export const startProject = (id: number) =>
    api.post(`/growhub/projects/${id}/start`).then(res => res.data);

export const stopProject = (id: number) =>
    api.post(`/growhub/projects/${id}/stop`).then(res => res.data);

export const runProjectImmediately = (id: number) =>
    api.post(`/growhub/projects/${id}/run`).then(res => res.data);

export const fetchProjectPreflight = (id: number) =>
    api.get(`/growhub/projects/${id}/preflight`).then(res => res.data);

export const fetchProjectLogs = (id: number) =>
    api.get<{ logs: string[] }>(`/growhub/projects/${id}/logs`).then(res => res.data.logs);

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
    author_unique_id?: string;
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
    author_url?: string;
    author_fans_count?: number;
    author_follows_count?: number;  // 作者关注数
    author_likes_count?: number;    // 作者获赞数
    author_contact?: string;
    ip_location?: string;           // IP归属地
    author_unique_id?: string;       // 抖音号/快手号等
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
    min_fans?: number;
    max_fans?: number;
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

export interface SuggestedComment {
    style: string;
    content: string;
    expected_effect: string;
}

export interface ContentInsight {
    id: number;
    title: string;
    sentiment: string;
    sentiment_score: number;
    category: string;
    keywords: string[];
    core_issues: string[];
    suggested_comments: SuggestedComment[];
    has_history: boolean;
    history: Array<{
        date: string;
        like_count: number;
        comment_count: number;
        share_count: number;
        view_count: number;
    }>;
}

export const fetchContentAIInsight = (contentId: number) =>
    api.post<ContentInsight>(`/growhub/content/${contentId}/insight`).then(res => res.data);

export const batchUpdateGrowHubContents = (data: {
    ids: number[];
    is_handled?: boolean;
    is_alert?: boolean;
    category?: string;
    sentiment?: string;
}) =>
    api.post<{ message: string; updated_count: number }>('/growhub/content/batch-update', data).then(res => res.data);

export const batchDeleteGrowHubContents = (ids: number[]) =>
    api.post<{ message: string; deleted_count: number }>('/growhub/content/batch-delete', { ids }).then(res => res.data);

export const addContentToPool = (contentId: number, poolType: 'hotspot' = 'hotspot') =>
    api.post<{ message: string; id: number }>(`/growhub/content/${contentId}/add-to-pool`, { pool_type: poolType }).then(res => res.data);

// ============ Purpose Enum ============
export const ProjectPurpose = {
    CREATOR: "creator",
    HOTSPOT: "hotspot",
    SENTIMENT: "sentiment",
    GENERAL: "general",
} as const;
export type ProjectPurpose = typeof ProjectPurpose[keyof typeof ProjectPurpose];

export const ProjectPurposeLabels: Record<string, string> = {
    creator: "找达人博主",
    hotspot: "找热点排行",
    sentiment: "舆情监控",
    general: "通用数据",
};

// ============ Creator (达人博主) API ============
export interface Creator {
    id: number;
    platform: string;
    author_id: string;
    unique_id?: string;
    author_name?: string;
    author_avatar?: string;
    author_url?: string;
    signature?: string;
    fans_count: number;
    follows_count: number;
    likes_count: number;
    works_count: number;
    contact_info?: string;
    ip_location?: string;
    avg_likes: number;
    avg_comments: number;
    content_count: number;
    status: string;
    notes?: string;
    source_project_id?: number;
    source_keyword?: string;
    first_seen_at?: string;
    last_updated_at?: string;
    created_at?: string;
    crawl_status?: string; // new/waiting/profiled/failed
    last_profile_crawl_at?: string;
}

export interface CreatorListResponse {
    total: number;
    items: Creator[];
}

export interface CreatorStats {
    total: number;
    by_status: Record<string, number>;
    by_platform: Record<string, number>;
}

export interface CreatorFilters {
    platform?: string;
    source_project_id?: number;
    status?: string;
    min_fans?: number;
    max_fans?: number;
    source_keyword?: string;
    sort_by?: string;
    sort_order?: string;
    page?: number;
    page_size?: number;
}

export const fetchCreators = (filters?: CreatorFilters) =>
    api.get<CreatorListResponse>('/growhub/creators/list', { params: cleanParams(filters || {}) }).then(res => res.data);

export const fetchCreatorStats = (source_project_id?: number) =>
    api.get<CreatorStats>('/growhub/creators/stats', { params: cleanParams({ source_project_id }) }).then(res => res.data);

export const fetchCreator = (id: number) =>
    api.get<Creator>(`/growhub/creators/${id}`).then(res => res.data);

export const updateCreatorStatus = (id: number, status: string, notes?: string) =>
    api.patch(`/growhub/creators/${id}/status`, { status, notes });

export const deleteCreator = (id: number) =>
    api.delete(`/growhub/creators/${id}`);

// ============ Hotspot (热点内容) API ============
export interface Hotspot {
    id: number;
    rank: number;
    content_id?: number;
    platform_content_id?: string;
    platform?: string;
    title?: string;
    author_name?: string;
    cover_url?: string;
    content_url?: string;
    heat_score: number;
    like_count: number;
    comment_count: number;
    share_count: number;
    view_count: number;
    rank_date?: string;
    source_project_id?: number;
    source_keyword?: string;
    publish_time?: string;
    entered_at?: string;
    video_url?: string;
    author_id?: string;
    author_url?: string;
    author_avatar?: string;
    
    // AI 评估字段
    alignment_score?: number;
    recency_score?: number;
    duration_label?: string;
    is_valid?: boolean;
    validity_status?: string;
    ai_features?: {
        user_pain_points?: string[];
        faq?: string[];
        hooks?: string[];
    };
    ai_evaluation?: string;
    custom_categories?: string[];
    is_competitor?: boolean;
    history_trends?: Array<{
        record_date: string;
        like_count: number;
        comment_count: number;
        share_count: number;
        view_count: number;
    }>;
    growth_score?: number;
    growth_days?: number;
    growth_from_date?: string;
    growth_to_date?: string;
    source_project_name?: string;
}

export interface HotspotListResponse {
    total: number;
    items: Hotspot[];
}

export interface HotspotStats {
    total: number;
    today_count: number;
    by_platform: Record<string, number>;
    avg_heat_score: number;
}

export interface HotspotFilters {
    platform?: string;
    source_project_id?: number;
    source_keyword?: string;
    rank_start_date?: string;
    rank_end_date?: string;
    start_date?: string;
    end_date?: string;
    min_heat?: number;
    is_valid?: boolean;
    is_competitor?: boolean;
    sort_by?: string;
    sort_order?: string;
    page?: number;
    page_size?: number;
    capture_mode?: string;
}

export const fetchHotspots = (filters?: HotspotFilters) =>
    api.get<HotspotListResponse>('/growhub/hotspots/list', { params: cleanParams(filters || {}) }).then(res => res.data);

export const fetchHotspotRanking = (rank_date?: string, platform?: string, limit = 50) =>
    api.get<Hotspot[]>('/growhub/hotspots/ranking', { params: cleanParams({ rank_date, platform, limit }) }).then(res => res.data);

export const fetchRisingHotspots = (days = 7, platform?: string, limit = 10) =>
    api.get<Hotspot[]>('/growhub/hotspots/rising', { params: cleanParams({ days, platform, limit }) }).then(res => res.data);

export const fetchHotspotStats = (source_project_id?: number) =>
    api.get<HotspotStats>('/growhub/hotspots/stats', { params: cleanParams({ source_project_id }) }).then(res => res.data);

export const fetchHotspot = (id: number) =>
    api.get<Hotspot>(`/growhub/hotspots/${id}`).then(res => res.data);

export interface HotspotTopComment {
    content: string;
    like_count: number;
    nickname: string;
    pictures: string[];
}

export const fetchHotspotTopComments = (hotspotId: number, limit = 10) =>
    api
        .get<HotspotTopComment[]>(`/growhub/hotspots/${hotspotId}/top-comments`, {
            params: { limit },
        })
        .then((res) => res.data);

export const deleteHotspot = (id: number) =>
    api.delete(`/growhub/hotspots/${id}`);

// ============ Script Pipeline API ============

export interface ScriptSegment {
    id: number;
    task_id: number;
    order_index: number;
    time_range?: string;
    narration?: string;
    shot_desc?: string;
    visual_hint?: string;
    mood?: string;
    status: string;
    version_history?: unknown[];
}

export interface ScriptTask {
    id: number;
    hotspot_id?: number;
    title?: string;
    source_content?: string;
    platform?: string;
    content_type?: string;
    style?: string;
    status: string;
    current_step: number;
    analysis_result?: Record<string, unknown>;
    final_script?: string;
    variants?: { angle: string; title: string; script: string }[];
    brand_keywords?: string[];
    target_topic?: string;
    segments?: ScriptSegment[];
    created_at?: string;
    updated_at?: string;
    // 视频渲染字段
    video_status?: 'none' | 'preparing' | 'tts' | 'composing' | 'rendering' | 'done' | 'error';
    video_path?: string;
    video_error?: string;
    broll_video_status?: 'none' | 'preparing' | 'tts' | 'composing' | 'rendering' | 'done' | 'error';
    broll_video_path?: string;
    broll_video_error?: string;
    segments?: ScriptSegment[];
    video_render_started_at?: string;
    video_render_done_at?: string;
}

export const createScriptFromRemix = (data: {
    remix_script: string;
    voice_script?: string;
    title?: string;
    platform?: string;
    platform_content_id?: string;
    video_url?: string;
}) => api.post<ScriptTask>('/growhub/scripts/from-remix', data).then((res) => res.data);

export const fetchScriptTasks = (limit = 30) =>
    api.get<{ items: ScriptTask[] }>('/growhub/scripts', { params: { limit } }).then((res) => res.data.items);

export const createScriptTask = (data: {
    hotspot_id?: number;
    title?: string;
    source_content?: string;
    platform?: string;
    content_type?: string;
    style?: string;
    target_topic?: string;
    brand_keywords?: string[];
}) => api.post<ScriptTask>('/growhub/scripts', data).then((res) => res.data);

export const fetchScriptTask = (id: number) =>
    api.get<ScriptTask>(`/growhub/scripts/${id}`).then((res) => res.data);

export const analyzeScriptTask = (id: number) =>
    api.post<{ success: boolean; analysis: Record<string, unknown>; task: ScriptTask }>(
        `/growhub/scripts/${id}/analyze`,
    ).then((res) => res.data);

export const draftScriptTask = (id: number, duration_seconds = 60) =>
    api.post<ScriptTask>(`/growhub/scripts/${id}/draft`, { duration_seconds }).then((res) => res.data);

export type ScriptDraftStreamHandlers = {
    onStatus?: (message: string) => void;
    onChunk?: (text: string) => void;
    onDone?: (task: ScriptTask) => void;
    onError?: (message: string) => void;
};

/** SSE 流式生成脚本初稿 */
export const draftScriptTaskStream = async (
    taskId: number,
    handlers: ScriptDraftStreamHandlers,
    duration_seconds = 60,
) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/growhub/scripts/${taskId}/draft/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ duration_seconds }),
    });

    if (!res.ok) {
        let detail = res.statusText;
        try {
            const j = await res.json();
            detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch {
            /* ignore */
        }
        handlers.onError?.(detail);
        return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
        handlers.onError?.('浏览器不支持流式响应');
        return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let dataLine = '';
            for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                if (line.startsWith('data: ')) dataLine = line.slice(6);
            }
            if (!dataLine) continue;
            try {
                const parsed = JSON.parse(dataLine);
                if (eventType === 'status') handlers.onStatus?.(parsed.message);
                else if (eventType === 'chunk') handlers.onChunk?.(parsed.text);
                else if (eventType === 'done') handlers.onDone?.(parsed.task);
                else if (eventType === 'error') handlers.onError?.(parsed.message);
            } catch {
                /* ignore malformed */
            }
        }
    }
};

export const updateScriptSegment = (
    taskId: number,
    segmentId: number,
    data: Partial<Pick<ScriptSegment, 'narration' | 'shot_desc' | 'visual_hint' | 'mood' | 'time_range' | 'status'>>,
) => api.patch<ScriptSegment>(`/growhub/scripts/${taskId}/segment/${segmentId}`, data).then((res) => res.data);

export const rewriteScriptSegment = (taskId: number, segmentId: number, rewrite_suggestion: string) =>
    api
        .post<ScriptSegment>(`/growhub/scripts/${taskId}/segment/${segmentId}/rewrite`, {
            rewrite_suggestion,
        })
        .then((res) => res.data);

export const batchConfirmScriptSegments = (id: number) =>
    api.post<ScriptTask>(`/growhub/scripts/${id}/segments/confirm-all`).then((res) => res.data);

export const finalizeScriptTask = (id: number) =>
    api.post<ScriptTask>(`/growhub/scripts/${id}/finalize`).then((res) => res.data);

export const generateScriptVariants = (id: number, count = 3) =>
    api
        .post<{ success: boolean; variants: ScriptTask['variants']; task: ScriptTask }>(
            `/growhub/scripts/${id}/variants`,
            null,
            { params: { count } },
        )
        .then((res) => res.data);

// ============ Video Generation API ============

export interface VideoRenderStatus {
    found: boolean;
    task_id: number;
    video_status: string;
    video_path?: string;
    video_error?: string;
    broll_status?: string;
    broll_video_path?: string;
    broll_error?: string;
    video_render_started_at?: string;
    video_render_done_at?: string;
}

export type VideoRenderEvent =
    | { event: 'status'; data: { message: string; step: number; total: number } }
    | { event: 'progress'; data: { message: string; current: number; total: number } }
    | { event: 'done'; data: { video_path: string; duration_seconds: number; beats: number } }
    | { event: 'error'; data: { message: string } };

export interface VideoRenderHandlers {
    onStatus?: (msg: string, step: number, total: number) => void;
    onProgress?: (msg: string, current: number, total: number) => void;
    onDone?: (data: { video_path: string; duration_seconds: number; beats: number }) => void;
    onError?: (msg: string) => void;
    voice?: string;
}

/** 触发视频渲染，SSE 流式返回进度 */
export const renderScriptVideo = async (taskId: number, handlers: VideoRenderHandlers) => {
    const url = handlers.voice 
        ? `/api/growhub/video/${taskId}/render?voice=${encodeURIComponent(handlers.voice)}`
        : `/api/growhub/video/${taskId}/render`;
        
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok || !res.body) {
        handlers.onError?.(`请求失败: ${res.status}`);
        return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
            const lines = part.split('\n');
            let event = '';
            let data = '';
            for (const line of lines) {
                if (line.startsWith('event: ')) event = line.slice(7).trim();
                if (line.startsWith('data: ')) data = line.slice(6).trim();
            }
            if (!event || !data) continue;
            try {
                const payload = JSON.parse(data);
                if (event === 'status') handlers.onStatus?.(payload.message, payload.step, payload.total);
                else if (event === 'progress') handlers.onProgress?.(payload.message, payload.current, payload.total);
                else if (event === 'done') handlers.onDone?.(payload);
                else if (event === 'error') handlers.onError?.(payload.message);
            } catch {
                // ignore parse errors
            }
        }
    }
};

/** 查询视频渲染状态 */
export const fetchVideoStatus = (taskId: number) =>
    api.get<VideoRenderStatus>(`/growhub/video/${taskId}/status`).then((res) => res.data);

/** 获取视频下载 URL */
export const getVideoDownloadUrl = (taskId: number) =>
    `/api/growhub/video/${taskId}/download`;

// ============ Auth API ============

export interface User {
    id: number;
    username: string;
    email: string | null;
    role: "admin" | "user";
    status: "active" | "disabled" | "pending";
    created_at: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: User; // Backend login endpoint returns access_token, but we might need a separate call for user details or modify backend to return user
}

// Interceptor to inject token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor: clear session on auth failures (401 or invalid-token 403)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const detail = error.response?.data?.detail;
        const isAuthFailure =
            status === 401 ||
            (status === 403 &&
                (detail === 'Could not validate credentials' ||
                    detail === 'Not authenticated'));
        if (isAuthFailure) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (
                !window.location.pathname.startsWith('/login') &&
                !window.location.pathname.startsWith('/register')
            ) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const login = (data: FormData) =>
    api.post<AuthResponse>('/auth/login', data).then(res => res.data);

export const register = (data: any) =>
    api.post<User>('/auth/register', data).then(res => res.data);

export const fetchCurrentUser = () =>
    api.get<User>('/auth/me').then(res => res.data);



// ============ Notification API ============
export interface NotificationChannel {
    id: number;
    name: string;
    channel_type: string;
    config: Record<string, any>;
    is_active: boolean;
}

export const fetchNotificationChannels = () =>
    api.get<NotificationChannel[]>('/growhub/notifications/channels')
       .then(res => Array.isArray(res.data) ? res.data : (res.data as any).items || [])
       .catch(() => []); // Fallback to empty array if endpoint is missing
export const fetchProjectPlatforms = () =>
    api.get<{ platforms: Platform[] }>('/growhub/projects/platforms/options').then(res => res.data.platforms);


// --- Admin User Management ---
export const getAdminUsers = async (status?: string) => {
  const params = status ? { status } : {};
  const response = await api.get('/admin/users', { params });
  return response.data;
};

export const approveUser = async (userId: number) => {
  const response = await api.patch(`/admin/users/${userId}/approve`);
  return response.data;
};

export const disableUser = async (userId: number) => {
  const response = await api.patch(`/admin/users/${userId}/disable`);
  return response.data;
};

export const deleteUser = async (userId: number) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

export const updateUserRole = async (userId: number, role: "admin" | "user") => {
  const response = await api.patch(`/admin/users/${userId}/role?role=${role}`);
  return response.data;
};

// ============ Analytics API ============

export interface KeywordTrendPoint {
    date: string;
    count: number;
}

export interface KeywordTrendResponse {
    keyword: string;
    trend: KeywordTrendPoint[];
    total: number;
}

export interface CreatorLeaderboardItem {
    author_id: string;
    author_name: string;
    author_avatar: string | null;
    platform: string;
    content_count: number;
    total_likes: number;
    total_comments: number;
    avg_engagement: number;
}

export interface CollectionStatsResponse {
    total_contents: number;
    today_contents: number;
    week_contents: number;
    month_contents: number;
    by_platform: Record<string, number>;
    by_sentiment: Record<string, number>;
}

export interface PlatformDistributionItem {
    platform: string;
    count: number;
    percentage: number;
}

export const fetchKeywordTrends = (days = 7, limit = 5, projectId?: number) =>
    api.get<KeywordTrendResponse[]>('/growhub/analytics/keyword-trends', {
        params: cleanParams({ days, limit, project_id: projectId })
    }).then(res => res.data);

export const fetchCreatorLeaderboard = (days = 30, limit = 10, platform?: string, sortBy?: string) =>
    api.get<CreatorLeaderboardItem[]>('/growhub/analytics/creator-leaderboard', {
        params: cleanParams({ days, limit, platform, sort_by: sortBy })
    }).then(res => res.data);

export const fetchCollectionStats = (projectId?: number) =>
    api.get<CollectionStatsResponse>('/growhub/analytics/collection-stats', {
        params: cleanParams({ project_id: projectId })
    }).then(res => res.data);

export const fetchPlatformDistribution = (days = 30, projectId?: number) =>
    api.get<PlatformDistributionItem[]>('/growhub/analytics/platform-distribution', {
        params: cleanParams({ days, project_id: projectId })
    }).then(res => res.data);

// ─────────────── Video Remix (ContentRemixAgent 代理) ───────────────

export interface RemixMode {
    key?: string;
    value?: string;   // ContentRemixAgent 返回的字段名
    label: string;
    description?: string;
    is_active?: boolean;
}

export interface RemixSession {
    session_id: string;
    title?: string;
    created_at: string;
    updated_at?: string;
}

export interface RemixWorkflowState {
    step?: number;
    done_steps?: number[];
    analysis_text?: string;
    script_text?: string;
    edited_script?: string;
    remix_text?: string;
    script_task_id?: number;
    /** 步骤 7 成片已生成，刷新后可恢复预览/下载 */
    video_ready?: boolean;
    video_duration_seconds?: number;
    video_beats?: number;
    url?: string;
    hotspot?: Record<string, unknown>;
}

export interface RemixSessionMeta {
    session_id: string;
    cover_url?: string;
    title?: string;
    content_url?: string;
    platform?: string;
    author_name?: string;
    remix_summary?: string;
    workflow_state?: RemixWorkflowState;
    created_at?: string;
    updated_at?: string;
}

export interface RemixMessage {
    role: "user" | "assistant";
    content: string;
    created_at: string;
}

/** 检查 ContentRemixAgent 服务可用性 */
export const fetchRemixStatus = () =>
    api.get<{ available: boolean; base: string }>('/growhub/remix/status').then(r => r.data);

/** 获取支持的二创模式 */
export const fetchRemixModes = () =>
    api.get<{ modes: RemixMode[] } | RemixMode[]>('/growhub/remix/modes')
        .then(r => Array.isArray(r.data) ? r.data : (r.data as { modes: RemixMode[] }).modes ?? []);

/** 历史会话列表 */
export const fetchRemixSessions = (page = 1, pageSize = 20) =>
    api.get<{ sessions?: RemixSession[]; items?: RemixSession[]; total: number }>('/growhub/remix/sessions', {
        params: { page, page_size: pageSize }
    }).then(r => ({
        items: r.data.sessions ?? r.data.items ?? [],
        total: r.data.total ?? 0,
    }));

/** 删除会话 */
export const deleteRemixSession = (sessionId: string) =>
    api.delete(`/growhub/remix/session/${sessionId}`).then(r => r.data);

/** 获取会话消息 */
export const fetchRemixSessionMessages = (sessionId: string) =>
    api.get<RemixMessage[]>(`/growhub/remix/session/${sessionId}/messages`).then(r => r.data);

/** 写入/更新会话富元数据（封面、标题、二创摘要等） */
export const upsertRemixSessionMeta = (data: Partial<RemixSessionMeta> & { session_id: string }) =>
    api.post<RemixSessionMeta>('/growhub/remix/session-meta', data).then(r => r.data);

/** 批量查询会话富元数据 */
export const fetchRemixSessionMetas = (sessionIds?: string[]) =>
    api.get<{ items: RemixSessionMeta[] }>('/growhub/remix/session-metas', {
        params: sessionIds?.length ? { session_ids: sessionIds.join(',') } : {},
    }).then(r => r.data.items);

/** 单条会话富元数据（含工作流快照） */
export const fetchRemixSessionMeta = (sessionId: string) =>
    api.get<RemixSessionMeta>(`/growhub/remix/session-meta/${sessionId}`).then(r => r.data);

/** 批量删除仅有链接、无封面/标题/二创内容的空记录 */
export const cleanupEmptyRemixSessions = () =>
    api.post<{ success: boolean; deleted_count: number; deleted_ids: string[] }>(
        '/growhub/remix/sessions/cleanup-empty',
    ).then(r => r.data);

export default api;


export interface MonitoredItemHistory {
  record_date: string;
  fans_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
}

export interface CreatorWork {
  id: number;
  title: string;
  cover_url?: string;
  content_url?: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  view_count: number;
  publish_time?: string;
}

export interface MonitoredItem {
  id: number;
  name: string;
  avatar_or_cover: string;
  platform: string;
  url: string;
  latest_fans: number;
  latest_likes: number;
  latest_views: number;
  latest_comments: number;
  latest_shares: number;
  latest_collects: number;
  publish_time?: string;
  author_name?: string;
  history: MonitoredItemHistory[];
  // Creator-specific
  author_id?: string;
  total_works?: number;
  total_likes?: number;
  total_collects?: number;
  signature?: string;
  works?: CreatorWork[];
}

export const fetchDataMonitorList = (params: any) =>
  api.get<{ items: MonitoredItem[]; total: number; available_authors: string[] }>('/growhub/data-monitor/list', {
    params: cleanParams(params)
  }).then(res => res.data);

export const exportMonitorData = (params: any) =>
  api.get('/growhub/data-monitor/export', {
    params: cleanParams(params),
    responseType: 'blob'
  });

export const fetchCreatorWorks = (creatorId: number, params?: { page?: number; page_size?: number; sort_by?: string }) =>
  api.get<{ total: number; works: CreatorWork[]; creator_name: string }>(`/growhub/data-monitor/creator/${creatorId}/works`, {
    params: cleanParams(params || {})
  }).then(res => res.data);

export interface AudioExtractionStatus {
  id: number;
  status: 'pending' | 'downloading' | 'extracting' | 'separating' | 'transcribing' | 'success' | 'failed';
  transcript_text?: string;
  vocals_url?: string;
  bgm_url?: string;
  original_audio_url?: string;
  error_msg?: string;
}

export const extractAudio = (
  itemType: 'hotspot' | 'content',
  itemId: number,
  opts?: { bgm_only?: boolean }
) =>
  api
    .post<{ extraction_id: number; status: string; bgm_url?: string }>(
      '/growhub/audio/extract',
      {
        item_type: itemType,
        item_id: itemId,
        bgm_only: opts?.bgm_only ?? false,
      }
    )
    .then((res) => res.data);

export const getAudioExtractionStatus = (extractionId: number) =>
  api.get<AudioExtractionStatus>(`/growhub/audio/status/${extractionId}`).then(res => res.data);

// ============ 图文生成 API ============
export interface ImageGenTemplate {
  id: string;
  name: string;
  category: string;
  prompt: string;
  negative_prompt?: string;
  cover_url?: string;
}

export interface ImageGenTemplatesResponse {
  success: boolean;
  data: {
    items: ImageGenTemplate[];
    total: number;
    page: number;
    page_size: number;
  };
}

export interface ImageGenTaskStatus {
  task_id: string;
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'pending';
  progress: number; // 0-100
  current_round: number;
  total_rounds: number;
  error_message?: string;
  error?: string;
  message?: string;
  results?: Array<{
    image_url: string;
    score?: {
      aesthetic?: number;
      creativity?: number;
      relevance?: number;
      composition?: number;
      color?: number;
      overall?: number;
    };
  }>;
}

export interface PostCopyResponse {
  title: string;
  body: string;
  hashtags: string[];
  on_image_headline?: string;
  on_image_text?: string;
  on_image_lines?: string[];
  highlight_words?: string[];
  image_prompt_suggestion: string;
  image_prompt_zh: string;
  writing_notes: string;
  platform: string;
  style: string;
}

export const fetchImageGenHealth = () =>
  api.get<{
    pictactic_online: boolean;
    pictactic_url: string;
    message: string;
    replicate_ready?: boolean;
    replicate_provider?: string;
  }>('/growhub_imagegen/health').then(res => res.data);

export const fetchImageGenTemplates = (page = 1, pageSize = 20, category?: string) =>
  api.get<ImageGenTemplatesResponse>('/growhub_imagegen/templates', {
    params: cleanParams({ page, page_size: pageSize, category })
  }).then(res => res.data);

export const createImageGenTask = (data: {
  prompt?: string;
  on_image_text?: string;
  on_image_highlights?: string[];
  max_rounds?: number;
  images_per_round?: number;
  aspect_ratio?: string;
  size?: string;
  enhance_prompt?: boolean;
  template_images?: string[];
  replicate_mode?: boolean;
  provider?: string;
  poster_hide_chrome?: boolean;
  poster_nickname?: string;
  poster_top_date?: string;
  poster_bottom_time?: string;
  poster_bottom_day?: string;
  poster_account_id?: string;
  on_image_accent_color?: string;
}) =>
  api.post<{ success: boolean; data: { task_id: string } }>('/growhub_imagegen/generate', data).then(res => res.data);

export const fetchImageGenTaskStatus = (taskId: string) =>
  api.get<{ success: boolean; data: ImageGenTaskStatus }>(`/growhub_imagegen/generate/${taskId}`).then(res => res.data);

export const fetchImageGenTaskResult = (taskId: string) =>
  api.get<{ success: boolean; data: any }>(`/growhub_imagegen/generate/${taskId}/result`).then(res => res.data);

export const cancelImageGenTask = (taskId: string) =>
  api.post<{ success: boolean; data: any }>(`/growhub_imagegen/generate/${taskId}/cancel`).then(res => res.data);

export const generatePostCopy = (data: {
  topic: string;
  platform?: string;
  style?: string;
  hotspot_title?: string;
  hotspot_content?: string;
  brand_keywords?: string[];
  extra_instructions?: string;
}) =>
  api.post<{ success: boolean; data: PostCopyResponse }>('/growhub_imagegen/copy/generate', data).then(res => res.data);

export interface ParaphraseCopyResponse {
  title: string;
  body: string;
  hashtags: string[];
  on_image_headline?: string;
  on_image_text?: string;
  on_image_lines?: string[];
  highlight_words?: string[];
  paraphrase_notes?: string;
}

export const paraphrasePostCopy = (data: {
  source_title?: string;
  source_body?: string;
  source_hashtags?: string[];
  platform?: string;
  brand_keywords?: string[];
  reference_cover_url?: string;
  preserve_original_on_image?: boolean;
}) =>
  api
    .post<{ success: boolean; data: ParaphraseCopyResponse }>(
      '/growhub_imagegen/copy/paraphrase',
      data
    )
    .then((res) => res.data);

export const extractPosterFromCover = (coverUrl: string) =>
  api
    .get<{ success: boolean; data: ParaphraseCopyResponse & { source?: string } }>(
      '/growhub_imagegen/copy/extract_from_cover',
      { params: { cover_url: coverUrl } }
    )
    .then((res) => res.data);

export const pushToPublishQueue = (data: {
  task_title: string;
  copy_title: string;
  copy_body: string;
  copy_hashtags?: string[];
  image_urls: string[];
  account_id?: string;
  platform?: string;
  publish_time?: string;
  video_url?: string;
}) =>
  api.post<{ success: boolean; message: string }>('/growhub_imagegen/to_publish', data).then(res => res.data);


// ============ 已发布帖子模板库 API ============
export interface PublishedPost {
  id: number;
  title: string;
  description: string;
  cover_url: string;
  /** 原帖视频地址，用于提取 BGM */
  video_url?: string;
  audio_extraction_id?: number | null;
  audio_status?: string | null;
  /** 已提取的伴奏路径 */
  bgm_url?: string | null;
  /** 按第1句/第2句/# 解析后的发布字段 */
  publish_title?: string;
  publish_body?: string;
  hashtags?: string[];
}

export interface PublishedPostsResponse {
  success: boolean;
  data: {
    items: PublishedPost[];
    total: number;
    page: number;
    page_size: number;
  };
}

export const fetchPublishedPosts = (page = 1, pageSize = 20, search?: string) =>
  api.get<PublishedPostsResponse>('/growhub_imagegen/published_posts', {
    params: cleanParams({ page, page_size: pageSize, search })
  }).then(res => res.data);

// ============ 矩阵分发 API ============
export interface PublishTask {
  id: number;
  task_title: string;
  account_id: string | null;
  content_body: string | null;
  assets_dir: string | null;
  status: string;
  post_url: string | null;
  publish_time: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PublishTasksResponse {
  success: boolean;
  data: {
    items: PublishTask[];
    total: number;
    page: number;
    page_size: number;
  };
}

export const fetchPublishTasks = (page = 1, pageSize = 10, status = 'all') =>
  api.get<PublishTasksResponse>('/growhub_publish/tasks', {
    params: cleanParams({ page, page_size: pageSize, status: status === 'all' ? undefined : status }),
  }).then(res => res.data);

export const createPublishTask = (data: {
  task_title: string;
  account_id?: string;
  content_body?: string;
  assets_dir?: string;
  publish_time?: string;
}) =>
  api.post<{ success: boolean; message: string }>('/growhub_publish/tasks', data).then(res => res.data);

export const triggerPublishTask = (taskId: number) =>
  api.post<{ success: boolean; message: string }>(`/growhub_publish/trigger/${taskId}`).then(res => res.data);

export const deletePublishTask = (taskId: number) =>
  api.delete<{ success: boolean; message: string }>(`/growhub_publish/tasks/${taskId}`).then(res => res.data);

export interface BgmItem {
  name: string;
  url: string;
}

export const fetchAvailableBgms = () =>
  api.get<{ success: boolean; data: BgmItem[] }>('/growhub_publish/bgms').then(res => res.data);

export const composeVideo = (data: { image_urls: string[]; bgm_url: string }) =>
  api.post<{ success: boolean; message: string; video_url: string }>('/growhub_publish/compose_video', data).then(res => res.data);


export interface ImageGenPublishHistoryItem {
  id: number;
  task_title: string;
  account_id: string;
  account_name: string;
  content_body: string;
  copy_title?: string;
  copy_body?: string;
  copy_hashtags?: string[];
  status: string;
  post_url: string;
  image_urls: string[];
  platform: string;
  created_at: string;
  updated_at: string;
}

export interface ImageGenPublishHistoryResponse {
  success: boolean;
  data: {
    items: ImageGenPublishHistoryItem[];
    total: number;
    page: number;
    page_size: number;
  };
}

export const fetchImageGenPublishHistory = (page = 1, pageSize = 20) =>
  api.get<ImageGenPublishHistoryResponse>('/growhub_imagegen/publish_history', {
    params: cleanParams({ page, page_size: pageSize })
  }).then(res => res.data);

export const fetchImageGenPublishHistoryDetail = (taskId: number) =>
  api.get<{ success: boolean; data: ImageGenPublishHistoryItem }>(`/growhub_imagegen/publish_history/${taskId}`).then(res => res.data);



