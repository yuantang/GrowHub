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


