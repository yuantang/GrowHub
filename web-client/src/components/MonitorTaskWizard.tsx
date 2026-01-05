import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { fetchAIKeywords } from '../api';
import { Sparkles, Activity, AlertTriangle, Plus, Search, Settings } from 'lucide-react';
import { cn } from '../utils/cn';

interface MonitorTaskWizardProps {
    onStartTask: (keyword: string) => void;
    trigger?: React.ReactNode;
}

const AI_MODELS = [
    { value: "deepseek/deepseek-chat", label: "DeepSeek V3 (推荐)" },
    { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free)" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" }
];

export const MonitorTaskWizard: React.FC<MonitorTaskWizardProps> = ({ onStartTask, trigger }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [target, setTarget] = useState('');
    const [mode, setMode] = useState<'risk' | 'trend'>('risk');
    const [model, setModel] = useState(AI_MODELS[0].value);
    const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        if (!target) return;
        setIsAnalyzing(true);
        try {
            const keywords = await fetchAIKeywords(target, mode, model);
            if (keywords && keywords.length > 0) {
                setSuggestedKeywords(keywords);
                setSelectedKeywords(keywords.slice(0, 5)); // Auto-select top 5
                setStep(2);
            } else {
                // Handle empty result - maybe show toast or fallback
                // For now, we simulate a fallback or show empty
                setSuggestedKeywords([]);
                setStep(2);
            }
        } catch (error) {
            console.error("AI Analysis failed:", error);
            // Optionally show error to user
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

    const handleCreate = () => {
        const finalQuery = `${target} ${selectedKeywords.join(' ')}`; // Simple concatenation for query
        onStartTask(finalQuery);
        setIsOpen(false);
        // Reset state
        setStep(1);
        setTarget('');
        setSuggestedKeywords([]);
    };

    return (
        <>
            {trigger ? (
                <div onClick={() => setIsOpen(true)} className="inline-block">{trigger}</div>
            ) : (
                <Button onClick={() => setIsOpen(true)} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity border-0 shadow-md">
                    <Plus className="w-4 h-4" />
                    新建监控任务
                </Button>
            )}

            <Modal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title="创建智能监控任务"
                className="max-w-xl"
            >
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-medium mb-2 block text-foreground/80">监控目标</label>
                            <Input
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder="输入产品名、品牌或话题（如：SK-II神仙水）"
                                className="h-12 text-lg"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-3 block text-foreground/80">监控模式</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div
                                    className={cn(
                                        "cursor-pointer border-2 rounded-xl p-4 transition-all hover:bg-muted/50 relative",
                                        mode === 'risk' ? "border-rose-500 bg-rose-50 dark:bg-rose-900/10" : "border-border"
                                    )}
                                    onClick={() => setMode('risk')}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={cn("p-1.5 rounded-full", mode === 'risk' ? "bg-rose-100 dark:bg-rose-900/30" : "bg-muted")}>
                                            <AlertTriangle className={cn("w-5 h-5", mode === 'risk' ? "text-rose-600" : "text-muted-foreground")} />
                                        </div>
                                        <span className={cn("font-bold", mode === 'risk' ? "text-rose-700 dark:text-rose-400" : "")}>舆情预警</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        重点监控差评、避雷、假货等负面信息。
                                        <br />适用：品牌声誉保护、竞品黑料挖掘。
                                    </p>
                                </div>

                                <div
                                    className={cn(
                                        "cursor-pointer border-2 rounded-xl p-4 transition-all hover:bg-muted/50 relative",
                                        mode === 'trend' ? "border-purple-500 bg-purple-50 dark:bg-purple-900/10" : "border-border"
                                    )}
                                    onClick={() => setMode('trend')}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={cn("p-1.5 rounded-full", mode === 'trend' ? "bg-purple-100 dark:bg-purple-900/30" : "bg-muted")}>
                                            <Activity className={cn("w-5 h-5", mode === 'trend' ? "text-purple-600" : "text-muted-foreground")} />
                                        </div>
                                        <span className={cn("font-bold", mode === 'trend' ? "text-purple-700 dark:text-purple-400" : "")}>热点挖掘</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        发现高增长话题、热门趋势和爆款内容。
                                        <br />适用：选题灵感、流量趋势分析。
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="text-sm font-medium mb-1.5 block text-foreground/80 flex items-center gap-2">
                                    <Settings className="w-3 h-3" /> AI 模型
                                </label>
                                <Select
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    className="h-10"
                                >
                                    {AI_MODELS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button
                                onClick={handleAnalyze}
                                disabled={!target || isAnalyzing}
                                className="w-full h-12 text-base gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 transition-opacity border-0 shadow-lg shadow-violet-500/20"
                            >
                                {isAnalyzing ? 'AI 正在深度分析...' : <><Sparkles className="w-4 h-4" /> 智能生成关键词</>}
                            </Button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">监控对象</span>
                                <span className={cn("text-xs px-2 py-0.5 rounded font-medium", mode === 'risk' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300")}>
                                    {mode === 'risk' ? '舆情预警' : '热点挖掘'}
                                </span>
                            </div>
                            <div className="text-xl font-bold tracking-tight">{target}</div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-violet-500" />
                                    AI 推荐关键词
                                </label>
                                <span className="text-xs text-muted-foreground">已选 {selectedKeywords.length} 个</span>
                            </div>

                            {suggestedKeywords.length > 0 ? (
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                                    {suggestedKeywords.map(kw => (
                                        <div
                                            key={kw}
                                            onClick={() => toggleKeyword(kw)}
                                            className={cn(
                                                "cursor-pointer px-3 py-1.5 rounded-full text-sm transition-all border select-none",
                                                selectedKeywords.includes(kw)
                                                    ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                                                    : "bg-background border-border hover:border-primary/50 text-muted-foreground hover:bg-accent"
                                            )}
                                        >
                                            {kw}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                                    AI 未返回推荐关键词，请重试或检查配置。
                                </div>
                            )}
                        </div>

                        <div className="bg-muted p-3 rounded text-xs text-muted-foreground break-all border border-border/50">
                            <div className="font-semibold mb-1">搜索预览:</div>
                            <span className="font-mono text-foreground">{target} {selectedKeywords.join(' ')}</span>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">上一步</Button>
                            <Button onClick={handleCreate} className="flex-1 h-12 bg-primary gap-2 shadow-lg hover:translate-y-[-1px] transition-all">
                                <Search className="w-4 h-4" />
                                开始监控
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
};
