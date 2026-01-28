import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  FolderOpen,
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Clock,
  Search,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Zap,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MultiSelect } from "@/components/ui/MultiSelect";
import {
  fetchAIKeywords,
  ProjectPurposeLabels,
  fetchProjectPlatforms,
  fetchNotificationChannels,
  fetchProjects as apiFetchProjects,
  createProject as apiCreateProject,
  startProject,
  stopProject,
  runProjectImmediately,
  fetchProjectPreflight,
  deleteProject as apiDeleteProject,
  type NotificationChannel,
} from "@/api";

interface Project {
  id: number;
  name: string;
  description?: string;
  keywords: string[];
  platforms: string[];
  crawler_type: string;
  crawl_limit: number;
  crawl_date_range?: number;
  enable_comments: boolean;
  schedule_type: string;
  schedule_value: string;
  is_active: boolean;
  alert_on_negative: boolean;
  alert_on_new_content: boolean;
  alert_on_hotspot: boolean;
  alert_channels: (string | number)[];
  last_run_at?: string;
  next_run_at?: string;
  run_count: number;
  total_crawled: number;
  total_alerts: number;
  today_crawled: number;
  today_alerts: number;
  created_at?: string;
  is_running?: boolean;
  use_plugin: boolean;
  // 博主筛选
  min_fans?: number;
  max_fans?: number;
  require_contact?: boolean;
  // 舆情敏感词 (逗号分隔的字符串，与后端同步)
  sentiment_keywords?: string[] | string;
}

// Assuming PlatformOption is the type returned by fetchPlatforms
interface PlatformOption {
  value: string;
  label: string;
  icon: string;
}

const PLATFORM_MAP: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  xhs: { label: "小红书", icon: "📕", color: "bg-red-500/10 text-red-500" },
  dy: { label: "抖音", icon: "🎵", color: "bg-slate-500/20 text-slate-300" },
  douyin: {
    label: "抖音",
    icon: "🎵",
    color: "bg-slate-500/20 text-slate-300",
  },
  bili: { label: "B站", icon: "📺", color: "bg-pink-500/10 text-pink-500" },
  bilibili: { label: "B站", icon: "📺", color: "bg-pink-500/10 text-pink-500" },
  wb: { label: "微博", icon: "📱", color: "bg-orange-500/10 text-orange-500" },
  weibo: {
    label: "微博",
    icon: "📱",
    color: "bg-orange-500/10 text-orange-500",
  },
  ks: { label: "快手", icon: "📹", color: "bg-yellow-500/10 text-yellow-500" },
  kuaishou: {
    label: "快手",
    icon: "📹",
    color: "bg-yellow-500/10 text-yellow-500",
  },
  zhihu: { label: "知乎", icon: "❓", color: "bg-blue-500/10 text-blue-500" },
};

// Custom helper for clean number inputs (handles 0 as empty, fixes leading zeros)
const CleanNumberInput = ({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number | string;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
}) => {
  // Helper to check if value is effectively 0
  const isZero = (v: number | string) => Number(v) === 0;

  // Initialize: if value is 0, show empty string
  const [localValue, setLocalValue] = useState<string>(
    isZero(value) ? "" : String(value),
  );

  // Force sync when external value changes
  useEffect(() => {
    if (isZero(value)) {
      // Only clear if local is not already empty (to avoid cursor jump loops if logic was complex, though here it's fine)
      if (localValue !== "") setLocalValue("");
    } else {
      if (String(value) !== localValue) setLocalValue(String(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      setLocalValue("");
      onChange(0);
      return;
    }
    if (!/^\d+$/.test(val)) return;
    const num = parseInt(val, 10);
    if (num === 0) {
      setLocalValue("");
      onChange(0);
    } else {
      setLocalValue(String(num));
      onChange(num);
    }
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
};

// AI 关键词联想组件
const AIKeywordSuggest: React.FC<{
  onSelect: (keywords: string[]) => void;
}> = ({ onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"risk" | "trend">("risk");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const handleAnalyze = async () => {
    if (!target.trim()) return;
    setLoading(true);
    try {
      const keywords = await fetchAIKeywords(
        target,
        mode,
        "google/gemini-2.0-flash-exp:free",
      );
      if (keywords && Array.isArray(keywords) && keywords.length > 0) {
        setSuggestions(keywords);
        setSelected(keywords.slice(0, 5));
      } else {
        setSuggestions([]);
        toast.error("AI 未返回相关联想词，请换个词试试");
      }
    } catch (e: any) {
      console.error("AI analysis failed:", e);
      setSuggestions([]);
      toast.error("获取 AI 联想失败，请检查网络或配置");
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyword = (kw: string) => {
    setSelected((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  const handleConfirm = () => {
    onSelect(selected);
    setIsOpen(false);
    setTarget("");
    setSuggestions([]);
    setSelected([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs px-2 py-1 rounded bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 flex items-center gap-1 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        AI 智能联想
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              AI 关键词联想
            </h3>

            {suggestions.length === 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    输入品牌/产品名
                  </label>
                  <input
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="如：Now冥想、熊猫睡眠"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    联想模式
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("risk")}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        mode === "risk"
                          ? "bg-rose-500/10 border-rose-500 text-rose-600"
                          : "bg-background border-border"
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      舆情预警词
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("trend")}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        mode === "trend"
                          ? "bg-purple-500/10 border-purple-500 text-purple-600"
                          : "bg-background border-border"
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 inline mr-1" />
                      热点趋势词
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    className="flex-1"
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleAnalyze}
                    disabled={!target.trim() || loading}
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    {loading ? "分析中..." : "开始联想"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  基于{" "}
                  <span className="font-medium text-foreground">{target}</span>{" "}
                  联想的
                  {mode === "risk" ? "舆情预警" : "热点趋势"}关键词：
                </div>

                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                  {suggestions.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => toggleKeyword(kw)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                        selected.includes(kw)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      }`}
                    >
                      {kw}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground">
                  已选择 {selected.length} 个关键词
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setSuggestions([])}
                    className="flex-1"
                  >
                    重新输入
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={selected.length === 0}
                    className="flex-1"
                  >
                    添加选中关键词
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<
    NotificationChannel[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [runningProjects, setRunningProjects] = useState<Set<number>>(
    new Set(),
  ); // 跟踪正在执行的项目

  // 新建项目表单
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    keywords: "",
    platforms: ["xhs"] as string[],
    crawler_type: "search",
    crawl_limit: 20,
    crawl_date_range: 7, // 默认最近7天
    schedule_type: "interval",
    schedule_value: "3600",
    alert_on_negative: true,
    alert_on_new_content: false,
    alert_on_hotspot: false,
    auto_start: false,
    // 高级过滤 - 范围
    min_likes: 0,
    max_likes: 0,
    min_comments: 0,
    max_comments: 0,
    min_shares: 0,
    max_shares: 0,
    min_favorites: 0,
    max_favorites: 0,
    // 新增博主筛选
    min_fans: 0,
    max_fans: 0,
    require_contact: false,
    sentiment_keywords: "",
    enable_comments: true,
    deduplicate_authors: false,
    purpose: "general", // 任务目的
    alert_channels: [] as (string | number)[],
    use_plugin: false,
  });

  useEffect(() => {
    fetchProjects();
    fetchProjectPlatforms().then(setPlatforms);
    fetchNotificationChannels().then(setNotificationChannels);
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiFetchProjects();
      setProjects(data);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProject.name.trim()) return;

    // 验证：舆情监控任务必须填写敏感词
    if (
      newProject.purpose === "sentiment" &&
      !newProject.sentiment_keywords.trim()
    ) {
      alert("舆情监控任务必须填写舆情敏感词");
      return;
    }

    try {
      // ... normalize platforms and prepare payload existing logic ...
      const platformNormalize: Record<string, string> = {
        douyin: "dy",
        bilibili: "bili",
        weibo: "wb",
        kuaishou: "ks",
        xhs: "xhs",
        dy: "dy",
        bili: "bili",
        wb: "wb",
        ks: "ks",
        zhihu: "zhihu",
      };

      const payload = {
        ...newProject,
        keywords: newProject.keywords
          .split(/[,，\n\s]+/)
          .filter((k) => k.trim()),
        sentiment_keywords: newProject.sentiment_keywords
          .split(/[,，\n\s]+/)
          .filter((k) => k.trim()),
        platforms: Array.from(
          new Set(
            (newProject.platforms || []).map((p) => platformNormalize[p] || p),
          ),
        ),
        // 设置预警标记
        alert_on_negative: newProject.alert_on_negative,
        alert_on_new_content: newProject.alert_on_new_content,
        alert_on_hotspot: newProject.alert_on_hotspot,
        alert_channels: newProject.alert_channels,
        use_plugin: newProject.use_plugin,
      };

      await apiCreateProject(payload);

      setShowCreateModal(false);
      setNewProject({
        name: "",
        description: "",
        keywords: "",
        platforms: ["xhs"],
        crawler_type: "search",
        crawl_limit: 20,
        crawl_date_range: 7,
        schedule_type: "interval",
        schedule_value: "3600",
        alert_on_negative: true,
        alert_on_new_content: false,
        alert_on_hotspot: false,
        auto_start: false,
        min_likes: 0,
        max_likes: 0,
        min_comments: 0,
        max_comments: 0,
        min_shares: 0,
        max_shares: 0,
        min_favorites: 0,
        max_favorites: 0,
        min_fans: 0,
        max_fans: 0,
        require_contact: false,
        sentiment_keywords: "",
        enable_comments: true,
        deduplicate_authors: false,
        purpose: "general",
        alert_channels: [],
        use_plugin: false,
      });
      fetchProjects();
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  const toggleProject = async (project: Project) => {
    setActionLoading(project.id);
    try {
      if (project.is_active) {
        await stopProject(project.id);
      } else {
        await startProject(project.id);
      }
      fetchProjects();
    } catch (error) {
      console.error("Failed to toggle project:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // Preflight 检查结果
  const [preflightResult, setPreflightResult] = useState<{
    show: boolean;
    project?: Project;
    data?: {
      can_run: boolean;
      message: string;
      checks: Array<{
        name: string;
        label: string;
        status: "pass" | "fail" | "warn";
        message: string;
        blocking: boolean;
        action?: { label: string; url: string };
      }>;
    };
  }>({ show: false });

  const runProjectNow = async (project: Project) => {
    setActionLoading(project.id);

    try {
      // 先进行前置检查
      const preflight = await fetchProjectPreflight(project.id);

      if (!preflight.can_run) {
        // 有阻断项，显示检查结果
        setPreflightResult({
          show: true,
          project,
          data: preflight,
        });
        setActionLoading(null);
        return;
      }

      // 检查通过，执行任务
      setRunningProjects((prev) => new Set(prev).add(project.id));

      await runProjectImmediately(project.id);

      // 执行成功后，等待一段时间后刷新数据
      setTimeout(() => {
        setRunningProjects((prev) => {
          const next = new Set(prev);
          next.delete(project.id);
          return next;
        });
        fetchProjects();
      }, 5000);
    } catch (error) {
      console.error("Failed to run project:", error);
      setRunningProjects((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    } finally {
      setActionLoading(null);
    }
  };

  // 强制执行（跳过检查）
  const forceRunProject = async (project: Project) => {
    setPreflightResult({ show: false });
    setRunningProjects((prev) => new Set(prev).add(project.id));

    try {
      await runProjectImmediately(project.id);
      setTimeout(() => {
        setRunningProjects((prev) => {
          const next = new Set(prev);
          next.delete(project.id);
          return next;
        });
        fetchProjects();
      }, 5000);
    } catch (error) {
      console.error("Failed to run project:", error);
    }
  };

  const deleteProject = async (project: Project) => {
    if (!confirm(`确定要删除项目"${project.name}"吗？`)) return;

    try {
      await apiDeleteProject(project.id);
      fetchProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  const formatSchedule = (type: string, value: string) => {
    if (type === "interval") {
      const seconds = parseInt(value);
      if (seconds < 60) return `每 ${seconds} 秒`;
      if (seconds < 3600) return `每 ${Math.round(seconds / 60)} 分钟`;
      if (seconds < 86400) return `每 ${Math.round(seconds / 3600)} 小时`;
      return `每 ${Math.round(seconds / 86400)} 天`;
    }
    return value;
  };

  const togglePlatform = (platform: string) => {
    setNewProject((prev) => {
      const platforms = prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FolderOpen className="w-7 h-7 text-indigo-500" />
            监控项目
          </h1>
          <p className="text-muted-foreground mt-1">
            统一管理关键词、调度和通知，一处配置，全自动运行
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchProjects}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{projects.length}</div>
            <div className="text-sm text-muted-foreground">总项目数</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">
              {projects.filter((p) => p.is_active).length}
            </div>
            <div className="text-sm text-muted-foreground">运行中</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-500">
              {projects.reduce((sum, p) => sum + (p.today_crawled || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">今日抓取</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-500">
              {projects.reduce((sum, p) => sum + (p.today_alerts || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">今日预警</div>
          </CardContent>
        </Card>
      </div>

      {/* Project List */}
      {loading ? (
        <Card className="bg-card/50">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无监控项目</p>
            <p className="text-sm mt-1">点击"新建项目"开始自动化监控</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="bg-card/50 hover:bg-card/70 transition-colors cursor-pointer"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <CardContent className="py-5">
                <div className="flex items-start justify-between">
                  {/* Left: Project Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          runningProjects.has(project.id)
                            ? "bg-blue-500 animate-ping"
                            : project.is_active
                              ? "bg-green-500 animate-pulse"
                              : "bg-gray-400"
                        }`}
                      />
                      <h3 className="font-semibold text-lg">{project.name}</h3>
                      {runningProjects.has(project.id) ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          执行中...
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${project.is_active ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500"}`}
                        >
                          {project.is_active ? "运行中" : "已停止"}
                        </span>
                      )}
                    </div>

                    {project.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {project.description}
                      </p>
                    )}

                    {/* Keywords */}
                    <div className="flex flex-col gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Search className="w-3.5 h-3.5 text-muted-foreground" />
                        {project.keywords.slice(0, 5).map((kw, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-500 rounded border border-indigo-500/20"
                          >
                            {kw}
                          </span>
                        ))}
                        {project.keywords.length > 5 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{project.keywords.length - 5}
                          </span>
                        )}
                      </div>
                      {project.sentiment_keywords &&
                        (project.sentiment_keywords as string[]).length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            {(project.sentiment_keywords as string[])
                              .slice(0, 5)
                              .map((kw, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20"
                                >
                                  {kw}
                                </span>
                              ))}
                            {(project.sentiment_keywords as string[]).length >
                              5 && (
                              <span className="text-[10px] text-muted-foreground">
                                +
                                {(project.sentiment_keywords as string[])
                                  .length - 5}
                              </span>
                            )}
                          </div>
                        )}
                    </div>

                    {/* Platforms & Schedule */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {Array.from(
                          new Set(
                            project.platforms.map(
                              (p) => PLATFORM_MAP[p]?.label || p,
                            ),
                          ),
                        ).map((label) => {
                          const key =
                            project.platforms.find(
                              (p) => (PLATFORM_MAP[p]?.label || p) === label,
                            ) || label;
                          return (
                            <span
                              key={label}
                              className={`text-xs px-2 py-0.5 rounded ${PLATFORM_MAP[key]?.color || "bg-gray-100"}`}
                            >
                              {PLATFORM_MAP[key]?.icon} {label}
                            </span>
                          );
                        })}
                      </div>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatSchedule(
                          project.schedule_type,
                          project.schedule_value,
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right: Stats & Actions */}
                  <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 text-sm text-right">
                      <div>
                        <div className="font-medium">
                          {project.total_crawled}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          累计抓取
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-orange-500">
                          {project.total_alerts}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          累计预警
                        </div>
                      </div>
                      <div>
                        <div className="text-xs">
                          上次: {formatDateTime(project.last_run_at)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs">
                          下次: {formatDateTime(project.next_run_at)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runProjectNow(project)}
                        disabled={actionLoading === project.id}
                      >
                        {actionLoading === project.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleProject(project)}
                        disabled={actionLoading === project.id}
                      >
                        {project.is_active ? (
                          <Pause className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <Play className="w-4 h-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProject(project)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-500" />
              新建监控项目
            </h2>

            <div className="space-y-5">
              {/* 项目名称 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  项目名称 *
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                  placeholder="如：品牌舆情监控"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              {/* 项目描述 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  项目描述
                </label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                  placeholder="可选的项目说明..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              {/* 任务目的 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  任务目的 *
                </label>
                <select
                  value={newProject.purpose}
                  onChange={(e) =>
                    setNewProject({ ...newProject, purpose: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {Object.entries(
                    ProjectPurposeLabels as Record<string, string>,
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  "找达人博主"数据入博主池，"找热点排行"数据入热点池，"舆情监控"触发预警
                </p>
              </div>

              {/* 关键词 - 带 AI 联想 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    监控关键词 *
                    <span className="text-muted-foreground font-normal ml-2">
                      多个关键词用逗号或空格分隔
                    </span>
                  </label>
                  <AIKeywordSuggest
                    onSelect={(keywords) => {
                      const current = newProject.keywords
                        ? newProject.keywords + ", "
                        : "";
                      setNewProject({
                        ...newProject,
                        keywords: current + keywords.join(", "),
                      });
                    }}
                  />
                </div>
                <textarea
                  value={newProject.keywords}
                  onChange={(e) =>
                    setNewProject({ ...newProject, keywords: e.target.value })
                  }
                  placeholder="品牌A, 竞品B, 行业热词..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none"
                />
              </div>

              {/* 舆情敏感词 - 带 AI 联想 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    舆情及预警敏感词{newProject.purpose === "sentiment" && " *"}
                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                      匹配后标记为预警，按重要程度排序
                    </span>
                  </label>
                  <AIKeywordSuggest
                    onSelect={(keywords) => {
                      const current = newProject.sentiment_keywords
                        ? newProject.sentiment_keywords + ", "
                        : "";
                      setNewProject({
                        ...newProject,
                        sentiment_keywords: current + keywords.join(", "),
                      });
                    }}
                  />
                </div>
                <textarea
                  value={newProject.sentiment_keywords}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      sentiment_keywords: e.target.value,
                    })
                  }
                  placeholder="价格太贵, 质量不好, 虚假宣传, 避雷..."
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none text-sm"
                />
              </div>

              {/* 平台选择 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  监控平台 *
                </label>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => {
                    const mapped = PLATFORM_MAP[p.value] || {
                      label: p.label,
                      icon: p.icon === "book-open" ? "📕" : p.icon,
                    };
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => togglePlatform(p.value)}
                        className={`px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                          newProject.platforms.includes(p.value)
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-background border-border hover:border-primary/50"
                        }`}
                      >
                        <span>{mapped.icon}</span> {mapped.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 调度配置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    调度方式
                  </label>
                  <select
                    value={newProject.schedule_type}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        schedule_type: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                  >
                    <option value="interval">固定间隔</option>
                    <option value="cron">Cron 表达式</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {newProject.schedule_type === "interval"
                      ? "执行频率"
                      : "Cron 表达式"}
                  </label>
                  {newProject.schedule_type === "interval" ? (
                    <select
                      value={newProject.schedule_value}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          schedule_value: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    >
                      <option value="1800">每 30 分钟</option>
                      <option value="3600">每 1 小时</option>
                      <option value="7200">每 2 小时</option>
                      <option value="21600">每 6 小时</option>
                      <option value="43200">每 12 小时</option>
                      <option value="86400">每天</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newProject.schedule_value}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          schedule_value: e.target.value,
                        })
                      }
                      placeholder="0 9 * * *"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* 抓取配置 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    抓取模式
                  </label>
                  <select
                    value={newProject.crawler_type}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        crawler_type: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                  >
                    <option value="search">关键词搜索</option>
                    <option value="detail">指定内容详情</option>
                    <option value="creator">指定博主主页</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    爬虫时间范围
                  </label>
                  <select
                    value={newProject.crawl_date_range}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        crawl_date_range: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                  >
                    <option value="1">最近 1 天</option>
                    <option value="3">最近 3 天</option>
                    <option value="7">最近 7 天</option>
                    <option value="30">最近 30 天</option>
                    <option value="90">最近 3 个月</option>
                    <option value="0">不限时间</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    每次抓取数量
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newProject.crawl_limit}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        crawl_limit: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="new_dedup"
                  checked={newProject.deduplicate_authors || false}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      deduplicate_authors: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label
                  htmlFor="new_dedup"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  开启博主去重 (只保留最新内容)
                </label>
              </div>

              {/* 高级过滤 - 折叠面板 */}
              <details className="border border-border rounded-lg">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-muted/50 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  高级过滤（可选）
                </summary>
                <div className="p-4 border-t border-border space-y-4">
                  <p className="text-xs text-muted-foreground">
                    设置过滤条件，只抓取符合条件的内容（0 = 不限制）
                  </p>

                  {/* 点赞数范围 */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      点赞数范围
                    </label>
                    <div className="flex items-center gap-2">
                      <CleanNumberInput
                        value={newProject.min_likes}
                        onChange={(val) =>
                          setNewProject({ ...newProject, min_likes: val })
                        }
                        placeholder="不限"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                      <span className="text-muted-foreground">—</span>
                      <CleanNumberInput
                        value={newProject.max_likes}
                        onChange={(val) =>
                          setNewProject({ ...newProject, max_likes: val })
                        }
                        placeholder="不限"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  {/* 评论数范围 */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      评论数范围
                    </label>
                    <div className="flex items-center gap-2">
                      <CleanNumberInput
                        value={newProject.min_comments}
                        onChange={(val) =>
                          setNewProject({ ...newProject, min_comments: val })
                        }
                        placeholder="不限"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                      <span className="text-muted-foreground">—</span>
                      <CleanNumberInput
                        value={newProject.max_comments}
                        onChange={(val) =>
                          setNewProject({ ...newProject, max_comments: val })
                        }
                        placeholder="不限"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  {/* 分享/收藏范围 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        分享数范围
                      </label>
                      <div className="flex items-center gap-1">
                        <CleanNumberInput
                          value={newProject.min_shares}
                          onChange={(val) =>
                            setNewProject({ ...newProject, min_shares: val })
                          }
                          placeholder="不限"
                          className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                        <span className="text-muted-foreground text-xs">—</span>
                        <CleanNumberInput
                          value={newProject.max_shares}
                          onChange={(val) =>
                            setNewProject({ ...newProject, max_shares: val })
                          }
                          placeholder="不限"
                          className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        收藏数范围
                      </label>
                      <div className="flex items-center gap-1">
                        <CleanNumberInput
                          value={newProject.min_favorites}
                          onChange={(val) =>
                            setNewProject({ ...newProject, min_favorites: val })
                          }
                          placeholder="不限"
                          className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                        <span className="text-muted-foreground text-xs">—</span>
                        <CleanNumberInput
                          value={newProject.max_favorites}
                          onChange={(val) =>
                            setNewProject({ ...newProject, max_favorites: val })
                          }
                          placeholder="不限"
                          className="w-full px-2 py-2 bg-background border border-border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 粉丝数范围 */}
                  <div>
                    <label className="text-sm font-medium mb-2 block text-violet-500">
                      博主粉丝数范围
                    </label>
                    <div className="flex items-center gap-2">
                      <CleanNumberInput
                        value={newProject.min_fans || 0}
                        onChange={(val) =>
                          setNewProject({ ...newProject, min_fans: val })
                        }
                        placeholder="最少粉丝"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                      <span className="text-muted-foreground">—</span>
                      <CleanNumberInput
                        value={newProject.max_fans || 0}
                        onChange={(val) =>
                          setNewProject({ ...newProject, max_fans: val })
                        }
                        placeholder="最多粉丝 (0 不限)"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="requireContact"
                      checked={newProject.require_contact === true}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          require_contact: e.target.checked,
                        })
                      }
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label
                      htmlFor="requireContact"
                      className="text-sm cursor-pointer font-medium text-violet-500"
                    >
                      必须包含联系方式 (微信/手机/邮箱)
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="enableComments"
                      checked={newProject.enable_comments !== false}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          enable_comments: e.target.checked,
                        })
                      }
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="enableComments"
                      className="text-sm cursor-pointer"
                    >
                      同时抓取评论内容
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="usePlugin"
                      checked={newProject.use_plugin === true}
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          use_plugin: e.target.checked,
                        })
                      }
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label
                      htmlFor="usePlugin"
                      className="text-sm cursor-pointer font-bold text-indigo-600 flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      优先使用浏览器插件采集数据 (更彻底，不易被封)
                    </label>
                  </div>
                </div>
              </details>

              {/* 预警配置 */}
              <div className="border rounded-lg p-4 bg-accent/20">
                <label className="text-sm font-medium mb-3 block">
                  消息推送渠道
                </label>
                <div className="max-w-xl">
                  <MultiSelect
                    options={notificationChannels.map((channel) => ({
                      label: channel.name,
                      value: channel.id,
                      icon:
                        channel.channel_type === "wechat_work"
                          ? "🤖"
                          : channel.channel_type === "email"
                            ? "📧"
                            : channel.channel_type === "webhook"
                              ? "⚡"
                              : "📢",
                    }))}
                    value={newProject.alert_channels}
                    onChange={(val) =>
                      setNewProject({ ...newProject, alert_channels: val })
                    }
                    placeholder="选择推送渠道..."
                  />
                  {newProject.alert_channels.length === 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      暂无选中渠道，请下拉选择
                      {notificationChannels.length === 0 && (
                        <a
                          href="/notifications"
                          className="text-primary ml-2 hover:underline"
                        >
                          去配置
                        </a>
                      )}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground mt-3">
                    系统将根据项目目的（舆情/热点/通用）自动筛选符合条件的内容推送到上述渠道。
                  </p>
                </div>
              </div>

              {/* 立即启动 */}
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <input
                  type="checkbox"
                  id="autoStart"
                  checked={newProject.auto_start}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      auto_start: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label htmlFor="autoStart" className="cursor-pointer">
                  创建后立即启动自动监控
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </Button>
              <Button
                onClick={createProject}
                disabled={
                  !newProject.name.trim() ||
                  !newProject.keywords.trim() ||
                  newProject.platforms.length === 0
                }
              >
                创建项目
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preflight Check Dialog */}
      {preflightResult.show && preflightResult.data && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              执行前检查
            </h2>

            <p className="text-sm text-muted-foreground mb-4">
              项目{" "}
              <span className="font-medium text-foreground">
                {preflightResult.project?.name}
              </span>{" "}
              有以下问题需要解决：
            </p>

            <div className="space-y-3 mb-6">
              {preflightResult.data.checks.map((check, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    check.status === "pass"
                      ? "bg-green-500/10"
                      : check.status === "fail"
                        ? "bg-red-500/10"
                        : "bg-yellow-500/10"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      check.status === "pass"
                        ? "bg-green-500 text-white"
                        : check.status === "fail"
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-white"
                    }`}
                  >
                    {check.status === "pass"
                      ? "✓"
                      : check.status === "fail"
                        ? "✗"
                        : "!"}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{check.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {check.message}
                    </div>
                    {check.action && (
                      <a
                        href={check.action.url}
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        {check.action.label} →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setPreflightResult({ show: false })}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={() =>
                  preflightResult.project &&
                  forceRunProject(preflightResult.project)
                }
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                仍然执行
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
