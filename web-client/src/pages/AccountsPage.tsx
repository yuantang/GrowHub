import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
    Loader2,
    Plus,
    Trash2,
    Check,
    X,
    RefreshCw,
    Ban,
    PlayCircle,
    User,
    Clock,
    Activity,
    QrCode,
    Keyboard
} from 'lucide-react';
import type { Account, AccountsResponse } from '@/api';
import {
    fetchAllAccounts,
    addAccount,
    deleteAccount,
    activateAccount,
    disableAccount,
    startCrawler
} from '@/api';

const PLATFORMS = [
    { value: 'xhs', label: '小红书' },
    { value: 'dy', label: '抖音' },
    { value: 'bili', label: 'B站' },
    { value: 'wb', label: '微博' },
    { value: 'ks', label: '快手' },
    { value: 'tieba', label: '百度贴吧' },
    { value: 'zhihu', label: '知乎' },
];

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    disabled: 'bg-gray-100 text-gray-600 border-gray-200',
    banned: 'bg-red-100 text-red-700 border-red-200',
    cooling: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    expired: 'bg-orange-100 text-orange-700 border-orange-200',
};

const STATUS_LABELS: Record<string, string> = {
    active: '正常',
    disabled: '已禁用',
    banned: '已封禁',
    cooling: '冷却中',
    expired: '已过期',
};

const AccountsPage: React.FC = () => {
    const [data, setData] = useState<AccountsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
    const [showAddForm, setShowAddForm] = useState(false);

    // Add form state
    const [addMode, setAddMode] = useState<'manual' | 'scan'>('manual');
    const [isScanning, setIsScanning] = useState(false);
    const [newAccount, setNewAccount] = useState({
        platform: 'xhs',
        name: '',
        cookies: '',
        notes: '',
    });

    const loadAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchAllAccounts();
            setData(result);
        } catch (error) {
            console.error('Failed to fetch accounts', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);

    // Get filtered accounts
    const getFilteredAccounts = (): { platform: string; accounts: Account[] }[] => {
        if (!data) return [];

        return Object.entries(data.accounts)
            .filter(([platform]) => selectedPlatform === 'all' || platform === selectedPlatform)
            .map(([platform, accounts]) => ({ platform, accounts }))
            .filter(({ accounts }) => accounts.length > 0);
    };

    // Add account
    const handleAddAccount = async () => {
        if (!newAccount.name || !newAccount.cookies) {
            alert('请填写账号名称和Cookie');
            return;
        }

        try {
            await addAccount(newAccount.platform, {
                name: newAccount.name,
                cookies: newAccount.cookies,
                notes: newAccount.notes,
            });
            setShowAddForm(false);
            setNewAccount({ platform: 'xhs', name: '', cookies: '', notes: '' });
            loadAccounts();
        } catch (error: any) {
            console.error('Failed to add account', error);
            alert(`添加失败: ${error.response?.data?.detail || error.message}`);
        }
    };

    // Handle Scan Login
    const handleScanLogin = async () => {
        setIsScanning(true);
        try {
            await startCrawler({
                platform: newAccount.platform,
                login_type: 'qrcode',
                crawler_type: 'login',
                keywords: '',
                start_page: 1,
                enable_comments: false,
                enable_sub_comments: false,
                save_option: 'json',
                headless: false,
            });
            alert('浏览器已启动！\n1. 请在弹出的浏览器窗口中完成扫码登录。\n2. 登录成功后浏览器会自动关闭。\n3. 账号将自动添加至列表，请稍后刷新页面查看。');
            // Normally we would poll for completion, but for now we just let user refresh
        } catch (error: any) {
            console.error('Failed to start scan login', error);
            alert(`启动失败: ${error.response?.data?.detail || error.message}\n请确保后端服务正在运行。`);
        } finally {
            setIsScanning(false);
        }
    };

    // Delete account
    const handleDeleteAccount = async (platform: string, accountId: string) => {
        if (!confirm('确定要删除这个账号吗？')) return;

        try {
            await deleteAccount(platform, accountId);
            loadAccounts();
        } catch (error: any) {
            console.error('Failed to delete account', error);
            alert(`删除失败: ${error.response?.data?.detail || error.message}`);
        }
    };

    // Toggle account status
    const handleToggleStatus = async (platform: string, accountId: string, currentStatus: string) => {
        try {
            if (currentStatus === 'active') {
                await disableAccount(platform, accountId);
            } else {
                await activateAccount(platform, accountId);
            }
            loadAccounts();
        } catch (error) {
            console.error('Failed to toggle status', error);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex justify-center p-10">
                <Loader2 className="animate-spin w-8 h-8" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">账号管理</h1>
                    <p className="text-muted-foreground">管理各平台的登录账号，支持多账号轮换</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={loadAccounts} disabled={loading}>
                        <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                        刷新
                    </Button>
                    <Button onClick={() => setShowAddForm(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        添加账号
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <User className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">总账号数</p>
                                    <p className="text-2xl font-bold">{data.stats.total_accounts}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 rounded-lg">
                                    <PlayCircle className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">活跃账号</p>
                                    <p className="text-2xl font-bold text-green-600">{data.stats.active_accounts}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Activity className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">总请求数</p>
                                    <p className="text-2xl font-bold">
                                        {Object.values(data.stats.platforms).reduce((sum, p) => sum + p.total_requests, 0)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 rounded-lg">
                                    <Clock className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">支持平台</p>
                                    <p className="text-2xl font-bold">{Object.keys(data.stats.platforms).length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Platform Filter */}
            <div className="flex gap-2 flex-wrap">
                <Button
                    variant={selectedPlatform === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPlatform('all')}
                >
                    全部
                </Button>
                {PLATFORMS.map(p => (
                    <Button
                        key={p.value}
                        variant={selectedPlatform === p.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPlatform(p.value)}
                    >
                        {p.label}
                        {data && data.stats.platforms[p.value] && (
                            <span className="ml-1 text-xs opacity-70">
                                ({data.stats.platforms[p.value].active}/{data.stats.platforms[p.value].total})
                            </span>
                        )}
                    </Button>
                ))}
            </div>

            {/* Add Account Form */}
            {showAddForm && (
                <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>添加新账号</span>
                            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center space-x-4 border-b">
                            <button
                                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", addMode === 'manual' ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
                                onClick={() => setAddMode('manual')}
                            >
                                <Keyboard className="w-4 h-4 inline-block mr-2" />
                                手动录入
                            </button>
                            <button
                                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", addMode === 'scan' ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
                                onClick={() => setAddMode('scan')}
                            >
                                <QrCode className="w-4 h-4 inline-block mr-2" />
                                扫码添加 (推荐)
                            </button>
                        </div>

                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">平台</label>
                                <Select
                                    value={newAccount.platform}
                                    onChange={e => setNewAccount({ ...newAccount, platform: e.target.value })}
                                >
                                    {PLATFORMS.map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                </Select>
                            </div>

                            {addMode === 'manual' ? (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">账号名称</label>
                                        <Input
                                            value={newAccount.name}
                                            onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                                            placeholder="例如: 主账号、备用账号"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium">Cookie</label>
                                            <span className="text-xs text-muted-foreground">请粘贴完整的 Cookie 字符串</span>
                                        </div>
                                        <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground border border-border/50 mb-2">
                                            <p className="font-medium mb-1 text-foreground">如何获取 Cookie?</p>
                                            <ol className="list-decimal pl-4 space-y-1">
                                                <li>在浏览器登录目标网站 (如小红书网页版)</li>
                                                <li>按 <kbd className="px-1 py-0.5 rounded bg-muted border font-mono">F12</kbd> 打开开发者工具，点击 <strong>Network (网络)</strong> 面板</li>
                                                <li>刷新页面，点击第一个请求 (通常是主域名)</li>
                                                <li>在右侧 <strong>Headers</strong> 中找到 <strong>Request Headers</strong> 下的 <strong>Cookie</strong></li>
                                                <li>右键复制 Value (值) 并粘贴到下方</li>
                                            </ol>
                                        </div>
                                        <textarea
                                            className="w-full min-h-[100px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                            value={newAccount.cookies}
                                            onChange={e => setNewAccount({ ...newAccount, cookies: e.target.value })}
                                            placeholder="粘贴完整的Cookie字符串..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">备注 (可选)</label>
                                        <Input
                                            value={newAccount.notes}
                                            onChange={e => setNewAccount({ ...newAccount, notes: e.target.value })}
                                            placeholder="备注信息..."
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" onClick={() => setShowAddForm(false)}>
                                            取消
                                        </Button>
                                        <Button onClick={handleAddAccount}>
                                            <Check className="w-4 h-4 mr-2" />
                                            添加
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6 py-4">
                                    <div className="bg-blue-50 text-blue-900 p-4 rounded-lg flex items-start gap-3">
                                        <div className="p-2 bg-blue-100 rounded-full mt-1">
                                            <QrCode className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold mb-1">扫码自动添加账号</h4>
                                            <p className="text-sm text-blue-800/80 mb-2">
                                                此功能将启动一个浏览器窗口，您可以直接扫码登录。系统会自动捕获 Cookie 并保存。
                                            </p>
                                            <ul className="text-sm list-disc pl-4 space-y-1 text-blue-800/70">
                                                <li>请确保您正在本机运行此服务 (Localhost)</li>
                                                <li>点击下方按钮启动浏览器</li>
                                                <li>在弹出的浏览器中完成扫码</li>
                                                <li>登录成功后，浏览器会自动关闭</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="flex justify-center">
                                        <Button
                                            size="lg"
                                            className="w-full md:w-auto min-w-[200px]"
                                            onClick={handleScanLogin}
                                            disabled={isScanning}
                                        >
                                            {isScanning ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    正在等待登录...
                                                </>
                                            ) : (
                                                <>
                                                    <PlayCircle className="w-5 h-5 mr-2" />
                                                    启动浏览器扫码
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Account List */}
            {getFilteredAccounts().map(({ platform, accounts }) => (
                <Card key={platform}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {PLATFORMS.find(p => p.value === platform)?.label || platform}
                            <span className="text-sm font-normal text-muted-foreground">
                                ({accounts.filter(a => a.status === 'active').length} / {accounts.length} 可用)
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {accounts.map(account => (
                                <div
                                    key={account.id}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-lg border",
                                        account.status === 'active' ? 'bg-card' : 'bg-muted/30'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <User className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{account.name}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs border",
                                                    STATUS_COLORS[account.status] || STATUS_COLORS.disabled
                                                )}>
                                                    {STATUS_LABELS[account.status] || account.status}
                                                </span>
                                                <span>请求: {account.request_count}</span>
                                                <span>成功率: {account.success_rate.toFixed(1)}%</span>
                                                {account.last_used && (
                                                    <span>
                                                        最后使用: {new Date(account.last_used).toLocaleString('zh-CN')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleToggleStatus(platform, account.id, account.status)}
                                        >
                                            {account.status === 'active' ? (
                                                <>
                                                    <Ban className="w-4 h-4 mr-1" />
                                                    禁用
                                                </>
                                            ) : (
                                                <>
                                                    <PlayCircle className="w-4 h-4 mr-1" />
                                                    启用
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteAccount(platform, account.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {accounts.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    暂无账号
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}

            {/* Empty State */}
            {getFilteredAccounts().length === 0 && !showAddForm && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <User className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium mb-2">暂无账号</h3>
                        <p className="text-muted-foreground mb-4">添加账号以开始使用多账号轮换功能</p>
                        <Button onClick={() => setShowAddForm(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            添加第一个账号
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default AccountsPage;
