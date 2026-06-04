import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Download,
  Info,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  Layers,
  Heart,
  Layout,
  X,
  Music
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from "recharts";

import {
  fetchImageGenHealth,
  fetchImageGenTemplates,
  createImageGenTask,
  fetchImageGenTaskStatus,
  cancelImageGenTask,
  generatePostCopy,
  paraphrasePostCopy,
  extractPosterFromCover,
  pushToPublishQueue,
  fetchGrowHubAccounts,
  fetchAccountPublishProfile,
  fetchPublishedPosts,
  fetchImageGenPublishHistory,
  fetchImageGenPublishHistoryDetail,
  deletePublishTask,
  composeVideo,
  fetchAvailableBgms,
  extractAudio,
  getAudioExtractionStatus,
  type ImageGenTemplate,
  type GrowHubAccount,
  type PublishedPost
} from "@/api";
import { ImagePreview, ImageLightbox } from "@/components/ImageLightbox";
import { PostPublishPreview } from "@/components/PostPublishPreview";
import { OnImageCopyEditor } from "@/components/OnImageCopyEditor";
import { resolveImageSrc, resolveAudioSrc } from "@/utils/mediaUrl";
import {
  splitPublishCopy,
  DEFAULT_ON_IMAGE_ACCENT_COLOR,
  DEFAULT_ON_IMAGE_HIGHLIGHTS,
  getDefaultOnImagePayload,
  pruneHighlightWords,
  resolveOnImageHighlights,
} from "@/utils/postCopy";

const STYLE_OPTIONS = ["种草", "测评", "干货", "情感", "探店"];
const PLATFORMS = [
  { value: "dy", label: "抖音", icon: "🎵", color: "bg-slate-500/10 border-slate-500/30 text-slate-300 hover:bg-slate-500/20" },
  { value: "xhs", label: "小红书", icon: "📕", color: "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20" },
  { value: "wb", label: "微博", icon: "📱", color: "bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500/20" }
];

const formatPosterTopDate = (d = new Date()) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
};

const formatPosterBottomTime = (d = new Date()) => {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
};

const EN_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const parseErrorDetail = (e: any, fallback: string): string => {
  if (e.response?.data?.detail) {
    const detail = e.response.data.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((err: any) => {
        const locStr = err.loc ? err.loc.join(".") : "";
        return `${locStr}: ${err.msg}`;
      }).join("; ");
    }
  }
  return e.message || fallback;
};

const ImageGenPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const hotspotParam = searchParams.get("hotspot");

  // ─────────────────── 页面状态 ───────────────────
  // 文案生成表单
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("dy");
  const [style, setStyle] = useState("种草");
  const [brandKeywords, setBrandKeywords] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [hotspotTitle, setHotspotTitle] = useState("");
  const [hotspotContent, setHotspotContent] = useState("");

  // AI 属性建议与生成内容
  const [copyTitle, setCopyTitle] = useState("");
  const [copyBody, setCopyBody] = useState("");
  const [copyHashtags, setCopyHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState("");
  const [copyGenerating, setCopyGenerating] = useState(false);
  const [paraphrasing, setParaphrasing] = useState(false);

  // 生图参数
  const [imagePrompt, setImagePrompt] = useState("");
  /** 复刻模式：海报多行文案（换行分隔），来自帖子仿写 */
  const [imageOverlayText, setImageOverlayText] = useState(() =>
    getDefaultOnImagePayload().lines.join("\n")
  );
  const [imageOverlayHighlights, setImageOverlayHighlights] = useState<string[]>(
    () => getDefaultOnImagePayload().highlightWords
  );
  /** 画面文案使用帖子原文，不做仿写 */
  const [useExactOnImageCopy, setUseExactOnImageCopy] = useState(true);
  const [posterHideChrome, setPosterHideChrome] = useState(false);
  const [posterNickname, setPosterNickname] = useState("");
  const [posterNicknameSource, setPosterNicknameSource] = useState("");
  const [posterNicknameWarning, setPosterNicknameWarning] = useState("");
  const [posterTopDate, setPosterTopDate] = useState(() => formatPosterTopDate());
  const [posterBottomTime, setPosterBottomTime] = useState(() =>
    formatPosterBottomTime()
  );
  const [posterBottomDay, setPosterBottomDay] = useState(
    () => EN_WEEKDAYS[new Date().getDay()]
  );
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [maxRounds, setMaxRounds] = useState(2);
  const [imagesPerRound, setImagesPerRound] = useState(1);
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [generationMode, setGenerationMode] = useState<"replicate" | "creative">("replicate");

  // PicTacticAgent 在线状态
  const [isAgentOnline, setIsAgentOnline] = useState<boolean | null>(null);
  const [replicateReady, setReplicateReady] = useState<boolean | null>(null);
  const [replicateProvider, setReplicateProvider] = useState<string | null>(null);
  const [agentUrl, setAgentUrl] = useState("http://localhost:8019");
  const [checkingHealth, setCheckingHealth] = useState(false);

  // 模板库
  const [templates, setTemplates] = useState<ImageGenTemplate[]>([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // 历史发帖库
  const [showPublishedModal, setShowPublishedModal] = useState(false);
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([]);
  const [loadingPublished, setLoadingPublished] = useState(false);
  const [publishedPage, setPublishedPage] = useState(1);
  const [publishedTotal, setPublishedTotal] = useState(0);
  const [publishedSearch, setPublishedSearch] = useState("");
  const [publishedPageSize] = useState(12);

  // 同框底图状态
  const [templateImages, setTemplateImages] = useState<string[]>([]);

  // 图片生成任务
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [taskStatus, setTaskStatus] = useState<string>("");
  const [generatedImages, setGeneratedImages] = useState<Array<{
    image_url: string;
    score?: {
      aesthetic?: number;
      creativity?: number;
      relevance?: number;
      composition?: number;
      color?: number;
      overall?: number;
    };
  }>>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImagesList, setSelectedImagesList] = useState<string[]>([]); // 拟发布的多图
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const generatedImageUrls = generatedImages.map((g) => g.image_url);

  const openLightbox = (images: string[], index: number) => {
    if (!images.length) return;
    setLightbox({ images, index: Math.min(Math.max(0, index), images.length - 1) });
  };

  // 账号与分发
  const [accounts, setAccounts] = useState<GrowHubAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [publishPushing, setPublishPushing] = useState(false);
  const [showPublishPreview, setShowPublishPreview] = useState(false);

  // 视频合成工作台状态
  const [bgms, setBgms] = useState<Array<{ name: string; url: string }>>([]);
  const [selectedBgmForCompose, setSelectedBgmForCompose] = useState("");
  const [bgmExtracting, setBgmExtracting] = useState(false);
  const [composedVideoUrl, setComposedVideoUrl] = useState("");
  const [composingVideo, setComposingVideo] = useState(false);
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [loadingBgms, setLoadingBgms] = useState(false);
  const [publishTime, setPublishTime] = useState("");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // ─────────────────── 初始化与健康检测 ───────────────────
  
  const checkAgentHealth = useCallback(async (showNotification = false) => {
    setCheckingHealth(true);
    try {
      const data = await fetchImageGenHealth();
      setIsAgentOnline(data.pictactic_online);
      setReplicateReady((data as { replicate_ready?: boolean }).replicate_ready ?? null);
      setReplicateProvider((data as { replicate_provider?: string }).replicate_provider ?? null);
      setAgentUrl(data.pictactic_url);
      if (showNotification) {
        if (data.pictactic_online) {
          toast.success("生图引擎 PicTacticAgent 连接成功！");
        } else {
          toast.error("生图引擎 PicTacticAgent 未启动，请检查后台进程");
        }
      }
    } catch (e) {
      setIsAgentOnline(false);
      if (showNotification) {
        toast.error("健康检测接口请求失败");
      }
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await fetchGrowHubAccounts(platform);
      setAccounts(data.items || []);
      if (data.items && data.items.length > 0) {
        setSelectedAccountId(data.items[0].id);
      } else {
        setSelectedAccountId("");
      }
    } catch (e) {
      console.error("加载账号池失败", e);
    }
  }, [platform]);

  const loadBgms = useCallback(async (preferUrl?: string) => {
    setLoadingBgms(true);
    try {
      const res = await fetchAvailableBgms();
      if (res.success && res.data) {
        setBgms(res.data);
        if (preferUrl) {
          setSelectedBgmForCompose(preferUrl);
        } else if (res.data.length > 0 && !selectedBgmForCompose) {
          setSelectedBgmForCompose(res.data[0].url);
        }
      }
    } catch (e) {
      console.error("加载 BGM 失败:", e);
    } finally {
      setLoadingBgms(false);
    }
  }, [selectedBgmForCompose]);

  useEffect(() => {
    checkAgentHealth();
  }, [checkAgentHealth]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadBgms();
  }, [loadBgms]);

  useEffect(() => {
    setIsPlayingBgm(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [selectedBgmForCompose]);

  const loadPosterNickname = useCallback(async () => {
    if (!selectedAccountId || posterHideChrome) {
      setPosterNickname("");
      setPosterNicknameSource("");
      setPosterNicknameWarning("");
      return;
    }
    try {
      const res = await fetchAccountPublishProfile(selectedAccountId, platform);
      if (res?.success && res.data) {
        setPosterNickname(res.data.nickname_display || "");
        setPosterNicknameSource(res.data.source || "");
        setPosterNicknameWarning(res.data.warning || "");
      }
    } catch {
      setPosterNicknameWarning("获取抖音昵称失败，请同步 CookieBridge 后重试");
    }
  }, [selectedAccountId, platform, posterHideChrome]);

  useEffect(() => {
    loadPosterNickname();
  }, [loadPosterNickname]);

  // 解析从热点页跳转时带的 hotspot 参数
  useEffect(() => {
    if (hotspotParam) {
      try {
        const decoded = decodeURIComponent(hotspotParam);
        const parsed = JSON.parse(decoded);
        setTopic(parsed.title || "");
        setHotspotTitle(parsed.title || "");
        setHotspotContent(parsed.tags ? `#${parsed.tags.join(" #")}` : "热点素材");
        
        // 映射热点平台
        if (parsed.platform === "xhs" || parsed.platform === "dy" || parsed.platform === "wb") {
          setPlatform(parsed.platform);
        }
        
        setTaskTitle(`图文发布_${parsed.title ? parsed.title.slice(0, 10) : "未命名"}`);
        toast.success("已成功从热点库导入主题");
      } catch (e) {
        console.error("解析热点 URL 参数失败", e);
      }
    }
  }, [hotspotParam]);

  // 模板加载
  const openTemplates = async () => {
    setShowTemplatesModal(true);
    setLoadingTemplates(true);
    try {
      const res = await fetchImageGenTemplates(1, 30);
      if (res.success && res.data && res.data.items) {
        setTemplates(res.data.items);
      }
    } catch (e) {
      toast.error("模板库加载失败，请确认 PicTacticAgent 已正常开启");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectTemplate = (tpl: ImageGenTemplate) => {
    setGenerationMode("replicate");
    setEnhancePrompt(false);
    setMaxRounds(1);
    if (tpl.cover_url) {
      setTemplateImages([tpl.cover_url]);
    } else {
      setTemplateImages([]);
      toast.warning("该模板无预览图，无法复刻，请换一个有封面的模板");
    }
    setImagePrompt("");
    setImageOverlayText("");
    setImageOverlayHighlights([]);
    setShowTemplatesModal(false);
    toast.success(`已载入模版「${tpl.name}」：将按封面 1:1 复刻（发布标题/标签请填右侧）`);
  };

  // 历史发帖模板加载与套用
  const loadPublishedPosts = useCallback(async (page: number, search: string) => {
    setLoadingPublished(true);
    try {
      const res = await fetchPublishedPosts(page, publishedPageSize, search.trim() || undefined);
      if (res?.success && res.data) {
        setPublishedPosts(res.data.items || []);
        setPublishedTotal(res.data.total || 0);
        setPublishedPage(res.data.page || page);
      } else {
        setPublishedPosts([]);
        setPublishedTotal(0);
        toast.error("加载历史发帖库失败，请重新登录后重试");
      }
    } catch (e) {
      setPublishedPosts([]);
      setPublishedTotal(0);
      toast.error(parseErrorDetail(e, "加载历史发帖库失败"));
    } finally {
      setLoadingPublished(false);
    }
  }, [publishedPageSize]);

  const openPublishedPosts = () => {
    setShowPublishedModal(true);
    setPublishedPage(1);
    loadPublishedPosts(1, publishedSearch);
  };

  const applyStandardOnImageCopy = () => {
    const { lines, highlightWords } = getDefaultOnImagePayload();
    setImageOverlayText(lines.map((l) => l.trim()).filter(Boolean).join("\n"));
    setImageOverlayHighlights([...highlightWords]);
    setImagePrompt("");
  };

  /** 旧版硬切换行会把「频率的声音」拆断，进入页时自动修正 */
  useEffect(() => {
    if (/这个频\n|率的声音\n/.test(imageOverlayText)) {
      const { lines, highlightWords } = getDefaultOnImagePayload();
      setImageOverlayText(lines.join("\n"));
      setImageOverlayHighlights([...highlightWords]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅迁移旧本地换行
  }, []);

  /** 从帖子 title/description 自动填入发布标题、正文、标签（第1句/第2句/#） */
  const fillPublishFromPost = (
    rawTitle: string,
    rawDescription: string,
    extraTags?: string[]
  ) => {
    const split = splitPublishCopy(rawTitle, rawDescription);
    setCopyTitle(split.publishTitle || "未命名");
    setCopyBody(split.publishBody);
    setCopyHashtags(
      extraTags?.length
        ? [...new Set([...split.hashtags, ...extraTags])]
        : split.hashtags
    );
    if (useExactOnImageCopy) {
      applyStandardOnImageCopy();
    }
    return split;
  };

  const applyOnImagePayload = (data: {
    on_image_text?: string;
    on_image_lines?: string[];
    on_image_headline?: string;
    highlight_words?: string[];
  }) => {
    const overlay =
      data.on_image_text ||
      (data.on_image_lines?.length ? data.on_image_lines.join("\n") : "") ||
      data.on_image_headline ||
      "";
    setImageOverlayText(overlay);
    setImageOverlayHighlights(
      pruneHighlightWords(
        [...DEFAULT_ON_IMAGE_HIGHLIGHTS, ...(data.highlight_words || [])],
        overlay,
        [...DEFAULT_ON_IMAGE_HIGHLIGHTS]
      )
    );
    setImagePrompt("");
  };

  const runParaphrase = async (
    source: { title?: string; body?: string; hashtags?: string[] },
    opts?: { silent?: boolean; coverUrl?: string; onlyPublish?: boolean }
  ) => {
    if (useExactOnImageCopy && !opts?.onlyPublish) {
      const split = fillPublishFromPost(
        source.title || "",
        source.body || "",
        source.hashtags
      );
      if (!opts?.silent) {
        toast.success("已填入标准画面文案（发布标题/正文仍来自帖子）");
      }
      return true;
    }

    setParaphrasing(true);
    const skipOnImageUpdate = useExactOnImageCopy && opts?.onlyPublish;
    try {
      const res = await paraphrasePostCopy({
        source_title: source.title,
        source_body: source.body,
        source_hashtags: source.hashtags,
        platform,
        brand_keywords: brandKeywords
          ? brandKeywords.split(/[,，\s]+/).filter(Boolean)
          : undefined,
        reference_cover_url: opts?.coverUrl || templateImages[0] || undefined,
        preserve_original_on_image: useExactOnImageCopy,
      });
      if (res?.success && res.data) {
        const origTags = source.hashtags?.length ? source.hashtags : [];
        const apiTags = res.data.hashtags || [];
        fillPublishFromPost(
          res.data.title || "",
          res.data.body || "",
          [...new Set([...origTags, ...apiTags])]
        );
        if (!skipOnImageUpdate) {
          applyOnImagePayload(res.data);
        }
        if (!opts?.silent) {
          toast.success(
            res.data.paraphrase_notes
              ? `仿写完成：${res.data.paraphrase_notes}`
              : "仿写完成：发布文案与画面主文案已分离"
          );
        }
        return true;
      }
      if (!opts?.silent) toast.error("仿写失败，请稍后重试");
      return false;
    } catch (e) {
      if (!opts?.silent) toast.error(parseErrorDetail(e, "仿写失败"));
      return false;
    } finally {
      setParaphrasing(false);
    }
  };

  /** 套用发帖模版时自动提取/选中该帖 BGM */
  const autoExtractBgmFromPost = useCallback(
    async (post: PublishedPost) => {
      if (post.bgm_url && post.audio_status === "success") {
        await loadBgms(post.bgm_url);
        toast.success("已自动选中该帖背景音乐");
        return;
      }
      if (!post.video_url) {
        toast.message("该帖无视频链接，无法提取背景音乐", {
          description: "可在下方手动选择预置 BGM",
        });
        return;
      }
      if (bgmExtracting) return;
      setBgmExtracting(true);
      const toastId = toast.loading("正在从模版视频提取背景音乐（约 1–3 分钟）…");
      try {
        const start = await extractAudio("content", post.id, { bgm_only: true });
        let bgmUrl: string | null =
          start.status === "success" && start.bgm_url ? start.bgm_url : null;
        if (!bgmUrl) {
          const deadline = Date.now() + 10 * 60 * 1000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000));
            const st = await getAudioExtractionStatus(start.extraction_id);
            if (st.status === "success" && st.bgm_url) {
              bgmUrl = st.bgm_url;
              break;
            }
            if (st.status === "failed") {
              throw new Error(st.error_msg || "背景音乐提取失败");
            }
          }
        }
        if (!bgmUrl) {
          throw new Error("提取超时，请稍后在 BGM 列表中查看");
        }
        await loadBgms(bgmUrl);
        toast.success("已从模版视频提取并选中背景音乐", { id: toastId });
      } catch (e: unknown) {
        toast.error(parseErrorDetail(e, "背景音乐提取失败"), { id: toastId });
      } finally {
        setBgmExtracting(false);
      }
    },
    [bgmExtracting, loadBgms]
  );

  const handleApplyPublishedPost = async (post: PublishedPost) => {
    let taskTitleBase = "";
    if (post.publish_title != null || post.publish_body != null) {
      setCopyTitle(post.publish_title || "未命名");
      setCopyBody(post.publish_body || "");
      setCopyHashtags(post.hashtags || []);
      taskTitleBase = post.publish_title || "";
      if (useExactOnImageCopy) {
        applyStandardOnImageCopy();
      }
    } else {
      const split = fillPublishFromPost(
        post.title || "",
        post.description || post.title || ""
      );
      taskTitleBase = split.publishTitle;
    }

    setGenerationMode("replicate");
    setEnhancePrompt(false);
    setMaxRounds(1);
    setTemplateImages(post.cover_url ? [post.cover_url] : []);
    setImagePrompt("");
    setTaskTitle(
      `图文发布_${taskTitleBase ? taskTitleBase.slice(0, 10) : "已套用"}`
    );
    setShowPublishedModal(false);
    toast.success("已套用帖子发布文案；画面使用标准主文案与高亮词");
    if (!post.cover_url) {
      toast.warning("该帖无封面图，请手动上传参考图后再复刻");
    }
    void autoExtractBgmFromPost(post);
  };

  // ─────────────────── 📂 监听 URL 携带的历史记录并套用 ───────────────────
  const applyHistoryParam = searchParams.get("apply_history");

  useEffect(() => {
    if (applyHistoryParam) {
      const taskId = parseInt(applyHistoryParam, 10);
      if (!isNaN(taskId)) {
        toast.promise(
          (async () => {
            const res = await fetchImageGenPublishHistoryDetail(taskId);
            if (res.success && res.data) {
              const item = res.data;
              
              // 1. 还原平台和发帖账号
              setPlatform(item.platform || "dy");
              if (item.account_id) {
                setSelectedAccountId(item.account_id);
              }
              setTaskTitle(item.task_title || "");

              // 2. 提取并分离文案
              let bodyText = item.content_body || "";
              let titleVal = item.task_title || "";
              if (bodyText.startsWith("【标题】")) {
                const parts = bodyText.split("\n\n");
                if (parts.length > 1) {
                  titleVal = parts[0].replace("【标题】", "").trim();
                  bodyText = parts.slice(1).join("\n\n").trim();
                }
              }

              // 3. 填充文案与分离话题标签
              fillPublishFromPost(titleVal, bodyText);

              // 4. 重载图片到生图画廊并全选
              if (item.image_urls && item.image_urls.length > 0) {
                const generated = item.image_urls.map((url: string) => ({
                  image_url: url,
                  score: {
                    overall: 0.85
                  }
                }));
                setGeneratedImages(generated);
                setSelectedImage(item.image_urls[0]);
                setSelectedImagesList(item.image_urls);
              } else {
                setGeneratedImages([]);
                setSelectedImage(null);
                setSelectedImagesList([]);
              }

              // 5. 清空 URL 参数，防止用户刷新时重复载入
              const newParams = new URLSearchParams(searchParams);
              newParams.delete("apply_history");
              setSearchParams(newParams);
            } else {
              throw new Error("后端未返回有效的历史记录数据");
            }
          })(),
          {
            loading: "正在从发布队列加载历史图文详情...",
            success: "历史图文及配图已成功套用至当前工作台！",
            error: (err) => `载入历史失败: ${err.message || err}`
          }
        );
      }
    }
  }, [applyHistoryParam, setSearchParams]);

  // ─────────────────── AI 文案生成 ───────────────────
  const handleGenerateCopy = async () => {
    if (!topic.trim()) {
      toast.warning("请输入文案主题或热点话题");
      return;
    }

    setCopyGenerating(true);
    try {
      const res = await generatePostCopy({
        topic,
        platform,
        style,
        hotspot_title: hotspotTitle || undefined,
        hotspot_content: hotspotContent || undefined,
        brand_keywords: brandKeywords ? brandKeywords.split(/[,，\s]+/).filter(Boolean) : undefined,
        extra_instructions: extraInstructions || undefined
      });

      if (res.success && res.data) {
        const {
          title,
          body,
          hashtags,
          image_prompt_suggestion,
          on_image_text,
          on_image_lines,
          on_image_headline,
          highlight_words,
        } = res.data;
        fillPublishFromPost(title || "", body || "", hashtags);
        if (generationMode === "replicate" && !useExactOnImageCopy) {
          const overlay =
            on_image_text ||
            (on_image_lines?.length ? on_image_lines.join("\n") : "") ||
            on_image_headline ||
            "";
          if (overlay) setImageOverlayText(overlay);
          if (highlight_words?.length) setImageOverlayHighlights(highlight_words);
        } else if (image_prompt_suggestion && !imagePrompt) {
          setImagePrompt(image_prompt_suggestion);
        }
        toast.success("AI 文案生成成功！");
      } else {
        toast.error("文案生成异常，请检查 LLM 服务配置");
      }
    } catch (e: any) {
      toast.error(parseErrorDetail(e, "文案生成失败"));
    } finally {
      setCopyGenerating(false);
    }
  };

  // ─────────────────── AI 配图生成与轮询 ───────────────────
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const startImageGeneration = async () => {
    const isReplicate = generationMode === "replicate";
    if (isReplicate && replicateReady === false) {
      toast.error("版式复刻不可用：请先在 PicTacticAgent/.env 配置 Gemini 或 JiekouAI 图生图，MiniMax 无法复刻海报模版");
      return;
    }
    if (isReplicate && templateImages.length === 0) {
      toast.warning("模版复刻需要参考图：请选择带封面的精选模板，或从历史发帖载入封面");
      return;
    }
    if (!isReplicate && !imagePrompt.trim()) {
      toast.warning("创意模式下请输入配图描述 Prompt");
      return;
    }

    if (!isAgentOnline) {
      toast.error("生图引擎处于离线状态，无法生图，请先按照引导开启服务");
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setCurrentRound(0);
    setTaskStatus("pending");
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      const res = await createImageGenTask({
        prompt: isReplicate ? "" : imagePrompt,
        on_image_text: isReplicate ? imageOverlayText.trim() : undefined,
        on_image_highlights: isReplicate ? imageOverlayHighlights : undefined,
        max_rounds: isReplicate ? 1 : maxRounds,
        images_per_round: imagesPerRound,
        aspect_ratio: aspectRatio,
        enhance_prompt: isReplicate ? false : enhancePrompt,
        template_images: templateImages,
        replicate_mode: isReplicate,
        poster_hide_chrome: isReplicate ? posterHideChrome : undefined,
        poster_account_id:
          isReplicate && !posterHideChrome && selectedAccountId
            ? selectedAccountId
            : undefined,
        poster_nickname: isReplicate && !posterHideChrome ? posterNickname : undefined,
        on_image_accent_color: isReplicate ? DEFAULT_ON_IMAGE_ACCENT_COLOR : undefined,
        poster_top_date: isReplicate && !posterHideChrome ? posterTopDate : undefined,
        poster_bottom_time: isReplicate && !posterHideChrome ? posterBottomTime : undefined,
        poster_bottom_day: isReplicate && !posterHideChrome ? posterBottomDay : undefined,
      });

      if (res.success && res.data?.task_id) {
        const tid = res.data.task_id;
        setTaskId(tid);
        
        // 开启进度轮询
        pollImageTask(tid);
      } else {
        throw new Error("接口返回的任务ID无效");
      }
    } catch (e: any) {
      toast.error(parseErrorDetail(e, "创建生图任务失败"));
      setIsGenerating(false);
    }
  };

  const pollImageTask = (tid: string) => {
    let checkCount = 0;
    
    pollInterval = setInterval(async () => {
      checkCount++;
      try {
        const res = await fetchImageGenTaskStatus(tid);
        if (res.success && res.data) {
          const task = res.data;
          setTaskStatus(task.status);
          setProgress(task.progress || Math.min(95, checkCount * 2));
          setCurrentRound(task.current_round || 0);
          setMaxRounds(task.total_rounds || maxRounds);

          if (task.results && task.results.length > 0) {
            setGeneratedImages(task.results);
            if (!selectedImage && task.results.length > 0) {
              setSelectedImage(task.results[0].image_url);
            }
          }

          if (task.status === "success" || task.status === "completed") {
            toast.success("配图生成及多轮微调已全部完成！");
            clearInterval(pollInterval!);
            setIsGenerating(false);
            setProgress(100);
          } else if (task.status === "failed") {
            const failMsg =
              task.error_message ||
              task.error ||
              (task.message && task.message !== "Generation failed" ? task.message : "") ||
              "生图失败：请确认 PicTacticAgent 已启动且 MiniMax API 已配置";
            toast.error(`生图任务失败: ${failMsg}`);
            clearInterval(pollInterval!);
            setIsGenerating(false);
          } else if (task.status === "cancelled") {
            toast.warning("生图任务已取消");
            clearInterval(pollInterval!);
            setIsGenerating(false);
          }
        }
      } catch (e) {
        console.error("轮询错误:", e);
      }
    }, 3000);
  };

  const handleCancelTask = async () => {
    if (!taskId) return;
    try {
      await cancelImageGenTask(taskId);
      toast.info("正在发送取消请求...");
    } catch (e) {
      toast.error("取消任务失败");
    }
  };

  // 组件卸载时清除轮询
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  // ─────────────────── 标签与图片选择 ───────────────────
  const addHashtag = () => {
    if (newHashtag.trim() && !copyHashtags.includes(newHashtag.trim())) {
      setCopyHashtags([...copyHashtags, newHashtag.trim()]);
      setNewHashtag("");
    }
  };

  const removeHashtag = (tag: string) => {
    setCopyHashtags(copyHashtags.filter(t => t !== tag));
  };

  const toggleImageSelection = (url: string) => {
    if (selectedImagesList.includes(url)) {
      setSelectedImagesList(selectedImagesList.filter(u => u !== url));
    } else {
      setSelectedImagesList([...selectedImagesList, url]);
    }
  };

  const togglePlayBgm = () => {
    if (!audioRef.current || !selectedBgmForCompose) return;
    if (isPlayingBgm) {
      audioRef.current.pause();
      setIsPlayingBgm(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingBgm(true);
      }).catch(e => {
        console.error("播放音频失败:", e);
        toast.error("音频试听失败，请检查文件格式");
      });
    }
  };

  const handleComposeVideo = async () => {
    if (selectedImagesList.length === 0) {
      toast.warning("请在生图画廊中至少勾选一张图片用于合成视频");
      return;
    }
    if (!selectedBgmForCompose) {
      toast.warning("请选择一个背景音作为视频音轨");
      return;
    }
    
    setComposingVideo(true);
    toast.info("已开始进行图片与背景音乐合成，请稍候...");
    try {
      const res = await composeVideo({
        image_urls: selectedImagesList,
        bgm_url: selectedBgmForCompose,
      });
      if (res.success && res.video_url) {
        toast.success("🎉 视频合成成功！您可在下方直接试听预览");
        setComposedVideoUrl(res.video_url);
      } else {
        toast.error("视频合成失败");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.response?.data?.detail || e.message || "视频合成服务异常");
    } finally {
      setComposingVideo(false);
    }
  };

  const handleSubmitPublish = async () => {
    if (!copyTitle.trim() || !copyBody.trim()) {
      toast.warning("请确认帖子文案的标题与正文不为空");
      return;
    }
    if (selectedImagesList.length === 0) {
      toast.warning("请在生图画廊中至少勾选一张图片作为帖子配图");
      return;
    }

    setPublishPushing(true);
    try {
      // 格式化时间
      let formattedTime = undefined;
      if (publishTime) {
        const dt = new Date(publishTime);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        const h = String(dt.getHours()).padStart(2, "0");
        const min = String(dt.getMinutes()).padStart(2, "0");
        const s = String(dt.getSeconds()).padStart(2, "0");
        formattedTime = `${y}-${m}-${d} ${h}:${min}:${s}`;
      }

      // 推送发布任务
      const res = await pushToPublishQueue({
        task_title: taskTitle.trim() || `图文发布_${new Date().toLocaleDateString()}`,
        copy_title: copyTitle,
        copy_body: copyBody,
        copy_hashtags: copyHashtags,
        image_urls: selectedImagesList,
        account_id: selectedAccountId || undefined,
        platform,
        publish_time: formattedTime || undefined,
        video_url: composedVideoUrl || undefined,
      });

      if (res.success) {
        toast.success(res.message || "发布任务推入分发中枢成功！");
        setSelectedImagesList([]);
        setComposedVideoUrl(""); // 提交后清空视频合成缓存
      } else {
        toast.error("推送到发布队列失败");
      }
    } catch (e: unknown) {
      toast.error(parseErrorDetail(e, "推送失败"));
    } finally {
      setPublishPushing(false);
    }
  };

  const selectedAccountLabel =
    accounts.find((a) => a.id === selectedAccountId)?.account_name || "自动轮询分配";

  const syncFromCover = async () => {
    const cover = templateImages[0];
    if (!cover) {
      toast.warning("请先载入带封面的历史帖或模版");
      return;
    }
    if (useExactOnImageCopy) {
      applyStandardOnImageCopy();
      toast.success("已恢复标准画面文案与高亮词");
      return;
    }
    if (copyTitle.trim() || copyBody.trim()) {
      await runParaphrase(
        { title: copyTitle, body: copyBody, hashtags: copyHashtags },
        { coverUrl: cover }
      );
      return;
    }
    setParaphrasing(true);
    try {
      const res = await extractPosterFromCover(cover);
      if (res?.success && res.data) {
        applyOnImagePayload(res.data);
        toast.success("已从参考封面 OCR 同步画面文案与高亮词");
      }
    } catch (e) {
      toast.error(parseErrorDetail(e, "参考图识别失败"));
    } finally {
      setParaphrasing(false);
    }
  };

  // ─────────────────── 雷达评分绘图数据 ───────────────────
  const currentImgData = generatedImages.find(img => img.image_url === selectedImage);
  const rawScore = currentImgData?.score;
  
  const formatScore = (val?: number) => {
    if (val === undefined) return 0;
    return val > 10 ? val : val * 10;
  };

  const radarData = rawScore ? [
    { subject: "艺术感", A: formatScore(rawScore.aesthetic), fullMark: 100 },
    { subject: "创意性", A: formatScore(rawScore.creativity), fullMark: 100 },
    { subject: "相关度", A: formatScore(rawScore.relevance), fullMark: 100 },
    { subject: "构图", A: formatScore(rawScore.composition), fullMark: 100 },
    { subject: "色彩", A: formatScore(rawScore.color), fullMark: 100 },
    { subject: "综合", A: formatScore(rawScore.overall), fullMark: 100 }
  ] : [];

  return (
    <div className="h-full flex flex-col space-y-5">
      {/* 头部状态条 */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <ImageIcon className="w-5 h-5 text-purple-500 animate-pulse" />
            图文内容创作工作台
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            基于爆款选题，快速生成适配的平台文案，并调用 PicTacticAgent 实现图片的 AI 多轮迭代与智能评分，一键推向矩阵分发。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            isAgentOnline === null 
              ? "bg-slate-500/10 border-slate-500/30 text-slate-400"
              : isAgentOnline 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                : "bg-amber-500/10 border-amber-500/20 text-amber-500"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isAgentOnline === null ? "bg-slate-400" : isAgentOnline ? "bg-emerald-500" : "bg-amber-500 animate-ping"
            }`} />
            <span>
              生图服务: {isAgentOnline === null ? "检测中..." : isAgentOnline ? "在线" : "未启动"}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => checkAgentHealth(true)} 
            disabled={checkingHealth}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 工作区三栏 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-y-auto pb-4">
        
        {/* 左栏：输入与配置 (Column: 4) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm border-border bg-card/60 backdrop-blur-md">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  1. 选题及文案生成
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={openPublishedPosts} 
                  className="h-7 text-xs px-2 text-indigo-500 hover:text-indigo-600 border-indigo-500/20 hover:border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10"
                >
                  📂 历史发帖模板
                </Button>
              </CardTitle>
              <CardDescription className="text-[11px]">
                输入想要做的话题，或一键套用已发布爆款发帖模版（历史发帖库）。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              
              {/* 主题 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>文案主题 / 爆款话题 *</span>
                  {hotspotTitle && <span className="text-[10px] text-amber-500 font-normal">已从热点自动预填</span>}
                </label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例如: 夏日清爽穿搭推荐，防晒避坑指南..."
                  className="bg-background/80"
                />
              </div>

              {/* 目标平台 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">分发目标平台</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((plat) => (
                    <button
                      key={plat.value}
                      onClick={() => setPlatform(plat.value)}
                      className={`flex flex-col items-center justify-center py-2.5 rounded-lg border text-xs font-semibold transition-all duration-200 ${
                        platform === plat.value
                          ? plat.color + " ring-1 ring-primary/40 border-transparent shadow-sm"
                          : "bg-background/40 border-border text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      <span className="text-base mb-1">{plat.icon}</span>
                      <span>{plat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 风格与品牌词 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">内容风格</label>
                  <Select value={style} onChange={(e) => setStyle(e.target.value)} className="bg-background/80">
                    {STYLE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">融入品牌/产品词</label>
                  <Input
                    value={brandKeywords}
                    onChange={(e) => setBrandKeywords(e.target.value)}
                    placeholder="可空，逗号隔开"
                    className="bg-background/80"
                  />
                </div>
              </div>

              {/* 额外说明 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">额外写作指令 (选填)</label>
                <textarea
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  placeholder="例如: 语气要可爱活泼一些 / 强调性价比高..."
                  rows={2}
                  className="w-full px-3 py-2 bg-background/80 border border-input rounded-md text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <Button
                onClick={handleGenerateCopy}
                disabled={copyGenerating}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold transition-all duration-300 hover:opacity-90"
              >
                {copyGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    正在生成文案...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    生成 AI 帖子文案
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card/60 backdrop-blur-md">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-500" />
                  2. 配图生成设置
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={openTemplates} 
                  className="h-7 text-xs px-2"
                >
                  精选模板
                </Button>
              </CardTitle>
              <CardDescription className="text-[11px]">
                默认「模版复刻」按参考图 1:1 还原版式；「创意新图」为纯文生图创作。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">

              {/* 生图模式 */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setGenerationMode("replicate");
                    setEnhancePrompt(false);
                    setMaxRounds(1);
                    setImagesPerRound(1);
                  }}
                  className={`text-xs py-2 px-2 rounded-md font-semibold transition-all ${
                    generationMode === "replicate"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-background/80"
                  }`}
                >
                  模版 1:1 复刻
                </button>
                <button
                  type="button"
                  onClick={() => setGenerationMode("creative")}
                  className={`text-xs py-2 px-2 rounded-md font-semibold transition-all ${
                    generationMode === "creative"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-background/80"
                  }`}
                >
                  创意新图
                </button>
              </div>

              {generationMode === "replicate" && (
                <div className={`text-[10px] rounded-lg px-2.5 py-2 border ${
                  replicateReady === false
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-purple-500/30 bg-purple-500/5 text-muted-foreground"
                }`}>
                  {replicateReady === false ? (
                    <>
                      当前无法做版式复刻：请在 PicTacticAgent/.env 配置有效的 GEMINI_API_KEY、JIEKOUAI_API_KEY 或 Gemini Web Cookie。
                      MiniMax 只能做「人物长相」参考，会生成无关人像，不能复刻你的海报模版。
                    </>
                  ) : (
                    <>
                      复刻将基于参考图做<strong className="text-purple-400">图生图编辑</strong>
                      {replicateProvider ? `（引擎: ${replicateProvider}）` : ""}，保持黑底/边框/排版，仅按说明改字。
                      建议每轮只生成 1 张以便对比。
                    </>
                  )}
                </div>
              )}
              
              {/* 生图 Prompt / 替换说明 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex justify-between">
                  <span>
                    {generationMode === "replicate"
                      ? "画面主文案（可选，仅改海报上的字）"
                      : "生图 Prompt 描述 *"}
                  </span>
                  {generationMode === "creative" && (
                    <span className="text-[10px] text-muted-foreground">建议使用英文</span>
                  )}
                </label>
                {generationMode === "replicate" ? (
                  <>
                    <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useExactOnImageCopy}
                        onChange={(e) => {
                          setUseExactOnImageCopy(e.target.checked);
                          if (e.target.checked) {
                            applyStandardOnImageCopy();
                          }
                        }}
                        className="w-3.5 h-3.5 rounded"
                      />
                      使用标准画面文案（固定句式 + 黄底高亮）
                    </label>
                    {templateImages.length > 0 && !useExactOnImageCopy && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] w-full mb-1"
                        disabled={paraphrasing}
                        onClick={syncFromCover}
                      >
                        {paraphrasing ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : null}
                        从参考封面同步文案与高亮
                      </Button>
                    )}
                    <OnImageCopyEditor
                      value={imageOverlayText}
                      highlightWords={imageOverlayHighlights}
                      onChange={(v) => {
                        setImageOverlayText(v);
                        setImageOverlayHighlights(resolveOnImageHighlights(v));
                      }}
                      disabled={paraphrasing}
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {useExactOnImageCopy ? (
                        <>
                          已开启标准画面文案；「频率的声音」「胡思乱想后」「YYDS」生图时用珊瑚橙字强调（醒目、无黄底块、无行首空格）。
                        </>
                      ) : (
                        <>
                          画面文案从帖子仿写；accent 字色词传给生图（仅改字色）。发布标题/#在右侧。
                        </>
                      )}
                    </p>

                    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-muted-foreground">
                          海报边角信息（头像 / 昵称 / 时间）
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => {
                            const now = new Date();
                            setPosterTopDate(formatPosterTopDate(now));
                            setPosterBottomTime(formatPosterBottomTime(now));
                            setPosterBottomDay(EN_WEEKDAYS[now.getDay()]);
                          }}
                        >
                          刷新为当前时间
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={posterHideChrome}
                          onChange={(e) => setPosterHideChrome(e.target.checked)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        不显示头像、昵称与底部时间（擦除四角装饰）
                      </label>
                      {!posterHideChrome && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2 space-y-1">
                            <span className="text-[10px] text-muted-foreground">@昵称</span>
                            <Input
                              value={posterNickname}
                              onChange={(e) => setPosterNickname(e.target.value)}
                              placeholder="@Now冥想"
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">顶部日期</span>
                            <Input
                              value={posterTopDate}
                              onChange={(e) => setPosterTopDate(e.target.value)}
                              placeholder="06-04"
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">底部时间</span>
                            <Input
                              value={posterBottomTime}
                              onChange={(e) => setPosterBottomTime(e.target.value)}
                              placeholder="22:39"
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <span className="text-[10px] text-muted-foreground">底部星期</span>
                            <Input
                              value={posterBottomDay}
                              onChange={(e) => setPosterBottomDay(e.target.value)}
                              placeholder="Friday"
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>
                        </div>
                      )}
                      {posterNicknameWarning ? (
                        <p className="text-[10px] text-amber-500 leading-relaxed">
                          {posterNicknameWarning}
                        </p>
                      ) : posterNickname ? (
                        <p className="text-[10px] text-emerald-600/90 leading-relaxed">
                          已加载发帖账号抖音昵称：{posterNickname}
                          {posterNicknameSource ? `（来源: ${posterNicknameSource}）` : ""}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          请在右侧选择发帖账号；昵称从 CookieBridge/抖音 Cookie 解析，不会使用 Plugin-DY 等内部 ID。
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="例如: A modern summer outfit styled flat lay on wood background..."
                    rows={3}
                    className="w-full px-3 py-2 bg-background/80 border border-input rounded-md text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
              </div>

              {/* 同框参考底图预览 */}
              {templateImages.length > 0 && (
                <div className="space-y-1.5 p-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
                  <div className="flex justify-between items-center text-xs font-semibold text-indigo-400">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      同框参考底图 (Image-to-Image)
                    </span>
                    <button 
                      onClick={() => setTemplateImages([])} 
                      className="text-[10px] text-red-400 hover:text-red-500 flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> 清除参考图
                    </button>
                  </div>
                  <div className="flex gap-2 pt-1.5">
                    {templateImages.map((url, idx) => (
                      <ImagePreview
                        key={idx}
                        src={url}
                        alt="参考图"
                        className="w-16 aspect-[3/4] rounded-lg border border-border shrink-0"
                        onClick={() => openLightbox(templateImages, idx)}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {generationMode === "replicate"
                      ? "复刻模式：以上图为底图做图生图编辑，保持版式一致（非文生图重画）。"
                      : "创意模式：参考图仅作风格参考，画面可能重新创作。"}
                  </p>
                </div>
              )}

              {/* 生图比例与优化 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">图片比例</label>
                  <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="bg-background/80">
                    <option value="1:1">1:1 (正方形)</option>
                    <option value="9:16">9:16 (抖音竖屏)</option>
                    <option value="3:4">3:4 (小红书图文)</option>
                    <option value="16:9">16:9 (横版宽屏)</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">多轮进化上限</label>
                  <Select 
                    value={maxRounds} 
                    onChange={(e) => setMaxRounds(Number(e.target.value))}
                    disabled={generationMode === "replicate"}
                    className="bg-background/80 disabled:opacity-50"
                  >
                    <option value="1">1 轮 (普通生图)</option>
                    <option value="2">2 轮 (自动微调)</option>
                    <option value="3">3 轮 (精细迭代)</option>
                    <option value="4">4 轮 (顶级优化)</option>
                  </Select>
                </div>
              </div>

              <div className={`flex items-center justify-between bg-background/40 p-2.5 rounded-lg border border-border ${
                generationMode === "replicate" ? "opacity-50" : ""
              }`}>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">AI 增强 Prompt</span>
                  <span className="text-[10px] text-muted-foreground">
                    {generationMode === "replicate"
                      ? "复刻模式已关闭，避免改写版式"
                      : "调用 LLM 优化生图关键词"}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enhancePrompt}
                  disabled={generationMode === "replicate"}
                  onChange={(e) => setEnhancePrompt(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>

              <Button
                onClick={startImageGeneration}
                disabled={isGenerating || !isAgentOnline}
                className={`w-full text-white font-semibold ${
                  isAgentOnline 
                    ? "bg-gradient-to-r from-purple-500 to-pink-600 hover:opacity-90 shadow-sm shadow-purple-500/20" 
                    : "bg-slate-700 cursor-not-allowed opacity-60"
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    第 {currentRound}/{maxRounds} 轮生图中 ({progress}%)
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 mr-2" />
                    {generationMode === "replicate" ? "启动模版 1:1 复刻" : "启动创意配图生成"}
                  </>
                )}
              </Button>

              {isGenerating && (
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex-1 bg-muted h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCancelTask} 
                    className="text-red-500 text-[10px] h-6 py-0 px-2"
                  >
                    取消生图
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 中栏：图片画廊与雷达评分 (Column: 4) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="h-full shadow-sm border-border bg-card/60 backdrop-blur-md flex flex-col">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  3. 生图画廊与反馈
                </span>
                {generatedImages.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    已生成 {generatedImages.length} 张 · 点击缩略图全屏预览
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
              
              {/* Agent 离线警告 */}
              {isAgentOnline === false && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-400">生图组件未就绪</h4>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        系统检测到本地的 <code>PicTacticAgent</code> 服务正处于离线状态。请按以下指南配置并拉起服务：
                      </p>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg text-xs font-mono text-slate-300 space-y-2 border border-slate-800/80">
                    <p className="text-slate-400"># 1. 切换至对应文件夹</p>
                    <p className="text-indigo-400">cd MediaCrawlerPro/PicTacticAgent/</p>
                    <p className="text-slate-400"># 2. 配置 .env 环境变量并拉起服务</p>
                    <p className="text-indigo-400">./start.sh</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    💡 提示：该功能将使用 Gemini 等大模型生图与评分。请确认已在 .env 文件中添加正确的 API 秘钥。
                  </div>
                </div>
              )}

              {/* 生图就绪但是还没有图片 */}
              {isAgentOnline !== false && generatedImages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-xl">
                  {isGenerating ? (
                    <div className="space-y-3">
                      <Loader2 className="w-10 h-10 animate-spin text-purple-500 mx-auto" />
                      <p className="text-sm font-semibold">正在努力作画中，请稍候...</p>
                      <p className="text-[11px] text-muted-foreground">多轮进化包含：[初版生成 → 视觉质量评分 → 风格增强调整 → 高清输出]</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                      <h4 className="text-sm font-semibold text-muted-foreground">暂无生成的配图</h4>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        请在左侧设定 Prompt 并点击启动生成。我们将为您提供大模型多轮调优和六维评分服务。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 最终图片画廊 */}
              {generatedImages.length > 0 && (
                <div className="space-y-4">
                  {/* 大图预览 */}
                  {selectedImage && (
                    <div className="relative group border border-border/80 rounded-xl overflow-hidden bg-muted aspect-[3/4] max-h-[300px]">
                      <ImagePreview
                        src={selectedImage}
                        alt="AI Preview"
                        className="w-full h-full min-h-[200px]"
                        imgClassName="w-full h-full object-contain"
                        onClick={() =>
                          openLightbox(
                            generatedImageUrls,
                            generatedImageUrls.indexOf(selectedImage)
                          )
                        }
                      />
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3 flex items-end justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleImageSelection(selectedImage);
                          }}
                          className={`pointer-events-auto flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${
                            selectedImagesList.includes(selectedImage)
                              ? "bg-purple-600 text-white"
                              : "bg-white/80 text-black hover:bg-white"
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {selectedImagesList.includes(selectedImage) ? "已选定" : "选定此图"}
                        </button>
                        <div className="pointer-events-auto flex gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openLightbox(
                                generatedImageUrls,
                                generatedImageUrls.indexOf(selectedImage)
                              );
                            }}
                            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full text-white"
                            title="全屏预览"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                          <a
                            href={resolveImageSrc(selectedImage)}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full text-white"
                            title="新窗口打开"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 缩略图画廊 */}
                  <div className="grid grid-cols-4 gap-2">
                    {generatedImages.map((img, index) => {
                      const isSelected = selectedImagesList.includes(img.image_url);
                      return (
                        <div 
                          key={index} 
                          className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${
                            selectedImage === img.image_url 
                              ? "border-purple-500 scale-95 shadow-sm" 
                              : "border-transparent opacity-80 hover:opacity-100"
                          }`}
                        >
                          <ImagePreview
                            src={img.image_url}
                            alt={`AI gen ${index}`}
                            className="w-full h-full"
                            onClick={() => {
                              setSelectedImage(img.image_url);
                              openLightbox(generatedImageUrls, index);
                            }}
                          />
                          {/* 选中框 */}
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-purple-600 text-white rounded-full p-0.5 shadow">
                              <CheckCircle className="w-3 h-3" />
                            </div>
                          )}
                          {/* 多轮轮次提示 */}
                          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[8px] px-1 rounded">
                            图 {index + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* AI 六维评分雷达图 */}
                  {selectedImage && radarData.length > 0 && (
                    <div className="border border-border/80 rounded-xl p-3.5 bg-background/50 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-foreground">AI 六维质量评估</span>
                        {rawScore?.overall !== undefined && (
                          <span className="text-xs text-purple-600 font-semibold bg-purple-500/10 px-2 py-0.5 rounded">
                            综合得分: {formatScore(rawScore.overall)} / 100
                          </span>
                        )}
                      </div>
                      
                      <div className="h-[180px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 10 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 8 }} />
                            <Radar
                              name="AI Score"
                              dataKey="A"
                              stroke="#8b5cf6"
                              fill="#c084fc"
                              fillOpacity={0.4}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* 详细指标数据展示 */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                        <div>Aesthetics: <span className="font-semibold text-foreground">{formatScore(rawScore?.aesthetic)}</span></div>
                        <div>Creativity: <span className="font-semibold text-foreground">{formatScore(rawScore?.creativity)}</span></div>
                        <div>Relevance: <span className="font-semibold text-foreground">{formatScore(rawScore?.relevance)}</span></div>
                        <div>Composition: <span className="font-semibold text-foreground">{formatScore(rawScore?.composition)}</span></div>
                        <div>Color: <span className="font-semibold text-foreground">{formatScore(rawScore?.color)}</span></div>
                        <div>Overall: <span className="font-semibold text-foreground">{formatScore(rawScore?.overall)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右栏：文案编辑与一键分发 (Column: 4) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm border-border bg-card/60 backdrop-blur-md">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Layout className="w-4 h-4 text-purple-500" />
                  4. 帖子文案精修（仅发布用）
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] shrink-0"
                  disabled={paraphrasing || copyGenerating || (!copyTitle && !copyBody)}
                  onClick={() =>
                    runParaphrase(
                      {
                        title: copyTitle,
                        body: copyBody,
                        hashtags: copyHashtags,
                      },
                      { onlyPublish: useExactOnImageCopy }
                    )
                  }
                >
                  {paraphrasing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "仿写高频词"
                  )}
                </Button>
              </CardTitle>
              <CardDescription className="text-[10px]">
                发布区按帖子解析标题/正文/话题。左侧画面为标准文案；强调词用珊瑚橙字体（{DEFAULT_ON_IMAGE_ACCENT_COLOR}），黑底白字对比醒目，无底色块。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              
              {/* 标题 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">发布标题</label>
                <Input
                  value={copyTitle}
                  onChange={(e) => setCopyTitle(e.target.value)}
                  placeholder="AI 生成的吸睛标题..."
                  className="bg-background/80"
                />
              </div>

              {/* 正文 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">正文正本</label>
                <textarea
                  value={copyBody}
                  onChange={(e) => setCopyBody(e.target.value)}
                  placeholder="AI 生成的文章主体，包含emoji排版..."
                  rows={8}
                  className="w-full px-3 py-2 bg-background/80 border border-input rounded-md text-sm font-sans focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* 标签 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  平台 Hashtags（原帖话题，可手动添加）
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    placeholder="新增标签"
                    className="h-8 text-xs bg-background/80"
                    onKeyDown={(e) => e.key === "Enter" && addHashtag()}
                  />
                  <Button size="sm" onClick={addHashtag} className="h-8 px-3">添加</Button>
                </div>
                
                {copyHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {copyHashtags.map((tag) => (
                      <span 
                        key={tag} 
                        className="inline-flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 text-purple-600 px-2 py-0.5 rounded text-xs"
                      >
                        #{tag}
                        <button onClick={() => removeHashtag(tag)} className="hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card/60 backdrop-blur-md">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-purple-500" />
                5. 推送矩阵分发队列
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">任务名称 *</label>
                  <Input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="例如: 爆款小红书图文..."
                    className="h-9 bg-background/80 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">绑定发布账号</label>
                  <Select 
                    value={selectedAccountId} 
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-9 bg-background/80 text-xs"
                  >
                    {accounts.length === 0 ? (
                      <option value="">(无绑定账号, 自动轮询)</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.account_name} ({acc.status === "active" ? "正常" : "异常"})
                        </option>
                      ))
                    )}
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">定时发布时间 (不设则为立即发布)</label>
                  <Input
                    type="datetime-local"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="h-9 bg-background/80 text-xs"
                  />
                </div>
              </div>

              {/* 选定配图状态概览 */}
              <div className="bg-background/40 p-2.5 rounded-lg border border-border text-[11px] space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>拟发布配图数量：</span>
                  <span className="font-semibold text-foreground">{selectedImagesList.length} 张</span>
                </div>
                <div className="flex justify-between">
                  <span>分发平台：</span>
                  <span className="font-semibold text-primary capitalize">{platform}</span>
                </div>
                {selectedImagesList.length > 0 && (
                  <div className="flex gap-1.5 pt-1.5 overflow-x-auto max-h-12">
                    {selectedImagesList.map((url, idx) => (
                      <ImagePreview
                        key={idx}
                        src={url}
                        alt="已选配图"
                        className="w-8 h-8 rounded border border-border shrink-0"
                        showZoomHint={false}
                        onClick={() => openLightbox(selectedImagesList, idx)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 视频合成工作台 */}
              <div className="bg-card border border-border rounded-xl p-3.5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    🎬 视频合成工作区
                  </h4>
                  {composedVideoUrl && (
                    <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">
                      已合成视频
                    </span>
                  )}
                </div>
                
                {selectedImagesList.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground bg-muted/30 p-3 rounded-lg text-center">
                    请先在上方画廊勾选海报，再使用本栏目进行视频合成
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground block">背景音乐 (BGM) 选择</label>
                      <div className="flex gap-2">
                        <select
                          value={selectedBgmForCompose}
                          onChange={(e) => setSelectedBgmForCompose(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg outline-none"
                          disabled={loadingBgms}
                        >
                          {loadingBgms ? (
                            <option>加载音乐库中...</option>
                          ) : bgms.length === 0 ? (
                            <option value="">暂无可用提取的背景音</option>
                          ) : (
                            bgms.map((b) => (
                              <option key={b.url} value={b.url}>
                                {b.name}
                              </option>
                            ))
                          )}
                        </select>
                        {selectedBgmForCompose && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={togglePlayBgm}
                            className="h-8 px-2.5 text-xs"
                          >
                            {isPlayingBgm ? "暂停" : "试听"}
                          </Button>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleComposeVideo}
                      disabled={composingVideo || selectedImagesList.length === 0}
                      className="w-full text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
                    >
                      {composingVideo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          视频正在合成，FFmpeg 渲染中...
                        </>
                      ) : (
                        <>
                          🎬 开始合成视频
                        </>
                      )}
                    </Button>

                    {composedVideoUrl && (
                      <div className="pt-2.5 border-t border-border/40 space-y-2">
                        <div className="relative aspect-[9/16] max-h-56 mx-auto rounded-lg overflow-hidden bg-black shadow-md border border-border">
                          <video
                            src={composedVideoUrl}
                            controls
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex gap-2 justify-center">
                          <a
                            href={composedVideoUrl}
                            download={`growhub_video_${new Date().getTime()}.mp4`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-md transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            下载合成视频
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={handleSubmitPublish}
                disabled={publishPushing || copyGenerating || isGenerating}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition-all duration-300 py-5 shadow-lg shadow-indigo-500/10"
              >
                <Send className="w-4 h-4 mr-2" />
                🚀 提交并推送到矩阵分发
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─────────────────── 精选模板弹窗 ─────────────────── */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-border/50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-500" />
                  精选图片提示词模板 (199 条)
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">选择模版将载入封面作为 1:1 复刻参考图（非创意文生图）。</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowTemplatesModal(false)} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {loadingTemplates ? (
                <div className="col-span-2 py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p className="text-xs">加载精选模版中...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-muted-foreground text-xs">
                  暂无模板，请确认 PicTacticAgent 在线并已配置模板数据库。
                </div>
              ) : (
                templates.map((tpl) => (
                  <div 
                    key={tpl.id} 
                    onClick={() => selectTemplate(tpl)}
                    className="p-3 bg-background/50 border border-border hover:border-purple-500/50 rounded-xl cursor-pointer hover:bg-purple-500/5 transition-all text-left flex flex-col justify-between space-y-2 group"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-foreground group-hover:text-purple-600 transition-colors">
                          {tpl.name}
                        </span>
                        <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {tpl.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1.5 italic font-mono">
                        "{tpl.prompt}"
                      </p>
                    </div>
                    <div className="flex justify-end pt-1">
                      <span className="text-[9px] text-purple-500 font-semibold flex items-center gap-0.5">
                        复刻此模版
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-3 border-t border-border/50 flex justify-between items-center bg-muted/20 text-[10px] text-muted-foreground">
              <span>提供 199 条经爆款验证的小红书与抖音热门配图模板</span>
              <span>数据来源于 PicTacticAgent 内置模板库</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── 📂 历史发帖模板弹窗 ─────────────────── */}
      {showPublishedModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border/50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  历史发布帖子库{publishedTotal > 0 ? ` (${publishedTotal} 个模版)` : ""}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">选择任意爆款帖子，可一键套用文案正文、标签、并将封面做为同框生图的背景底图。</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowPublishedModal(false)} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* 搜索栏 */}
            <div className="px-4 py-3 border-b border-border/30 bg-muted/10 flex gap-2">
              <Input
                placeholder="搜索历史帖子标题或内容..."
                value={publishedSearch}
                onChange={(e) => setPublishedSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPublishedPosts(1, publishedSearch)}
                className="max-w-md bg-background"
              />
              <Button onClick={() => loadPublishedPosts(1, publishedSearch)} className="px-4 bg-indigo-600 hover:bg-indigo-500">
                搜索
              </Button>
            </div>
            
            {/* 网格列表 */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {loadingPublished ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
                  <p className="text-xs">加载历史发帖数据中...</p>
                </div>
              ) : publishedPosts.length === 0 ? (
                <div className="col-span-full py-20 text-center text-muted-foreground text-xs space-y-2">
                  <p>{publishedSearch.trim() ? "没有匹配该关键词的历史帖子。" : "暂无历史帖子数据。"}</p>
                  {publishedSearch.trim() && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => {
                        setPublishedSearch("");
                        loadPublishedPosts(1, "");
                      }}
                    >
                      清除搜索条件
                    </Button>
                  )}
                </div>
              ) : (
                publishedPosts.map((post) => (
                  <div 
                    key={post.id} 
                    onClick={() => handleApplyPublishedPost(post)}
                    className="group relative flex flex-col bg-background/40 border border-border hover:border-indigo-500/50 rounded-xl overflow-hidden cursor-pointer hover:bg-indigo-500/5 transition-all text-left"
                  >
                    {/* 封面缩略图 */}
                    <div className="aspect-[3/4] w-full bg-muted relative overflow-hidden border-b border-border/50">
                      {post.cover_url ? (
                        <div
                          className="w-full h-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLightbox(
                              publishedPosts.map((p) => p.cover_url).filter(Boolean) as string[],
                              publishedPosts.findIndex((p) => p.id === post.id)
                            );
                          }}
                        >
                          <ImagePreview
                            src={post.cover_url}
                            alt={post.title || "封面"}
                            className="w-full h-full"
                            imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xs">
                          无封面图
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
                        {post.bgm_url && post.audio_status === "success" ? (
                          <span className="bg-emerald-600/90 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Music className="w-2.5 h-2.5" /> 已有BGM
                          </span>
                        ) : post.video_url ? (
                          <span className="bg-indigo-600/90 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Music className="w-2.5 h-2.5" /> 可提取BGM
                          </span>
                        ) : null}
                        <span className="bg-black/60 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                          ID: {post.id}
                        </span>
                      </div>
                    </div>
                    {/* 帖子信息 */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div className="space-y-1">
                        <h4 className="font-bold text-xs text-foreground line-clamp-1 group-hover:text-indigo-500 transition-colors">
                          {post.title || "未命名帖子"}
                        </h4>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {post.description}
                        </p>
                      </div>
                      <div className="flex justify-end pt-1">
                        <span className="text-[9px] text-indigo-500 font-semibold flex items-center gap-0.5 group-hover:underline">
                          一键套用模板
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* 分页控制栏 */}
            {publishedTotal > 0 && (
              <div className="p-4 border-t border-border/50 flex justify-between items-center bg-muted/20 text-xs text-muted-foreground">
                <span>共 {publishedTotal} 个已发布帖子</span>
                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={publishedPage <= 1 || loadingPublished}
                    onClick={() => loadPublishedPosts(publishedPage - 1, publishedSearch)}
                    className="h-7 px-2.5 text-[10px]"
                  >
                    上一页
                  </Button>
                  <span className="font-medium text-foreground">
                    第 {publishedPage} / {Math.ceil(publishedTotal / publishedPageSize)} 页
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={publishedPage >= Math.ceil(publishedTotal / publishedPageSize) || loadingPublished}
                    onClick={() => loadPublishedPosts(publishedPage + 1, publishedSearch)}
                    className="h-7 px-2.5 text-[10px]"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          title="配图预览"
        />
      )}
      
      {selectedBgmForCompose && (
        <audio
          ref={audioRef}
          src={resolveAudioSrc(selectedBgmForCompose)}
          className="hidden"
          onEnded={() => setIsPlayingBgm(false)}
        />
      )}
    </div>
  );
};

export default ImageGenPage;
