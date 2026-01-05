import React, { useState, useEffect } from 'react';
import {
    Bell, Plus, Trash2, RefreshCw, X, Edit2,
    MessageSquare, Webhook, Users, Settings,
    TestTube, Send
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = 'http://localhost:8080/api';

interface NotificationChannel {
    id: number;
    name: string;
    channel_type: string;
    config: Record<string, any>;
    is_active: boolean;
    created_at: string;
}

interface NotificationGroup {
    id: number;
    name: string;
    description: string | null;
    channel_ids: number[];
    is_active: boolean;
    created_at: string;
}

interface NotificationStats {
    total_sent: number;
    by_channel: Record<string, number>;
    by_status: Record<string, number>;
    recent_24h: number;
}

const CHANNEL_TYPES = [
    { value: 'wechat_work', label: '企业微信', icon: MessageSquare, color: 'text-green-400' },
    { value: 'webhook', label: 'Webhook', icon: Webhook, color: 'text-purple-400' },
];

const NotificationPage: React.FC = () => {
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [groups, setGroups] = useState<NotificationGroup[]>([]);
    const [stats, setStats] = useState<NotificationStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'channels' | 'groups'>('channels');

    // Modal state
    const [showChannelModal, setShowChannelModal] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
    const [editingGroup, setEditingGroup] = useState<NotificationGroup | null>(null);

    // Form state
    const [channelForm, setChannelForm] = useState({
        name: '',
        channel_type: 'wechat_work',
        webhook_url: '',
    });

    const [groupForm, setGroupForm] = useState({
        name: '',
        description: '',
        channel_ids: [] as number[],
    });

    const [testingChannel, setTestingChannel] = useState<number | null>(null);

    const fetchChannels = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/notifications/channels`);
            const data = await response.json();
            setChannels(data.items || []);
        } catch (error) {
            console.error('Failed to fetch channels:', error);
        }
    };

    const fetchGroups = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/notifications/groups`);
            const data = await response.json();
            setGroups(data.items || []);
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/notifications/stats`);
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchChannels(), fetchGroups(), fetchStats()])
            .finally(() => setLoading(false));
    }, []);

    const handleCreateChannel = async () => {
        const config: Record<string, any> = {
            webhook_url: channelForm.webhook_url
        };

        try {
            const url = editingChannel
                ? `${API_BASE}/growhub/notifications/channels/${editingChannel.id}`
                : `${API_BASE}/growhub/notifications/channels`;

            const response = await fetch(url, {
                method: editingChannel ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: channelForm.name,
                    channel_type: channelForm.channel_type,
                    config,
                }),
            });

            if (response.ok) {
                setShowChannelModal(false);
                setEditingChannel(null);
                resetChannelForm();
                fetchChannels();
            } else {
                const error = await response.json();
                alert(error.detail || '操作失败');
            }
        } catch (error) {
            console.error('Failed to save channel:', error);
        }
    };

    const handleCreateGroup = async () => {
        try {
            const url = editingGroup
                ? `${API_BASE}/growhub/notifications/groups/${editingGroup.id}`
                : `${API_BASE}/growhub/notifications/groups`;

            const response = await fetch(url, {
                method: editingGroup ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(groupForm),
            });

            if (response.ok) {
                setShowGroupModal(false);
                setEditingGroup(null);
                resetGroupForm();
                fetchGroups();
            } else {
                const error = await response.json();
                alert(error.detail || '操作失败');
            }
        } catch (error) {
            console.error('Failed to save group:', error);
        }
    };

    const handleDeleteChannel = async (id: number) => {
        if (!confirm('确定删除此通知渠道？')) return;

        try {
            await fetch(`${API_BASE}/growhub/notifications/channels/${id}`, { method: 'DELETE' });
            fetchChannels();
        } catch (error) {
            console.error('Failed to delete channel:', error);
        }
    };

    const handleDeleteGroup = async (id: number) => {
        if (!confirm('确定删除此通知组？')) return;

        try {
            await fetch(`${API_BASE}/growhub/notifications/groups/${id}`, { method: 'DELETE' });
            fetchGroups();
        } catch (error) {
            console.error('Failed to delete group:', error);
        }
    };

    const handleTestChannel = async (channelId: number) => {
        setTestingChannel(channelId);
        try {
            const response = await fetch(`${API_BASE}/growhub/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_id: channelId,
                    title: '🔔 GrowHub 测试通知',
                    content: '这是一条测试消息，如果您收到此消息，说明通知渠道配置成功！',
                }),
            });

            if (response.ok) {
                alert('测试消息已发送！');
            } else {
                const error = await response.json();
                alert(`发送失败: ${error.detail || '未知错误'}`);
            }
        } catch (error) {
            console.error('Failed to test channel:', error);
            alert('发送失败');
        } finally {
            setTestingChannel(null);
        }
    };

    const resetChannelForm = () => {
        setChannelForm({
            name: '',
            channel_type: 'wechat_work',
            webhook_url: '',
        });
    };

    const resetGroupForm = () => {
        setGroupForm({
            name: '',
            description: '',
            channel_ids: [],
        });
    };

    const openEditChannel = (channel: NotificationChannel) => {
        setEditingChannel(channel);
        setChannelForm({
            name: channel.name,
            channel_type: channel.channel_type,
            webhook_url: channel.config.webhook_url || '',
        });
        setShowChannelModal(true);
    };

    const openEditGroup = (group: NotificationGroup) => {
        setEditingGroup(group);
        setGroupForm({
            name: group.name,
            description: group.description || '',
            channel_ids: group.channel_ids,
        });
        setShowGroupModal(true);
    };

    const getChannelTypeConfig = (type: string) => {
        return CHANNEL_TYPES.find(t => t.value === type) || CHANNEL_TYPES[0];
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">通知配置</h1>
                    <p className="text-muted-foreground mt-1">管理通知渠道和通知组，配置预警推送</p>
                </div>
                <Button onClick={() => fetchChannels()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-4 gap-4">
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">总发送量</p>
                                    <p className="text-2xl font-bold">{stats.total_sent}</p>
                                </div>
                                <Send className="w-8 h-8 text-primary/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">24小时内</p>
                                    <p className="text-2xl font-bold text-green-400">{stats.recent_24h}</p>
                                </div>
                                <Bell className="w-8 h-8 text-green-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">渠道数</p>
                                    <p className="text-2xl font-bold">{channels.length}</p>
                                </div>
                                <Settings className="w-8 h-8 text-blue-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">通知组</p>
                                    <p className="text-2xl font-bold">{groups.length}</p>
                                </div>
                                <Users className="w-8 h-8 text-purple-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tabs */}
            <Card className="bg-card/50">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex bg-muted/30 rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('channels')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'channels' ? 'bg-background text-foreground' : 'text-muted-foreground'
                                    }`}
                            >
                                通知渠道
                            </button>
                            <button
                                onClick={() => setActiveTab('groups')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'groups' ? 'bg-background text-foreground' : 'text-muted-foreground'
                                    }`}
                            >
                                通知组
                            </button>
                        </div>

                        <Button onClick={() => activeTab === 'channels' ? setShowChannelModal(true) : setShowGroupModal(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {activeTab === 'channels' ? '添加渠道' : '添加通知组'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Channels Tab */}
            {activeTab === 'channels' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loading ? (
                        <Card className="bg-card/50 col-span-full">
                            <CardContent className="p-8 text-center text-muted-foreground">
                                加载中...
                            </CardContent>
                        </Card>
                    ) : channels.length === 0 ? (
                        <Card className="bg-card/50 col-span-full">
                            <CardContent className="p-8 text-center text-muted-foreground">
                                暂无通知渠道，点击"添加渠道"创建
                            </CardContent>
                        </Card>
                    ) : (
                        channels.map((channel) => {
                            const typeConfig = getChannelTypeConfig(channel.channel_type);
                            const TypeIcon = typeConfig.icon;

                            return (
                                <Card key={channel.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg bg-muted/50 ${typeConfig.color}`}>
                                                    <TypeIcon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-medium">{channel.name}</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        {typeConfig.label}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-1 text-xs rounded ${channel.is_active
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'bg-gray-500/20 text-gray-400'
                                                }`}>
                                                {channel.is_active ? '启用' : '禁用'}
                                            </span>
                                        </div>

                                        <div className="mt-4 flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleTestChannel(channel.id)}
                                                disabled={testingChannel === channel.id}
                                            >
                                                {testingChannel === channel.id ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <TestTube className="w-4 h-4" />
                                                )}
                                                <span className="ml-1">测试</span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEditChannel(channel)}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-400"
                                                onClick={() => handleDeleteChannel(channel.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>
            )}

            {/* Groups Tab */}
            {activeTab === 'groups' && (
                <div className="space-y-3">
                    {loading ? (
                        <Card className="bg-card/50">
                            <CardContent className="p-8 text-center text-muted-foreground">
                                加载中...
                            </CardContent>
                        </Card>
                    ) : groups.length === 0 ? (
                        <Card className="bg-card/50">
                            <CardContent className="p-8 text-center text-muted-foreground">
                                暂无通知组，点击"添加通知组"创建
                            </CardContent>
                        </Card>
                    ) : (
                        groups.map((group) => (
                            <Card key={group.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-purple-500/20">
                                                <Users className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium">{group.name}</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    {group.description || '暂无描述'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-sm text-muted-foreground">
                                                {group.channel_ids.length} 个渠道
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEditGroup(group)}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400"
                                                    onClick={() => handleDeleteGroup(group.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            )}

            {/* Channel Modal */}
            {showChannelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                {editingChannel ? '编辑渠道' : '添加通知渠道'}
                                <Button variant="ghost" size="sm" onClick={() => { setShowChannelModal(false); setEditingChannel(null); resetChannelForm(); }}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">渠道名称</label>
                                <input
                                    type="text"
                                    value={channelForm.name}
                                    onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    placeholder="例如：舆情预警群"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">渠道类型</label>
                                <select
                                    value={channelForm.channel_type}
                                    onChange={(e) => setChannelForm({ ...channelForm, channel_type: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    disabled={!!editingChannel}
                                >
                                    {CHANNEL_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            {(channelForm.channel_type === 'wechat_work' || channelForm.channel_type === 'webhook') && (
                                <div>
                                    <label className="text-sm font-medium">Webhook URL</label>
                                    <input
                                        type="text"
                                        value={channelForm.webhook_url}
                                        onChange={(e) => setChannelForm({ ...channelForm, webhook_url: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {channelForm.channel_type === 'wechat_work'
                                            ? '请在企业微信群中添加机器人，获取 Webhook 地址'
                                            : '自定义 Webhook 地址，将接收 JSON 格式的通知数据'}
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => { setShowChannelModal(false); setEditingChannel(null); resetChannelForm(); }}>
                                    取消
                                </Button>
                                <Button onClick={handleCreateChannel}>
                                    {editingChannel ? '保存' : '创建'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Group Modal */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                {editingGroup ? '编辑通知组' : '添加通知组'}
                                <Button variant="ghost" size="sm" onClick={() => { setShowGroupModal(false); setEditingGroup(null); resetGroupForm(); }}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">组名称</label>
                                <input
                                    type="text"
                                    value={groupForm.name}
                                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    placeholder="例如：舆情预警组"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">描述</label>
                                <textarea
                                    value={groupForm.description}
                                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg h-20 resize-none"
                                    placeholder="可选描述..."
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">选择渠道</label>
                                <div className="mt-2 space-y-2">
                                    {channels.map(channel => (
                                        <label key={channel.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50">
                                            <input
                                                type="checkbox"
                                                checked={groupForm.channel_ids.includes(channel.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setGroupForm({ ...groupForm, channel_ids: [...groupForm.channel_ids, channel.id] });
                                                    } else {
                                                        setGroupForm({ ...groupForm, channel_ids: groupForm.channel_ids.filter(id => id !== channel.id) });
                                                    }
                                                }}
                                                className="rounded"
                                            />
                                            <span>{channel.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({getChannelTypeConfig(channel.channel_type).label})
                                            </span>
                                        </label>
                                    ))}
                                    {channels.length === 0 && (
                                        <p className="text-sm text-muted-foreground py-2">
                                            暂无可用渠道，请先创建通知渠道
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => { setShowGroupModal(false); setEditingGroup(null); resetGroupForm(); }}>
                                    取消
                                </Button>
                                <Button onClick={handleCreateGroup}>
                                    {editingGroup ? '保存' : '创建'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default NotificationPage;
