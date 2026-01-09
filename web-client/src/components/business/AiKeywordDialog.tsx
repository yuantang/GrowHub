import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { fetchAIKeywords } from '@/api';
import { Sparkles, Activity, AlertTriangle, Search, Loader2 } from 'lucide-react';
import { cn } from '@/utils';

interface AiKeywordDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (keywords: string[]) => void;
    initialKeyword?: string;
    mode?: 'risk' | 'trend'; // default mode
}

const AI_MODELS = [
    { value: "deepseek/deepseek-chat", label: "DeepSeek V3 (推荐)" },
    { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free)" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
];

export const AiKeywordDialog: React.FC<AiKeywordDialogProps> = ({
    isOpen,
    onClose,
    onSelect,
    initialKeyword = '',
    mode: initialMode = 'trend'
}) => {
    const [target, setTarget] = useState(initialKeyword);
    const [mode, setMode] = useState<'risk' | 'trend'>(initialMode);
    const [model, setModel] = useState(AI_MODELS[0].value);
    const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setTarget(initialKeyword);
            setMode(initialMode);
            setStep(1);
            setSuggestedKeywords([]);
            setSelectedKeywords([]);
        }
    }, [isOpen, initialKeyword, initialMode]);

    const handleAnalyze = async () => {
        if (!target) return;
        setIsAnalyzing(true);
        try {
            const keywords = await fetchAIKeywords(target, mode, model);
            if (keywords && keywords.length > 0) {
                setSuggestedKeywords(keywords);
                setSelectedKeywords(keywords.slice(0, 5));
                setStep(2);
            } else {
                setSuggestedKeywords([]);
                setStep(2);
            }
        } catch (error) {
            console.error("AI Analysis failed:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleKeyword = (kw: string) => {
        if (selectedKeywords.includes(kw)) {
            setSelectedKeywords(prev => prev.filter(k => k !== kw));
        } else {
            setSelectedKeywords(prev => [...prev, kw]);
        }
    };

    const handleConfirm = () => {
        onSelect(selectedKeywords);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="AI 智能关键词推荐"
            className="max-w-lg"
        >
            {step === 1 && (
                <div className="space-y-6">
                    <div>
                        <label className="text-sm font-medium mb-2 block text-foreground/80">核心词</label>
                        <Input
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            placeholder="输入品牌、产品或话题"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-3 block text-foreground/80">推荐模式</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div
                                className={cn(
                                    "cursor-pointer border-2 rounded-xl p-3 transition-all hover:bg-muted/50 relative flex flex-col items-center text-center gap-2",
                                    mode === 'risk' ? "border-rose-500 bg-rose-50 dark:bg-rose-900/10" : "border-border"
                                )}
                                onClick={() => setMode('risk')}
                            >
                                <AlertTriangle className={cn("w-6 h-6", mode === 'risk' ? "text-rose-600" : "text-muted-foreground")} />
                                <span className={cn("font-bold text-sm", mode === 'risk' ? "text-rose-700 dark:text-rose-400" : "")}>舆情/避雷</span>
                            </div>

                            <div
                                className={cn(
                                    "cursor-pointer border-2 rounded-xl p-3 transition-all hover:bg-muted/50 relative flex flex-col items-center text-center gap-2",
                                    mode === 'trend' ? "border-purple-500 bg-purple-50 dark:bg-purple-900/10" : "border-border"
                                )}
                                onClick={() => setMode('trend')}
                            >
                                <Activity className={cn("w-6 h-6", mode === 'trend' ? "text-purple-600" : "text-muted-foreground")} />
                                <span className={cn("font-bold text-sm", mode === 'trend' ? "text-purple-700 dark:text-purple-400" : "")}>热门/关联</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium block text-foreground/80">AI 模型</label>
                        <Select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                        >
                            {AI_MODELS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        onClick={handleAnalyze}
                        disabled={!target || isAnalyzing}
                        className="w-full h-11 text-base gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-lg"
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        {isAnalyzing ? '正在分析...' : '生成推荐'}
                    </Button>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">推荐结果 ({suggestedKeywords.length})</h3>
                        <span className="text-xs text-muted-foreground">已选 {selectedKeywords.length} 个</span>
                    </div>

                    {suggestedKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto p-1">
                            {suggestedKeywords.map(kw => (
                                <div
                                    key={kw}
                                    onClick={() => toggleKeyword(kw)}
                                    className={cn(
                                        "cursor-pointer px-3 py-1.5 rounded-full text-sm transition-all border select-none",
                                        selectedKeywords.includes(kw)
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                            : "bg-background border-border hover:border-primary/50 text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    {kw}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                            未找到相关推荐词
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={() => setStep(1)} className="flex-1">返回重试</Button>
                        <Button onClick={handleConfirm} className="flex-1">确认选择</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};
