import React, { useState } from 'react';
import {
    Sparkles, Wand2, MessageSquare, FileEdit, Copy, Check,
    Loader2, Zap, Target, TrendingUp, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API_BASE = '/api';

interface CommentResult {
    style: string;
    content: string;
    expected_effect: string;
}

interface RewriteResult {
    new_title: string;
    new_content: string;
    highlights: string[];
    suggested_tags: string[];
    similarity_warning?: string;
}

const PLATFORM_OPTIONS = [
    { value: 'xiaohongshu', label: '小红书' },
    { value: 'douyin', label: '抖音' },
    { value: 'weibo', label: '微博' },
    { value: 'bilibili', label: 'B站' },
    { value: 'zhihu', label: '知乎' },
];

const COMMENT_STYLES = [
    { value: 'professional', label: '专业评论', icon: '🎯' },
    { value: 'humorous', label: '幽默风趣', icon: '😄' },
    { value: 'empathy', label: '共情走心', icon: '💕' },
    { value: 'question', label: '提问互动', icon: '❓' },
    { value: 'subtle_promo', label: '软性引流', icon: '💡' },
];

const REWRITE_STYLES = [
    { value: 'xiaohongshu', label: '小红书笔记', icon: '📕' },
    { value: 'douyin', label: '抖音脚本', icon: '🎬' },
    { value: 'weibo', label: '微博热议', icon: '🔥' },
    { value: 'professional', label: '专业文章', icon: '📝' },
];

const SmartCreatorPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'comments' | 'rewrite' | 'analyze'>('comments');
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Comments state
    const [commentContent, setCommentContent] = useState('');
    const [commentTitle, setCommentTitle] = useState('');
    const [commentPlatform, setCommentPlatform] = useState('xiaohongshu');
    const [selectedStyles, setSelectedStyles] = useState(['professional', 'humorous', 'empathy']);
    const [brandKeywords, setBrandKeywords] = useState('');
    const [commentResults, setCommentResults] = useState<CommentResult[]>([]);

    // Rewrite state
    const [originalContent, setOriginalContent] = useState('');
    const [originalTitle, setOriginalTitle] = useState('');
    const [targetStyle, setTargetStyle] = useState('xiaohongshu');
    const [targetTopic, setTargetTopic] = useState('');
    const [rewriteKeywords, setRewriteKeywords] = useState('');
    const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleStyle = (style: string) => {
        if (selectedStyles.includes(style)) {
            setSelectedStyles(selectedStyles.filter(s => s !== style));
        } else {
            setSelectedStyles([...selectedStyles, style]);
        }
    };

    const generateComments = async () => {
        if (!commentContent.trim()) return;

        setLoading(true);
        setCommentResults([]);

        try {
            const response = await fetch(`${API_BASE}/growhub/ai/comments/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: commentContent,
                    content_title: commentTitle || undefined,
                    platform: commentPlatform,
                    styles: selectedStyles,
                    brand_keywords: brandKeywords ? brandKeywords.split(',').map(k => k.trim()) : undefined,
                    provider: 'openrouter'
                })
            });

            const data = await response.json();
            if (data.comments) {
                setCommentResults(data.comments);
            }
        } catch (error) {
            console.error('Generate comments failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const rewriteContent = async () => {
        if (!originalContent.trim()) return;

        setLoading(true);
        setRewriteResult(null);

        try {
            const response = await fetch(`${API_BASE}/growhub/ai/content/rewrite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original_content: originalContent,
                    original_title: originalTitle || undefined,
                    target_style: targetStyle,
                    target_topic: targetTopic || undefined,
                    brand_keywords: rewriteKeywords ? rewriteKeywords.split(',').map(k => k.trim()) : undefined,
                    keep_structure: true,
                    provider: 'openrouter'
                })
            });

            const data = await response.json();
            if (data.rewritten) {
                setRewriteResult(data.rewritten);
            }
        } catch (error) {
            console.error('Rewrite content failed:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Sparkles className="w-7 h-7 text-purple-500" />
                        AI 创作工作台
                        <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 rounded-full border border-purple-500/30">
                            Beta
                        </span>
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        智能生成评论、改写爆款文案、深度分析内容
                    </p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-border pb-2">
                <button
                    onClick={() => setActiveTab('comments')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${activeTab === 'comments'
                        ? 'bg-primary/10 text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <MessageSquare className="w-4 h-4" />
                    智能评论
                </button>
                <button
                    onClick={() => setActiveTab('rewrite')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${activeTab === 'rewrite'
                        ? 'bg-primary/10 text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <FileEdit className="w-4 h-4" />
                    文案改写
                </button>
            </div>

            {/* Smart Comments Tab */}
            {activeTab === 'comments' && (
                <div className="grid grid-cols-2 gap-6">
                    {/* Input Panel */}
                    <Card className="bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Target className="w-5 h-5 text-blue-500" />
                                目标内容
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">内容标题 (可选)</label>
                                <input
                                    type="text"
                                    value={commentTitle}
                                    onChange={(e) => setCommentTitle(e.target.value)}
                                    placeholder="填写帖子标题..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">内容正文 *</label>
                                <textarea
                                    value={commentContent}
                                    onChange={(e) => setCommentContent(e.target.value)}
                                    placeholder="粘贴目标帖子的内容..."
                                    rows={6}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">平台</label>
                                    <select
                                        value={commentPlatform}
                                        onChange={(e) => setCommentPlatform(e.target.value)}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                    >
                                        {PLATFORM_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">品牌关键词 (可选)</label>
                                    <input
                                        type="text"
                                        value={brandKeywords}
                                        onChange={(e) => setBrandKeywords(e.target.value)}
                                        placeholder="用英文逗号分隔"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">评论风格</label>
                                <div className="flex flex-wrap gap-2">
                                    {COMMENT_STYLES.map(style => (
                                        <button
                                            key={style.value}
                                            onClick={() => toggleStyle(style.value)}
                                            className={`px-3 py-1.5 rounded-full text-sm transition-all ${selectedStyles.includes(style.value)
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                                }`}
                                        >
                                            {style.icon} {style.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                onClick={generateComments}
                                disabled={loading || !commentContent.trim() || selectedStyles.length === 0}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        AI 生成中...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="w-4 h-4 mr-2" />
                                        生成智能评论
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Results Panel */}
                    <Card className="bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Zap className="w-5 h-5 text-yellow-500" />
                                生成结果
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {commentResults.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>填写目标内容后点击生成</p>
                                    <p className="text-sm mt-1">AI 将为你生成多种风格的神评论</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {commentResults.map((result, index) => (
                                        <div
                                            key={index}
                                            className="p-4 bg-background/50 rounded-lg border border-border group hover:border-primary/50 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-primary">
                                                    {COMMENT_STYLES.find(s => s.value === result.style)?.icon}{' '}
                                                    {COMMENT_STYLES.find(s => s.value === result.style)?.label || result.style}
                                                </span>
                                                <button
                                                    onClick={() => handleCopy(result.content, `comment-${index}`)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                                                >
                                                    {copiedId === `comment-${index}` ? (
                                                        <Check className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                        <Copy className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <p className="text-foreground leading-relaxed">{result.content}</p>
                                            {result.expected_effect && (
                                                <p className="text-xs text-muted-foreground mt-2 italic">
                                                    💡 {result.expected_effect}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Rewrite Tab */}
            {activeTab === 'rewrite' && (
                <div className="grid grid-cols-2 gap-6">
                    {/* Input Panel */}
                    <Card className="bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <TrendingUp className="w-5 h-5 text-orange-500" />
                                原始爆款
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">原始标题</label>
                                <input
                                    type="text"
                                    value={originalTitle}
                                    onChange={(e) => setOriginalTitle(e.target.value)}
                                    placeholder="爆款帖子的标题..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">原始内容 *</label>
                                <textarea
                                    value={originalContent}
                                    onChange={(e) => setOriginalContent(e.target.value)}
                                    placeholder="粘贴你想改写的爆款内容..."
                                    rows={8}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">目标风格</label>
                                    <select
                                        value={targetStyle}
                                        onChange={(e) => setTargetStyle(e.target.value)}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                    >
                                        {REWRITE_STYLES.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.icon} {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">目标主题/行业</label>
                                    <input
                                        type="text"
                                        value={targetTopic}
                                        onChange={(e) => setTargetTopic(e.target.value)}
                                        placeholder="如: 护肤、健身..."
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">融入关键词 (可选)</label>
                                <input
                                    type="text"
                                    value={rewriteKeywords}
                                    onChange={(e) => setRewriteKeywords(e.target.value)}
                                    placeholder="你的品牌或产品名，用逗号分隔"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                />
                            </div>

                            <Button
                                onClick={rewriteContent}
                                disabled={loading || !originalContent.trim()}
                                className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        AI 改写中...
                                    </>
                                ) : (
                                    <>
                                        <FileEdit className="w-4 h-4 mr-2" />
                                        一键改写
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Results Panel */}
                    <Card className="bg-card/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Sparkles className="w-5 h-5 text-purple-500" />
                                改写结果
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!rewriteResult ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <FileEdit className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>粘贴爆款内容后点击改写</p>
                                    <p className="text-sm mt-1">AI 将保留爆款逻辑，全新表达</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* New Title */}
                                    <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-purple-400">新标题</span>
                                            <button
                                                onClick={() => handleCopy(rewriteResult.new_title, 'title')}
                                                className="p-1.5 hover:bg-muted rounded"
                                            >
                                                {copiedId === 'title' ? (
                                                    <Check className="w-4 h-4 text-green-500" />
                                                ) : (
                                                    <Copy className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-lg font-medium">{rewriteResult.new_title}</p>
                                    </div>

                                    {/* New Content */}
                                    <div className="p-4 bg-background/50 rounded-lg border border-border">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-primary">新正文</span>
                                            <button
                                                onClick={() => handleCopy(rewriteResult.new_content, 'content')}
                                                className="p-1.5 hover:bg-muted rounded"
                                            >
                                                {copiedId === 'content' ? (
                                                    <Check className="w-4 h-4 text-green-500" />
                                                ) : (
                                                    <Copy className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                                            {rewriteResult.new_content}
                                        </p>
                                    </div>

                                    {/* Tags */}
                                    {rewriteResult.suggested_tags && rewriteResult.suggested_tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {rewriteResult.suggested_tags.map((tag, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Warning */}
                                    {rewriteResult.similarity_warning && (
                                        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            {rewriteResult.similarity_warning}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default SmartCreatorPage;
