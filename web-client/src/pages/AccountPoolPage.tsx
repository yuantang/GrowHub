import React, { useState, useEffect } from 'react';
import {
    Users, Plus, RefreshCw, Shield, AlertTriangle, CheckCircle,
    XCircle, Trash2, Eye, EyeOff, Search, Activity
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = 'http://localhost:8080/api';

interface Account {
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
}

interface Statistics {
    total: number;
    by_status: Record<string, number>;
    by_platform: Record<string, number>;
    avg_health: number;
    total_uses: number;
    success_rate: number;
}

const PLATFORM_LABELS: Record<string, string> = {
    xhs: '小红书',
    douyin: '抖音',
    bilibili: 'B站',
    weibo: '微博',
    zhihu: '知乎',
    kuaishou: '快手',
    tieba: '贴吧'
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    active: { label: '正常', color: 'text-green-500', icon: CheckCircle },
    cooldown: { label: '冷却中', color: 'text-yellow-500', icon: Activity },
    expired: { label: '已过期', color: 'text-red-500', icon: XCircle },
    banned: { label: '已封禁', color: 'text-red-600', icon: AlertTriangle },
    unknown: { label: '未检测', color: 'text-gray-500', icon: Shield }
};

const AccountPoolPage: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCookies, setShowCookies] = useState<Record<string, boolean>>({});
    const [filterPlatform, setFilterPlatform] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    // Add form
    const [newAccount, setNewAccount] = useState({
        platform: 'xhs',
        account_name: '',
        cookies: '',
        group: 'default',
        notes: ''
    });

    useEffect(() => {
        fetchAccounts();
        fetchStatistics();
    }, [filterPlatform, filterStatus]);

    const fetchAccounts = async () => {
        try {
            let url = `${API_BASE}/growhub/accounts/`;
            const params = new URLSearchParams();
            if (filterPlatform) params.append('platform', filterPlatform);
            if (filterStatus) params.append('status', filterStatus);
            if (params.toString()) url += `?${params.toString()}`;

            const response = await fetch(url);
            const data = await response.json();
            setAccounts(data.items || []);
        } catch (error) {
            console.error('Failed to fetch accounts:', error);
        }
    };

    const fetchStatistics = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/accounts/statistics`);
            const data = await response.json();
            setStatistics(data);
        } catch (error) {
            console.error('Failed to fetch statistics:', error);
        }
    };

    const addAccount = async () => {
        if (!newAccount.account_name || !newAccount.cookies) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/growhub/accounts/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAccount)
            });

            if (response.ok) {
                setShowAddModal(false);
                setNewAccount({
                    platform: 'xhs',
                    account_name: '',
                    cookies: '',
                    group: 'default',
                    notes: ''
                });
                fetchAccounts();
                fetchStatistics();
            }
        } catch (error) {
            console.error('Failed to add account:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkAccountHealth = async (accountId: string) => {
        try {
            await fetch(`${API_BASE}/growhub/accounts/${accountId}/check`, {
                method: 'POST'
            });
            fetchAccounts();
            fetchStatistics();
        } catch (error) {
            console.error('Failed to check account:', error);
        }
    };

    const checkAllAccounts = async () => {
        setLoading(true);
        try {
            await fetch(`${API_BASE}/growhub/accounts/check-all`, {
                method: 'POST'
            });
            fetchAccounts();
            fetchStatistics();
        } catch (error) {
            console.error('Failed to check all accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    const deleteAccount = async (accountId: string) => {
        if (!confirm('确定要删除这个账号吗？')) return;

        try {
            await fetch(`${API_BASE}/growhub/accounts/${accountId}`, {
                method: 'DELETE'
            });
            fetchAccounts();
            fetchStatistics();
        } catch (error) {
            console.error('Failed to delete account:', error);
        }
    };

    const toggleShowCookies = (accountId: string) => {
        setShowCookies(prev => ({
            ...prev,
            [accountId]: !prev[accountId]
        }));
    };

    const getHealthColor = (score: number) => {
        if (score >= 80) return 'bg-green-500';
        if (score >= 50) return 'bg-yellow-500';
        if (score >= 30) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const filteredAccounts = accounts.filter(acc =>
        acc.account_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Users className="w-7 h-7 text-indigo-500" />
                        账号资产管理
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        管理多平台账号池，实现智能轮询与健康监控
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={checkAllAccounts} disabled={loading}>
                        <Shield className="w-4 h-4 mr-2" />
                        批量检测
                    </Button>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        添加账号
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            {statistics && (
                <div className="grid grid-cols-5 gap-4">
                    <Card className="bg-card/50">
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{statistics.total}</div>
                            <div className="text-sm text-muted-foreground">总账号数</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-green-500">
                                {statistics.by_status.active || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">正常可用</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-red-500">
                                {(statistics.by_status.expired || 0) + (statistics.by_status.banned || 0)}
                            </div>
                            <div className="text-sm text-muted-foreground">异常账号</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{statistics.avg_health}%</div>
                            <div className="text-sm text-muted-foreground">平均健康度</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="pt-6">
                            <div className="text-2xl font-bold">{statistics.success_rate}%</div>
                            <div className="text-sm text-muted-foreground">成功率</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="搜索账号名称..."
                        className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg"
                    />
                </div>
                <select
                    value={filterPlatform}
                    onChange={(e) => setFilterPlatform(e.target.value)}
                    className="px-3 py-2 bg-background border border-border rounded-lg"
                >
                    <option value="">全部平台</option>
                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 bg-background border border-border rounded-lg"
                >
                    <option value="">全部状态</option>
                    {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                        <option key={value} value={value}>{config.label}</option>
                    ))}
                </select>
                <Button variant="ghost" onClick={() => { setFilterPlatform(''); setFilterStatus(''); setSearchTerm(''); }}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    重置
                </Button>
            </div>

            {/* Accounts Table */}
            <Card className="bg-card/50">
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="border-b border-border">
                            <tr className="text-left text-sm text-muted-foreground">
                                <th className="p-4">账号</th>
                                <th className="p-4">平台</th>
                                <th className="p-4">状态</th>
                                <th className="p-4">健康度</th>
                                <th className="p-4">使用统计</th>
                                <th className="p-4">Cookie</th>
                                <th className="p-4">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAccounts.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p>暂无账号</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredAccounts.map(acc => {
                                    const statusConfig = STATUS_CONFIG[acc.status] || STATUS_CONFIG.unknown;
                                    const StatusIcon = statusConfig.icon;

                                    return (
                                        <tr key={acc.id} className="border-b border-border/50 hover:bg-muted/30">
                                            <td className="p-4">
                                                <div className="font-medium">{acc.account_name}</div>
                                                <div className="text-xs text-muted-foreground">ID: {acc.id}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 bg-primary/10 text-primary rounded text-sm">
                                                    {PLATFORM_LABELS[acc.platform] || acc.platform}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className={`flex items-center gap-1 ${statusConfig.color}`}>
                                                    <StatusIcon className="w-4 h-4" />
                                                    {statusConfig.label}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${getHealthColor(acc.health_score)}`}
                                                            style={{ width: `${acc.health_score}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm">{acc.health_score}%</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                <div>使用: {acc.use_count} 次</div>
                                                <div className="text-muted-foreground">
                                                    成功: {acc.success_count} / 失败: {acc.fail_count}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs bg-muted px-2 py-1 rounded max-w-[150px] truncate">
                                                        {showCookies[acc.id] ? acc.cookies : '••••••••'}
                                                    </code>
                                                    <button
                                                        onClick={() => toggleShowCookies(acc.id)}
                                                        className="text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showCookies[acc.id] ? (
                                                            <EyeOff className="w-4 h-4" />
                                                        ) : (
                                                            <Eye className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => checkAccountHealth(acc.id)}
                                                        title="检测健康"
                                                    >
                                                        <Shield className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => deleteAccount(acc.id)}
                                                        className="text-red-500"
                                                        title="删除"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Add Account Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-lg">
                        <h2 className="text-xl font-bold mb-4">添加账号</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">平台 *</label>
                                <select
                                    value={newAccount.platform}
                                    onChange={(e) => setNewAccount({ ...newAccount, platform: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                >
                                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">账号名称 *</label>
                                <input
                                    type="text"
                                    value={newAccount.account_name}
                                    onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
                                    placeholder="给账号起个名字..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">Cookie *</label>
                                <textarea
                                    value={newAccount.cookies}
                                    onChange={(e) => setNewAccount({ ...newAccount, cookies: e.target.value })}
                                    placeholder="粘贴 Cookie 字符串..."
                                    rows={4}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    可从浏览器开发者工具复制
                                </p>
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">分组</label>
                                <input
                                    type="text"
                                    value={newAccount.group}
                                    onChange={(e) => setNewAccount({ ...newAccount, group: e.target.value })}
                                    placeholder="default"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">备注</label>
                                <input
                                    type="text"
                                    value={newAccount.notes}
                                    onChange={(e) => setNewAccount({ ...newAccount, notes: e.target.value })}
                                    placeholder="可选..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="outline" onClick={() => setShowAddModal(false)}>
                                取消
                            </Button>
                            <Button
                                onClick={addAccount}
                                disabled={loading || !newAccount.account_name || !newAccount.cookies}
                            >
                                添加账号
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountPoolPage;
