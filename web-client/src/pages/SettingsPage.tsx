import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  Database,
  Shield,
  Globe,
  Loader2,
  Save,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Key,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import api, { fetchPluginConfig, fetchPluginSetupInfo } from "@/api";

const LLM_PROVIDERS = [
  {
    id: "openrouter",
    label: "OpenRouter (推荐)",
    desc: "支持 Gemini, Claude, GPT 等多种模型",
  },
  {
    id: "deepseek",
    label: "DeepSeek (V3/R1)",
    desc: "国产高性能模型，响应速度快",
  },
  {
    id: "ollama",
    label: "Ollama (本地)",
    desc: "本地运行，数据不离身，免费使用",
  },
];

const CLEAR_OPTIONS = [
  {
    id: "content",
    label: "清空内容数据 (GrowHub Content)",
    desc: "删除所有抓取的内容数据、通知记录和关键词统计。",
    warning: "注意：此操作不可恢复！",
  },
  {
    id: "creator",
    label: "清空达人博主 (GrowHub Creator)",
    desc: "删除所有提取的达人博主档案和统计。",
  },
  {
    id: "hotspot",
    label: "清空热点排行 (GrowHub Hotspot)",
    desc: "删除所有抓取的热点内容排行快照。",
  },
  {
    id: "checkpoint",
    label: "清空爬虫进度 (Checkpoints)",
    desc: "删除所有爬虫断点记录。下次任务将从头开始。",
  },
  {
    id: "all",
    label: "重置所有数据 (Reset All)",
    desc: "执行上述所有清理操作，让系统回归初始数据状态（保留配置）。",
    warning: "慎用！这将删除所有业务数据。",
  },
];

const PROXY_PROVIDERS = [
  { id: "none", label: "不使用代理", desc: "直接使用本地 IP（高风险）" },
  { id: "kuaidaili", label: "快代理 (KuaiDaili)", desc: "支持私密代理 DPS" },
  { id: "wandouhttp", label: "豌豆代理 (Wandou)", desc: "支持动态超长效 IP" },
];

const SettingsPage: React.FC = () => {
  const { mutate } = useSWRConfig();
  const [clearing, setClearing] = useState(false);
  const [actionToConfirm, setActionToConfirm] = useState<string | null>(null);

  // Proxy Settings State
  const [proxySettings, setProxySettings] = useState<any>({
    provider: "none",
    enable_proxy: false,
    kdl_secret_id: "",
    kdl_signature: "",
    kdl_user_name: "",
    kdl_user_pwd: "",
    wandou_app_key: "",
  });
  // LLM Settings State
  const [llmSettings, setLlmSettings] = useState<any>({
    provider: "openrouter",
    openrouter_key: "",
    deepseek_key: "",
    ollama_url: "http://localhost:11434",
    model: "google/gemini-2.0-flash-exp:free",
  });
  // Plugin Settings State
  const [pluginConfig, setPluginConfig] = useState<any>({
    report_key: "",
  });
  const [setupInfo, setSetupInfo] = useState<any>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoadingSettings(true);

    // Fetch Proxy Config
    try {
      const proxyRes = await api.get("/growhub/settings/proxy_config");
      if (proxyRes.data?.config_value) {
        setProxySettings(proxyRes.data.config_value);
      }
    } catch (e) {
      console.warn("Proxy settings access denied");
    }

    // Fetch LLM Config
    try {
      const llmRes = await api.get("/growhub/settings/llm_config");
      if (llmRes.data?.config_value) {
        setLlmSettings(llmRes.data.config_value);
      }
    } catch (e) {
      console.warn("LLM settings access denied");
    }

    // Fetch Plugin Config
    try {
      const pluginData = await fetchPluginConfig();
      if (pluginData?.config_value) {
        setPluginConfig(pluginData.config_value);
      }
    } catch (e) {
      console.warn("Plugin config access denied");
    }

    // Fetch Setup Info (Always try to fetch this for all users)
    await fetchSetupInfo();

    setLoadingSettings(false);
  };

  const fetchSetupInfo = async () => {
    try {
      setSetupError(null);
      const data = await fetchPluginSetupInfo();
      setSetupInfo(data);
    } catch (e: any) {
      console.error("Failed to fetch setup info", e);
      setSetupError(e.response?.data?.message || e.message || "获取失败");
    }
  };

  const handleSavePluginConfig = async () => {
    setSavingSettings(true);
    try {
      await api.post("/growhub/settings", {
        config_key: "plugin_config",
        config_value: pluginConfig,
      });

      toast.success("插件配置已保存");
      fetchSetupInfo();
    } catch (error: any) {
      toast.error(
        `保存失败: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveLlm = async () => {
    setSavingLlm(true);
    try {
      await api.post("/growhub/settings", {
        config_key: "llm_config",
        config_value: llmSettings,
      });
      toast.success("AI 配置已保存");
    } catch (error: any) {
      toast.error(
        `保存失败: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setSavingLlm(false);
    }
  };

  const testLlmConnection = async () => {
    setTestingLlm(true);
    try {
      const response = await api.post(
        "/growhub/settings/llm/test",
        llmSettings,
      );
      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message || "连接失败");
      }
    } catch (error: any) {
      toast.error(
        `测试失败: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setTestingLlm(false);
    }
  };

  const handleSaveProxy = async () => {
    setSavingSettings(true);
    try {
      await api.post("/growhub/settings", {
        config_key: "proxy_config",
        config_value: proxySettings,
      });
      toast.success("代理配置已保存");
    } catch (error: any) {
      toast.error(
        `保存失败: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const testProxyConnection = async () => {
    setTestingProxy(true);
    try {
      const response = await api.post(
        "/growhub/settings/proxy/test",
        proxySettings,
      );
      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message || "测试失败，请检查配置");
      }
    } catch (error: any) {
      toast.error(
        `测试连接失败: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setTestingProxy(false);
    }
  };

  const handleClearData = async () => {
    if (!actionToConfirm) return;

    setClearing(true);
    try {
      await api.delete(
        `/growhub/system/data/clear?data_type=${actionToConfirm}`,
      );
      toast.success("数据已清空");
      // Refresh content related caches
      mutate(
        (key) => typeof key === "string" && key.includes("/api/growhub"),
        undefined,
        { revalidate: true },
      );
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    } finally {
      setClearing(false);
      setActionToConfirm(null);
    }
  };

  const selectedOption = CLEAR_OPTIONS.find(
    (opt) => opt.id === actionToConfirm,
  );

  if (loadingSettings) {
    return (
      <div className="container mx-auto py-12 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">
          正在加载系统配置...
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
        <div className="flex bg-muted p-1 rounded-lg">
          <div className="px-3 py-1 text-xs font-medium">
            GrowHub v2.0.4 - Production
          </div>
        </div>
      </div>

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
        {/* Proxy Settings Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-indigo-100 dark:border-indigo-900/20 overflow-hidden">
            <div className="h-1 bg-indigo-500" />
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-indigo-500" />
                <span>IP 代理池配置</span>
              </CardTitle>
              <CardDescription>
                配置网络代理，隐藏抓取
                IP，降低封禁风险。建议在大规模采集时开启。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border border-border/50">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">启用全局代理池</div>
                    <div className="text-xs text-muted-foreground">
                      开启后，所有爬虫任务将强制使用选定的代理商。
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setProxySettings({
                        ...proxySettings,
                        enable_proxy: !proxySettings.enable_proxy,
                      })
                    }
                    className={`w-12 h-6 rounded-full transition-colors relative ${proxySettings.enable_proxy ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proxySettings.enable_proxy ? "left-7" : "left-1"}`}
                    />
                  </button>
                </div>

                {proxySettings.enable_proxy && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          选择代理平台
                        </label>
                        <select
                          className="w-full h-10 px-3 py-1 bg-background border border-border rounded-lg"
                          value={proxySettings.provider}
                          onChange={(e) =>
                            setProxySettings({
                              ...proxySettings,
                              provider: e.target.value,
                            })
                          }
                        >
                          {PROXY_PROVIDERS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {proxySettings.provider === "kuaidaili" && (
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                              Secret ID
                            </label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                              placeholder="KDL Secret ID"
                              value={proxySettings.kdl_secret_id}
                              onChange={(e) =>
                                setProxySettings({
                                  ...proxySettings,
                                  kdl_secret_id: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                              Signature
                            </label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                              placeholder="KDL Signature"
                              value={proxySettings.kdl_signature}
                              onChange={(e) =>
                                setProxySettings({
                                  ...proxySettings,
                                  kdl_signature: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {proxySettings.provider === "wandouhttp" && (
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                              App Key
                            </label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                              placeholder="Wandou App Key"
                              value={proxySettings.wandou_app_key}
                              onChange={(e) =>
                                setProxySettings({
                                  ...proxySettings,
                                  wandou_app_key: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {proxySettings.provider === "kuaidaili" && (
                        <div className="space-y-4 pt-2 md:pt-11">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                              用户名 (隧道认证)
                            </label>
                            <input
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                              placeholder="Username"
                              value={proxySettings.kdl_user_name}
                              onChange={(e) =>
                                setProxySettings({
                                  ...proxySettings,
                                  kdl_user_name: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">
                              密码
                            </label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                              placeholder="Password"
                              value={proxySettings.kdl_user_pwd}
                              onChange={(e) =>
                                setProxySettings({
                                  ...proxySettings,
                                  kdl_user_pwd: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30 text-xs space-y-2 mt-auto">
                        <div className="font-bold text-indigo-700 dark:text-indigo-400">
                          💡 提示
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                          {proxySettings.provider === "kuaidaili" &&
                            "快代理目前主要支持私密代理 DPS。请确保你的账号余额充足，并已在官网实名认证。"}
                          {proxySettings.provider === "wandouhttp" &&
                            "豌豆代理支持动态长效 IP，适合需要稳定 Session 的场景。"}
                          {proxySettings.provider === "none" &&
                            "不使用代理将直接暴露你的服务器公网 IP。"}
                        </p>
                        <a
                          href="https://nanmicoder.github.io/MediaCrawler/%E5%BF%AB%E4%BB%A3%E7%90%86%E4%BD%BF%E7%94%A8%E6%96%87%E6%A1%A3.html"
                          target="_blank"
                          className="text-indigo-600 underline"
                        >
                          查看配置文档
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-indigo-50 dark:border-indigo-900/10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testProxyConnection}
                  disabled={proxySettings.provider === "none" || testingProxy}
                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                >
                  {testingProxy ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Globe className="w-4 h-4 mr-2" />
                  )}
                  测试代理连接
                </Button>
                <Button
                  onClick={handleSaveProxy}
                  disabled={savingSettings}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存配置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI 模型配置 */}
          <Card className="shadow-sm border-indigo-100/50 dark:border-indigo-900/20 overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-lg">AI 模型配置</CardTitle>
              </div>
              <CardDescription>
                配置用于关键词联想、评论生成和内容改写的 AI 模型 (Semantic
                Research)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                    模型供应商
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {LLM_PROVIDERS.map((p) => {
                      const isSelected = llmSettings.provider === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() =>
                            setLlmSettings({ ...llmSettings, provider: p.id })
                          }
                          className={`
                            relative p-4 rounded-xl border transition-all cursor-pointer select-none
                            ${
                              isSelected
                                ? "border-purple-500 bg-purple-600 text-white shadow-md shadow-purple-500/20"
                                : "border-border bg-card hover:border-purple-300 dark:hover:border-purple-700 hover:bg-accent/50"
                            }
                          `}
                        >
                          <div className="font-bold text-sm tracking-wide">
                            {p.label}
                          </div>
                          <div
                            className={`text-[11px] mt-1.5 leading-relaxed ${isSelected ? "text-purple-100" : "text-muted-foreground"}`}
                          >
                            {p.desc}
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-muted/30 p-5 rounded-xl border border-border/50 space-y-4">
                  {llmSettings.provider === "openrouter" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        OpenRouter API Key
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                        placeholder="sk-or-v1-..."
                        value={llmSettings.openrouter_key}
                        onChange={(e) =>
                          setLlmSettings({
                            ...llmSettings,
                            openrouter_key: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {llmSettings.provider === "deepseek" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        DeepSeek API Key
                      </label>
                      <input
                        type="password"
                        className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                        placeholder="sk-..."
                        value={llmSettings.deepseek_key}
                        onChange={(e) =>
                          setLlmSettings({
                            ...llmSettings,
                            deepseek_key: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {llmSettings.provider === "ollama" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Ollama 服务地址
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                        placeholder="http://localhost:11434"
                        value={llmSettings.ollama_url}
                        onChange={(e) =>
                          setLlmSettings({
                            ...llmSettings,
                            ollama_url: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      模型名称 (Model ID)
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                      placeholder={
                        llmSettings.provider === "ollama"
                          ? "如: qwen2.5:7b"
                          : "如: google/gemini-2.0-flash-exp:free"
                      }
                      value={llmSettings.model}
                      onChange={(e) =>
                        setLlmSettings({
                          ...llmSettings,
                          model: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testLlmConnection}
                  disabled={testingLlm}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                >
                  {testingLlm ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  测试 AI 连接
                </Button>
                <Button
                  onClick={handleSaveLlm}
                  disabled={savingLlm}
                  className="bg-purple-600 hover:bg-purple-700 text-white min-w-[120px] shadow-sm shadow-purple-200 dark:shadow-none"
                >
                  {savingLlm ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存 AI 配置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 插件对接配置 */}
          <Card className="shadow-sm border-blue-100 dark:border-blue-900/20 overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/40">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-lg">社媒助手插件对接</CardTitle>
              </div>
              <CardDescription>
                获取插件配置信息，或配置免登录上报 Key。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="bg-blue-50/50 dark:bg-blue-950/10 p-5 rounded-xl border border-blue-100 dark:border-blue-900/20 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center justify-between">
                      <span>上报接口地址 (URL)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(setupInfo?.url || "");
                          toast.success("已复制到剪贴板");
                        }}
                        className="flex items-center gap-1 hover:text-blue-600"
                      >
                        <Copy className="w-3 h-3" /> 复制
                      </button>
                    </label>
                    <div className="p-2 bg-background border rounded text-xs break-all font-mono">
                      {setupInfo?.url ? (
                        setupInfo.url
                      ) : (
                        <span
                          className={
                            setupError
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }
                        >
                          {setupError || "加载中..."}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center justify-between">
                      <span>当前身份令牌 (Authorization)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            setupInfo?.headers?.Authorization || "",
                          );
                          toast.success("已复制 Token");
                        }}
                        className="flex items-center gap-1 hover:text-blue-600"
                      >
                        <Copy className="w-3 h-3" /> 复制
                      </button>
                    </label>
                    <div className="p-2 bg-background border rounded text-xs h-12 overflow-hidden text-ellipsis font-mono">
                      {setupInfo?.headers?.Authorization ? (
                        setupInfo.headers.Authorization
                      ) : (
                        <span
                          className={
                            setupError
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }
                        >
                          {setupError || "加载中..."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-orange-500" />
                    <h4 className="text-sm font-semibold">
                      固定上报 Key (免登录模式)
                    </h4>
                  </div>
                  <div className="bg-orange-50/30 dark:bg-orange-950/5 p-4 rounded-lg border border-orange-100/50 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      如果您不想使用会过期的 Token，可以设置一个固定的 Key
                      填入插件。
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
                        placeholder="例如: my-secret-key-123"
                        value={pluginConfig.report_key}
                        onChange={(e) =>
                          setPluginConfig({
                            ...pluginConfig,
                            report_key: e.target.value,
                          })
                        }
                      />
                      <Button size="sm" onClick={handleSavePluginConfig}>
                        保存并更新
                      </Button>
                    </div>
                    {setupInfo?.fixed_key !== "NOT_SET" && (
                      <div className="pt-2 text-[10px] text-orange-600 font-mono break-all bg-white/50 p-2 rounded">
                        带 Key 链接: {setupInfo?.fixed_key_url}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{" "}
                  提示：配置后建议在插件中点击“测试”进行校验。
                </span>
                <a
                  href="https://smzs.xisence.com/help/guide/data-reporting"
                  target="_blank"
                  className="text-blue-500 hover:underline flex items-center gap-1"
                >
                  查看官方文档 <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Data Maintenance Card */}
          <Card className="shadow-sm border-red-100 dark:border-red-900/20">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-red-500" />
                <span>数据维护</span>
              </CardTitle>
              <CardDescription>管理和清理系统产生的抓取数据。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CLEAR_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  className="flex flex-col p-3 border rounded-lg bg-card hover:bg-red-50/50 dark:hover:bg-red-950/10 border-border hover:border-red-200 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium flex items-center">
                      {option.label}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={clearing}
                      onClick={() => setActionToConfirm(option.id)}
                      className="h-7 text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      清空
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight">
                    {option.desc}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!actionToConfirm}
        onClose={() => setActionToConfirm(null)}
        title="⚠️ 确认清空数据？"
        className="max-w-md"
      >
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>此操作将永久删除：</p>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-100 dark:border-red-900/30">
              <p className="font-medium text-red-600 dark:text-red-400 mb-1">
                {selectedOption?.label}
              </p>
              <p className="text-red-700 dark:text-red-300 text-xs">
                {selectedOption?.desc}
              </p>
            </div>
            <p>
              注：项目配置和账号信息<b>不会</b>被删除。
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setActionToConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearData}
              className="bg-red-600 hover:bg-red-700"
            >
              {clearing ? "处理中..." : "确认清空"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;
