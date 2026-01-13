import React, { useState, useEffect } from 'react';
import {
    Search, Plus, Trash2, RefreshCw, Upload,
    Sparkles, Tag, Check, X,
    Zap, Target, Hash
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// API 基础 URL
const API_BASE = '/api';

interface Keyword {
    id: number;
    keyword: string;
    level: number;
    keyword_type: string | null;
    parent_id: number | null;
    priority: number;
    is_active: boolean;
    is_ai_generated: boolean;
    hit_count: number;
    content_count: number;
    avg_engagement: number;
    created_at: string;
    updated_at: string;
    last_crawl_at: string | null;
}

interface KeywordStats {
    total: number;
    by_level: { level_1: number; level_2: number; level_3: number };
    active: number;
    inactive: number;
    ai_generated: number;
    manual: number;
}

const LEVEL_CONFIG = {
    1: { label: '品牌词', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Target },
    2: { label: '品类词', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Tag },
    3: { label: '情绪词', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Zap },
};

const TYPE_OPTIONS = [
    { value: 'brand', label: '品牌名' },
    { value: 'product', label: '产品名' },
    { value: 'competitor', label: '竞品名' },
    { value: 'category', label: '品类' },
    { value: 'scene', label: '场景' },
    { value: 'emotion', label: '情绪' },
    { value: 'pain_point', label: '痛点' },
];

const KeywordsPage: React.FC = () => {
    const [keywords, setKeywords] = useState<Keyword[]>([]);
    const [stats, setStats] = useState<KeywordStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [levelFilter, setLevelFilter] = useState<number | null>(null);
    const [activeFilter, setActiveFilter] = useState<boolean | null>(null);

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);

    // Form state
    const [newKeyword, setNewKeyword] = useState({ keyword: '', level: 1, keyword_type: '', priority: 50 });
    const [batchKeywords, setBatchKeywords] = useState('');
    const [aiSeedKeywords, setAiSeedKeywords] = useState('');
    const [aiGeneratedKeywords, setAiGeneratedKeywords] = useState<Record<string, string[]> | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    // Fetch keywords
    const fetchKeywords = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (levelFilter) params.append('level', String(levelFilter));
            if (activeFilter !== null) params.append('is_active', String(activeFilter));
            if (searchTerm) params.append('search', searchTerm);
            params.append('page_size', '200');

            const response = await fetch(`${API_BASE}/growhub/keywords?${params}`);
            const data = await response.json();
            setKeywords(data.items || []);
        } catch (error) {
            console.error('Failed to fetch keywords:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch stats
    const fetchStats = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/keywords/stats/summary`);
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    useEffect(() => {
        fetchKeywords();
        fetchStats();
    }, [levelFilter, activeFilter]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchKeywords();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Create single keyword
    const handleCreateKeyword = async () => {
        if (!newKeyword.keyword.trim()) return;

        try {
            const response = await fetch(`${API_BASE}/growhub/keywords`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newKeyword),
            });

            if (response.ok) {
                setShowAddModal(false);
                setNewKeyword({ keyword: '', level: 1, keyword_type: '', priority: 50 });
                fetchKeywords();
                fetchStats();
            } else {
                const error = await response.json();
                alert(error.detail || '创建失败');
            }
        } catch (error) {
            console.error('Failed to create keyword:', error);
        }
    };

    // Batch create
    const handleBatchCreate = async () => {
        const keywordList = batchKeywords.split('\n').map(k => k.trim()).filter(k => k);
        if (keywordList.length === 0) return;

        try {
            const response = await fetch(`${API_BASE}/growhub/keywords/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords: keywordList,
                    level: newKeyword.level,
                    keyword_type: newKeyword.keyword_type || null,
                    priority: newKeyword.priority,
                }),
            });

            if (response.ok) {
                const result = await response.json();
                alert(result.message);
                setShowBatchModal(false);
                setBatchKeywords('');
                fetchKeywords();
                fetchStats();
            }
        } catch (error) {
            console.error('Failed to batch create:', error);
        }
    };

    // AI Generate
    const handleAIGenerate = async () => {
        const seeds = aiSeedKeywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k);
        if (seeds.length === 0) return;

        setAiLoading(true);
        try {
            const response = await fetch(`${API_BASE}/growhub/keywords/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    seed_keywords: seeds,
                    generate_types: ['scene', 'pain_point', 'emotion'],
                    count_per_type: 5,
                }),
            });

            if (response.ok) {
                const result = await response.json();
                setAiGeneratedKeywords(result.generated_keywords);
            } else {
                alert('AI生成失败');
            }
        } catch (error) {
            console.error('Failed to generate:', error);
            alert('AI生成失败');
        } finally {
            setAiLoading(false);
        }
    };

    // Save AI generated
    const handleSaveAIKeywords = async () => {
        if (!aiGeneratedKeywords) return;

        try {
            const response = await fetch(`${API_BASE}/growhub/keywords/save-generated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords: aiGeneratedKeywords }),
            });

            if (response.ok) {
                const result = await response.json();
                alert(result.message);
                setShowAIModal(false);
                setAiSeedKeywords('');
                setAiGeneratedKeywords(null);
                fetchKeywords();
                fetchStats();
            }
        } catch (error) {
            console.error('Failed to save:', error);
        }
    };

    // Delete keyword
    const handleDelete = async (id: number) => {
        if (!confirm('确定删除这个关键词吗？')) return;

        try {
            await fetch(`${API_BASE}/growhub/keywords/${id}`, { method: 'DELETE' });
            fetchKeywords();
            fetchStats();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    // Batch delete
    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`确定删除选中的 ${selectedIds.size} 个关键词吗？`)) return;

        try {
            await fetch(`${API_BASE}/growhub/keywords/batch-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Array.from(selectedIds)),
            });
            setSelectedIds(new Set());
            fetchKeywords();
            fetchStats();
        } catch (error) {
            console.error('Failed to batch delete:', error);
        }
    };

    // Toggle select
    const toggleSelect = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    // Select all
    const toggleSelectAll = () => {
        if (selectedIds.size === keywords.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(keywords.map(k => k.id)));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">关键词管理</h1>
                    <p className="text-muted-foreground mt-1">管理抓取关键词，支持AI智能衍生</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setShowBatchModal(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        批量导入
                    </Button>
                    <Button variant="outline" onClick={() => setShowAIModal(true)}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        AI衍生
                    </Button>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        添加关键词
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-4 gap-4">
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">总关键词</p>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                </div>
                                <Hash className="w-8 h-8 text-primary/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">品牌词</p>
                                    <p className="text-2xl font-bold text-purple-400">{stats.by_level.level_1}</p>
                                </div>
                                <Target className="w-8 h-8 text-purple-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">品类词</p>
                                    <p className="text-2xl font-bold text-blue-400">{stats.by_level.level_2}</p>
                                </div>
                                <Tag className="w-8 h-8 text-blue-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">情绪词</p>
                                    <p className="text-2xl font-bold text-green-400">{stats.by_level.level_3}</p>
                                </div>
                                <Zap className="w-8 h-8 text-green-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Card className="bg-card/50">
                <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="搜索关键词..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <select
                            value={levelFilter || ''}
                            onChange={(e) => setLevelFilter(e.target.value ? Number(e.target.value) : null)}
                            className="px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            <option value="">全部层级</option>
                            <option value="1">品牌词</option>
                            <option value="2">品类词</option>
                            <option value="3">情绪词</option>
                        </select>

                        <select
                            value={activeFilter === null ? '' : String(activeFilter)}
                            onChange={(e) => setActiveFilter(e.target.value === '' ? null : e.target.value === 'true')}
                            className="px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            <option value="">全部状态</option>
                            <option value="true">已启用</option>
                            <option value="false">已禁用</option>
                        </select>

                        <Button variant="outline" size="sm" onClick={fetchKeywords}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>

                        {selectedIds.size > 0 && (
                            <Button variant="outline" size="sm" className="text-red-400" onClick={handleBatchDelete}>
                                <Trash2 className="w-4 h-4 mr-1" />
                                删除 ({selectedIds.size})
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Keywords Table */}
            <Card className="bg-card/50">
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="p-4 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === keywords.length && keywords.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded"
                                    />
                                </th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">关键词</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">层级</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">类型</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">优先级</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">命中数</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">状态</th>
                                <th className="p-4 text-left text-sm font-medium text-muted-foreground">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        加载中...
                                    </td>
                                </tr>
                            ) : keywords.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        暂无关键词，点击"添加关键词"开始
                                    </td>
                                </tr>
                            ) : (
                                keywords.map((kw) => {
                                    const levelConfig = LEVEL_CONFIG[kw.level as keyof typeof LEVEL_CONFIG];
                                    const LevelIcon = levelConfig?.icon || Tag;

                                    return (
                                        <tr key={kw.id} className="border-b border-border/50 hover:bg-muted/20">
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(kw.id)}
                                                    onChange={() => toggleSelect(kw.id)}
                                                    className="rounded"
                                                />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{kw.keyword}</span>
                                                    {kw.is_ai_generated && (
                                                        <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                                                            AI
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${levelConfig?.color}`}>
                                                    <LevelIcon className="w-3 h-3" />
                                                    {levelConfig?.label}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {TYPE_OPTIONS.find(t => t.value === kw.keyword_type)?.label || '-'}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary rounded-full"
                                                            style={{ width: `${kw.priority}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{kw.priority}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                {kw.hit_count > 0 ? (
                                                    <span className="text-green-400">{kw.hit_count}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {kw.is_active ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                                        <span className="w-2 h-2 bg-green-400 rounded-full" />
                                                        启用
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                        <span className="w-2 h-2 bg-muted-foreground rounded-full" />
                                                        禁用
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400 hover:text-red-300"
                                                    onClick={() => handleDelete(kw.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                添加关键词
                                <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">关键词</label>
                                <input
                                    type="text"
                                    value={newKeyword.keyword}
                                    onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    placeholder="输入关键词"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">层级</label>
                                    <select
                                        value={newKeyword.level}
                                        onChange={(e) => setNewKeyword({ ...newKeyword, level: Number(e.target.value) })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value={1}>品牌词</option>
                                        <option value={2}>品类词</option>
                                        <option value={3}>情绪词</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">类型</label>
                                    <select
                                        value={newKeyword.keyword_type}
                                        onChange={(e) => setNewKeyword({ ...newKeyword, keyword_type: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value="">选择类型</option>
                                        {TYPE_OPTIONS.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium">优先级 ({newKeyword.priority})</label>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={newKeyword.priority}
                                    onChange={(e) => setNewKeyword({ ...newKeyword, priority: Number(e.target.value) })}
                                    className="w-full mt-1"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                                <Button onClick={handleCreateKeyword}>创建</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Batch Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                批量导入关键词
                                <Button variant="ghost" size="sm" onClick={() => setShowBatchModal(false)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">关键词（每行一个）</label>
                                <textarea
                                    value={batchKeywords}
                                    onChange={(e) => setBatchKeywords(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg h-40 resize-none"
                                    placeholder="关键词1
关键词2
关键词3"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">层级</label>
                                    <select
                                        value={newKeyword.level}
                                        onChange={(e) => setNewKeyword({ ...newKeyword, level: Number(e.target.value) })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value={1}>品牌词</option>
                                        <option value={2}>品类词</option>
                                        <option value={3}>情绪词</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">类型</label>
                                    <select
                                        value={newKeyword.keyword_type}
                                        onChange={(e) => setNewKeyword({ ...newKeyword, keyword_type: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                    >
                                        <option value="">选择类型</option>
                                        {TYPE_OPTIONS.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowBatchModal(false)}>取消</Button>
                                <Button onClick={handleBatchCreate}>导入</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* AI Generate Modal */}
            {showAIModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-400" />
                                    AI智能衍生关键词
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => { setShowAIModal(false); setAiGeneratedKeywords(null); }}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!aiGeneratedKeywords ? (
                                <>
                                    <div>
                                        <label className="text-sm font-medium">种子关键词（用逗号或换行分隔）</label>
                                        <textarea
                                            value={aiSeedKeywords}
                                            onChange={(e) => setAiSeedKeywords(e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg h-24 resize-none"
                                            placeholder="例如：护肤品, 面膜, 美白"
                                        />
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        AI将根据您输入的种子关键词，自动生成场景词、痛点词和情绪词。
                                    </p>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" onClick={() => setShowAIModal(false)}>取消</Button>
                                        <Button onClick={handleAIGenerate} disabled={aiLoading}>
                                            {aiLoading ? (
                                                <>
                                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                    生成中...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                    开始生成
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        {Object.entries(aiGeneratedKeywords).map(([type, keywords]) => (
                                            <div key={type}>
                                                <h4 className="text-sm font-medium mb-2 capitalize">
                                                    {type === 'scene' ? '🎬 场景词' : type === 'pain_point' ? '😫 痛点词' : '💬 情绪词'}
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {keywords.map((kw, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                                                        >
                                                            {kw}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" onClick={() => setAiGeneratedKeywords(null)}>重新生成</Button>
                                        <Button onClick={handleSaveAIKeywords}>
                                            <Check className="w-4 h-4 mr-2" />
                                            保存全部
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default KeywordsPage;
