import React, { useState, useEffect } from 'react';
import {
    Filter, Plus, Trash2, RefreshCw, X, Edit2, Save,
    AlertTriangle, Play, Pause, ArrowRight, MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = '/api';

interface DistributionRule {
    id: number;
    name: string;
    description: string | null;
    conditions: RuleCondition[];
    actions: RuleAction[];
    priority: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface RuleCondition {
    field: string;
    operator: string;
    value: string | number | boolean;
}

interface RuleAction {
    type: string;
    config: Record<string, any>;
}

interface NotificationChannel {
    id: number;
    name: string;
    channel_type: string;
}

const CONDITION_FIELDS = [
    { value: 'sentiment', label: '情感倾向', type: 'select', options: ['positive', 'neutral', 'negative'] },
    { value: 'category', label: '内容分类', type: 'select', options: ['sentiment', 'hotspot', 'competitor', 'influencer', 'general'] },
    { value: 'platform', label: '平台', type: 'select', options: ['douyin', 'xiaohongshu', 'bilibili', 'weibo', 'zhihu'] },
    { value: 'like_count', label: '点赞数', type: 'number' },
    { value: 'comment_count', label: '评论数', type: 'number' },
    { value: 'share_count', label: '分享数', type: 'number' },
    { value: 'view_count', label: '播放量', type: 'number' },
    { value: 'engagement_rate', label: '互动率', type: 'number' },
];

const OPERATORS = [
    { value: 'equals', label: '等于' },
    { value: 'not_equals', label: '不等于' },
    { value: 'greater_than', label: '大于' },
    { value: 'less_than', label: '小于' },
    { value: 'contains', label: '包含' },
];

const ACTION_TYPES = [
    { value: 'notify', label: '发送通知', icon: MessageSquare },
    { value: 'set_alert', label: '标记预警', icon: AlertTriangle },
    { value: 'set_category', label: '设置分类', icon: Filter },
];

const CATEGORY_LABELS: Record<string, string> = {
    sentiment: '舆情',
    hotspot: '热点',
    competitor: '竞品',
    influencer: '达人',
    general: '普通',
};

const SENTIMENT_LABELS: Record<string, string> = {
    positive: '正面',
    neutral: '中性',
    negative: '负面',
};

const PLATFORM_LABELS: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    bilibili: 'B站',
    weibo: '微博',
    zhihu: '知乎',
};

const RulesPage: React.FC = () => {
    const [rules, setRules] = useState<DistributionRule[]>([]);
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState<DistributionRule | null>(null);

    // Form state
    const [ruleForm, setRuleForm] = useState({
        name: '',
        description: '',
        priority: 50,
        conditions: [] as RuleCondition[],
        actions: [] as RuleAction[],
    });

    const fetchRules = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/growhub/rules`);
            const data = await response.json();
            setRules(data.items || []);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchChannels = async () => {
        try {
            const response = await fetch(`${API_BASE}/growhub/notifications/channels`);
            const data = await response.json();
            setChannels(data.items || []);
        } catch (error) {
            console.error('Failed to fetch channels:', error);
        }
    };

    useEffect(() => {
        fetchRules();
        fetchChannels();
    }, []);

    const handleSaveRule = async () => {
        if (!ruleForm.name.trim()) {
            alert('请输入规则名称');
            return;
        }

        try {
            const url = editingRule
                ? `${API_BASE}/growhub/rules/${editingRule.id}`
                : `${API_BASE}/growhub/rules`;

            const response = await fetch(url, {
                method: editingRule ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ruleForm),
            });

            if (response.ok) {
                setShowModal(false);
                setEditingRule(null);
                resetForm();
                fetchRules();
            } else {
                const error = await response.json();
                alert(error.detail || '保存失败');
            }
        } catch (error) {
            console.error('Failed to save rule:', error);
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm('确定删除此规则？')) return;

        try {
            await fetch(`${API_BASE}/growhub/rules/${id}`, { method: 'DELETE' });
            fetchRules();
        } catch (error) {
            console.error('Failed to delete rule:', error);
        }
    };

    const handleToggleActive = async (rule: DistributionRule) => {
        try {
            await fetch(`${API_BASE}/growhub/rules/${rule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
            });
            fetchRules();
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        }
    };

    const resetForm = () => {
        setRuleForm({
            name: '',
            description: '',
            priority: 50,
            conditions: [],
            actions: [],
        });
    };

    const openEditRule = (rule: DistributionRule) => {
        setEditingRule(rule);
        setRuleForm({
            name: rule.name,
            description: rule.description || '',
            priority: rule.priority,
            conditions: rule.conditions || [],
            actions: rule.actions || [],
        });
        setShowModal(true);
    };

    const addCondition = () => {
        setRuleForm({
            ...ruleForm,
            conditions: [...ruleForm.conditions, { field: 'sentiment', operator: 'equals', value: 'negative' }],
        });
    };

    const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
        const newConditions = [...ruleForm.conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        setRuleForm({ ...ruleForm, conditions: newConditions });
    };

    const removeCondition = (index: number) => {
        setRuleForm({
            ...ruleForm,
            conditions: ruleForm.conditions.filter((_, i) => i !== index),
        });
    };

    const addAction = () => {
        setRuleForm({
            ...ruleForm,
            actions: [...ruleForm.actions, { type: 'set_alert', config: { level: 'medium' } }],
        });
    };

    const updateAction = (index: number, updates: Partial<RuleAction>) => {
        const newActions = [...ruleForm.actions];
        newActions[index] = { ...newActions[index], ...updates };
        setRuleForm({ ...ruleForm, actions: newActions });
    };

    const removeAction = (index: number) => {
        setRuleForm({
            ...ruleForm,
            actions: ruleForm.actions.filter((_, i) => i !== index),
        });
    };

    const getFieldConfig = (field: string) => {
        return CONDITION_FIELDS.find(f => f.value === field);
    };

    const formatConditionValue = (condition: RuleCondition) => {
        const field = getFieldConfig(condition.field);
        if (field?.value === 'sentiment') return SENTIMENT_LABELS[condition.value as string] || condition.value;
        if (field?.value === 'category') return CATEGORY_LABELS[condition.value as string] || condition.value;
        if (field?.value === 'platform') return PLATFORM_LABELS[condition.value as string] || condition.value;
        return String(condition.value);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">分发规则</h1>
                    <p className="text-muted-foreground mt-1">配置内容自动分类和预警触发规则</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={fetchRules}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        刷新
                    </Button>
                    <Button onClick={() => { resetForm(); setShowModal(true); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        添加规则
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="bg-card/50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">总规则数</p>
                                <p className="text-2xl font-bold">{rules.length}</p>
                            </div>
                            <Filter className="w-8 h-8 text-primary/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">启用规则</p>
                                <p className="text-2xl font-bold text-green-400">
                                    {rules.filter(r => r.is_active).length}
                                </p>
                            </div>
                            <Play className="w-8 h-8 text-green-500/50" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">通知渠道</p>
                                <p className="text-2xl font-bold text-blue-400">{channels.length}</p>
                            </div>
                            <MessageSquare className="w-8 h-8 text-blue-500/50" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Rules List */}
            <div className="space-y-3">
                {loading ? (
                    <Card className="bg-card/50">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            加载中...
                        </CardContent>
                    </Card>
                ) : rules.length === 0 ? (
                    <Card className="bg-card/50">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <p>暂无分发规则</p>
                            <p className="text-sm mt-2">点击"添加规则"创建自动分类和预警规则</p>
                        </CardContent>
                    </Card>
                ) : (
                    rules.map((rule) => (
                        <Card key={rule.id} className={`bg-card/50 hover:bg-card/80 transition-colors ${!rule.is_active ? 'opacity-60' : ''}`}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-medium">{rule.name}</h3>
                                            <span className={`px-2 py-0.5 text-xs rounded ${rule.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                {rule.is_active ? '启用' : '禁用'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                优先级: {rule.priority}
                                            </span>
                                        </div>
                                        {rule.description && (
                                            <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                                        )}

                                        {/* Conditions & Actions Preview */}
                                        <div className="flex items-center gap-4 mt-3 text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">条件:</span>
                                                {(rule.conditions || []).map((c, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                                                        {getFieldConfig(c.field)?.label} {OPERATORS.find(o => o.value === c.operator)?.label} {formatConditionValue(c)}
                                                    </span>
                                                ))}
                                                {(!rule.conditions || rule.conditions.length === 0) && (
                                                    <span className="text-muted-foreground text-xs">无</span>
                                                )}
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">动作:</span>
                                                {(rule.actions || []).map((a, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                                                        {ACTION_TYPES.find(t => t.value === a.type)?.label}
                                                    </span>
                                                ))}
                                                {(!rule.actions || rule.actions.length === 0) && (
                                                    <span className="text-muted-foreground text-xs">无</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleActive(rule)}
                                        >
                                            {rule.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEditRule(rule)}
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400"
                                            onClick={() => handleDeleteRule(rule.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Rule Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
                    <Card className="w-full max-w-2xl mx-4">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                {editingRule ? '编辑规则' : '添加分发规则'}
                                <Button variant="ghost" size="sm" onClick={() => { setShowModal(false); setEditingRule(null); resetForm(); }}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">规则名称 *</label>
                                    <input
                                        type="text"
                                        value={ruleForm.name}
                                        onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg"
                                        placeholder="例如：负面舆情预警"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">优先级 ({ruleForm.priority})</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={100}
                                        value={ruleForm.priority}
                                        onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) })}
                                        className="w-full mt-3"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium">描述</label>
                                <textarea
                                    value={ruleForm.description}
                                    onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg h-16 resize-none"
                                    placeholder="规则描述..."
                                />
                            </div>

                            {/* Conditions */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-medium">触发条件</label>
                                    <Button variant="outline" size="sm" onClick={addCondition}>
                                        <Plus className="w-3 h-3 mr-1" /> 添加条件
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {ruleForm.conditions.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-2">暂无条件，所有内容都将匹配此规则</p>
                                    ) : (
                                        ruleForm.conditions.map((condition, index) => {
                                            const fieldConfig = getFieldConfig(condition.field);
                                            return (
                                                <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                                                    <select
                                                        value={condition.field}
                                                        onChange={(e) => updateCondition(index, { field: e.target.value, value: '' })}
                                                        className="px-2 py-1 bg-background border border-border rounded text-sm"
                                                    >
                                                        {CONDITION_FIELDS.map(f => (
                                                            <option key={f.value} value={f.value}>{f.label}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={condition.operator}
                                                        onChange={(e) => updateCondition(index, { operator: e.target.value })}
                                                        className="px-2 py-1 bg-background border border-border rounded text-sm"
                                                    >
                                                        {OPERATORS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                    {fieldConfig?.type === 'select' ? (
                                                        <select
                                                            value={condition.value as string}
                                                            onChange={(e) => updateCondition(index, { value: e.target.value })}
                                                            className="px-2 py-1 bg-background border border-border rounded text-sm flex-1"
                                                        >
                                                            <option value="">选择...</option>
                                                            {fieldConfig.options?.map(opt => (
                                                                <option key={opt} value={opt}>
                                                                    {condition.field === 'sentiment' ? SENTIMENT_LABELS[opt] :
                                                                        condition.field === 'category' ? CATEGORY_LABELS[opt] :
                                                                            condition.field === 'platform' ? PLATFORM_LABELS[opt] : opt}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            value={condition.value as number}
                                                            onChange={(e) => updateCondition(index, { value: parseInt(e.target.value) || 0 })}
                                                            className="px-2 py-1 bg-background border border-border rounded text-sm w-24"
                                                        />
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-400"
                                                        onClick={() => removeCondition(index)}
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-medium">执行动作</label>
                                    <Button variant="outline" size="sm" onClick={addAction}>
                                        <Plus className="w-3 h-3 mr-1" /> 添加动作
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {ruleForm.actions.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-2">暂无动作</p>
                                    ) : (
                                        ruleForm.actions.map((action, index) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                                                <select
                                                    value={action.type}
                                                    onChange={(e) => updateAction(index, { type: e.target.value, config: {} })}
                                                    className="px-2 py-1 bg-background border border-border rounded text-sm"
                                                >
                                                    {ACTION_TYPES.map(t => (
                                                        <option key={t.value} value={t.value}>{t.label}</option>
                                                    ))}
                                                </select>

                                                {action.type === 'notify' && (
                                                    <select
                                                        value={action.config.channel_id || ''}
                                                        onChange={(e) => updateAction(index, { config: { ...action.config, channel_id: parseInt(e.target.value) } })}
                                                        className="px-2 py-1 bg-background border border-border rounded text-sm flex-1"
                                                    >
                                                        <option value="">选择通知渠道...</option>
                                                        {channels.map(ch => (
                                                            <option key={ch.id} value={ch.id}>{ch.name}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                {action.type === 'set_alert' && (
                                                    <select
                                                        value={action.config.level || 'medium'}
                                                        onChange={(e) => updateAction(index, { config: { level: e.target.value } })}
                                                        className="px-2 py-1 bg-background border border-border rounded text-sm flex-1"
                                                    >
                                                        <option value="low">低级预警</option>
                                                        <option value="medium">中级预警</option>
                                                        <option value="high">高级预警</option>
                                                        <option value="critical">紧急预警</option>
                                                    </select>
                                                )}

                                                {action.type === 'set_category' && (
                                                    <select
                                                        value={action.config.category || ''}
                                                        onChange={(e) => updateAction(index, { config: { category: e.target.value } })}
                                                        className="px-2 py-1 bg-background border border-border rounded text-sm flex-1"
                                                    >
                                                        <option value="">选择分类...</option>
                                                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                                            <option key={k} value={k}>{v}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400"
                                                    onClick={() => removeAction(index)}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Save */}
                            <div className="flex justify-end gap-2 pt-4 border-t border-border">
                                <Button variant="outline" onClick={() => { setShowModal(false); setEditingRule(null); resetForm(); }}>
                                    取消
                                </Button>
                                <Button onClick={handleSaveRule}>
                                    <Save className="w-4 h-4 mr-2" />
                                    {editingRule ? '保存' : '创建规则'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default RulesPage;
