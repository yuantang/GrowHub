import { useState, useEffect } from "react";
import { usePluginStore } from "../utils/store";

type Tab = "status" | "bind" | "accounts" | "tasks";
type View = "home" | "platforms" | "accounts";

export default function Popup() {
  const {
    serverUrl,
    apiToken,
    isConnected,
    taskCount,
    lastSync,
    activeTask,
    logs,
    setConfig,
    clearConfig,
    taskQueue,
    lastCapture,
  } = usePluginStore();
  const [activeTab, setActiveTab] = useState<Tab>(
    serverUrl ? "status" : "bind",
  );
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(apiToken);
  const [saving, setSaving] = useState(false);

  // Sync inputs with store when data loads from storage
  useEffect(() => {
    if (serverUrl) setInputUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (apiToken) setInputToken(apiToken);
  }, [apiToken]);

  // V5 Navigation: Internal view state within "accounts" tab
  const [activeView, setActiveView] = useState<View>("home");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  // Current session cookies for real-time display
  const [currentCookies, setCurrentCookies] = useState<any[]>([]);
  const [loadingCookies, setLoadingCookies] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error">(
    "all",
  );

  // V4 Optimization: Trust store.ts for initial load and onChanged sync.
  useEffect(() => {
    // We keep the polling for taskCount/isConnected as a fallback if needed,
    // but the store already handles this via storage.onChanged.
    // For now, let's just keep the interval for heartbeat/debug check if desired.
    const interval = setInterval(() => {
      // Just a heartbeat or minimal check
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // V6: Listen for cookie changes specifically
  useEffect(() => {
    if (
      activeTab === "accounts" &&
      activeView === "accounts" &&
      selectedPlatform
    ) {
      const listener = (changes: any, areaName: string) => {
        if (areaName === "local" && changes.lastCookieChange) {
          usePluginStore
            .getState()
            .addLog(
              `[Popup] Cookie change detected, refreshing ${selectedPlatform} account...`,
            );
          loadCurrentCookies(selectedPlatform);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [activeTab, activeView, selectedPlatform]);

  const handleBind = async () => {
    if (!inputUrl || !inputToken) return;
    setSaving(true);
    usePluginStore.getState().addLog(`Attempting to bind service: ${inputUrl}`);
    try {
      // Validate token by calling server
      const res = await fetch(`${inputUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${inputToken}` },
      });
      if (!res.ok) throw new Error("Token 无效");

      await setConfig(inputUrl, inputToken);
      usePluginStore.getState().addLog("Service bound successfully");

      // Force restart of background service to ensure connection with new config
      usePluginStore.getState().addLog("Resetting background connection...");
      chrome.runtime.sendMessage({ type: "ARM_RESTART" });
      chrome.runtime.sendMessage({ type: "RESET_OFFSCREEN" });

      setActiveTab("status");
    } catch (err: any) {
      const msg = err.message || "绑定失败";
      usePluginStore.getState().addLog(`Bind failed: ${msg}`);
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUnbind = async () => {
    if (confirm("确定要解除绑定吗？")) {
      usePluginStore.getState().addLog("Unbinding service...");
      await clearConfig();
      usePluginStore.getState().addLog("Service unbound");
      setActiveTab("bind");
    }
  };

  const handleSyncCookies = async () => {
    // Send message to background to trigger manual sync
    usePluginStore.getState().addLog("Manual cookie sync requested...");
    chrome.runtime.sendMessage({ type: "MANUAL_SYNC_COOKIES" });
    alert("同步请求已发送，请查看日志");
  };

  const loadCurrentCookies = async (platform: string) => {
    setLoadingCookies(true);
    setCurrentProfile(null);

    const { fetchPlatformProfile, PLATFORM_DOMAINS } =
      await import("../utils/platforms");

    // 1. Try Cache First (One-click experience)
    const { platformProfiles = {} } =
      await chrome.storage.local.get("platformProfiles");
    if (platformProfiles[platform]) {
      setCurrentProfile(platformProfiles[platform]);
    }

    // 2. Fetch Fresh Profile Info
    try {
      const profile = await fetchPlatformProfile(platform);
      setCurrentProfile(profile);
      // Update cache in background
      chrome.storage.local.set({
        platformProfiles: { ...platformProfiles, [platform]: profile },
      });
    } catch (e) {
      console.warn("Profile fetch failed:", e);
    }

    // 2. Fetch Cookie List
    const domains = PLATFORM_DOMAINS[platform] || [];
    const allFound: any[] = [];

    for (const domain of domains) {
      const cookies = await chrome.cookies.getAll({ domain });
      allFound.push(...cookies);
    }

    // Deduplicate
    const unique = Array.from(
      new Map(allFound.map((c) => [`${c.name}|${c.domain}`, c])).values(),
    );
    setCurrentCookies(unique);
    setLoadingCookies(false);
  };

  const handleSwitchAccount = async (input: any) => {
    try {
      if (!confirm("确定要切换到该账号吗？当前浏览器的登录状态将被覆盖。"))
        return;

      const { PLATFORM_DOMAINS } = await import("../utils/platforms");
      const domains = selectedPlatform
        ? PLATFORM_DOMAINS[selectedPlatform] || []
        : [];

      let cookiesToSet: any[] = [];

      if (typeof input === "string") {
        // From database string
        const cookiePairs = input.split(";").map((s: string) => s.trim());
        for (const pair of cookiePairs) {
          const index = pair.indexOf("=");
          if (index === -1) continue;
          cookiesToSet.push({
            name: pair.substring(0, index),
            value: pair.substring(index + 1),
          });
        }
      } else if (Array.isArray(input)) {
        // From local storage array
        cookiesToSet = input;
      }

      usePluginStore
        .getState()
        .addLog(
          `[Popup] Injecting ${cookiesToSet.length} cookies for ${selectedPlatform}...`,
        );

      for (const c of cookiesToSet) {
        // If it's a rich cookie object (has domain/path)
        if (c.domain) {
          const url = `https://${c.domain.startsWith(".") ? c.domain.substring(1) : c.domain}${c.path || "/"}`;
          await chrome.cookies.set({
            url,
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expirationDate: c.expirationDate,
          });
        } else {
          // It's a simple name/value pair, apply to all associated domains
          for (const domain of domains) {
            try {
              await chrome.cookies.set({
                url: `https://${domain.startsWith(".") ? domain.substring(1) : domain}`,
                name: c.name,
                value: c.value,
                domain: domain.startsWith(".") ? domain : undefined,
                path: "/",
              });
            } catch (e) {}
          }
        }
      }

      alert("切换成功！请刷新页面查看。");
      if (selectedPlatform) {
        setTimeout(() => loadCurrentCookies(selectedPlatform), 500);
      }

      // Trigger sync to backend
      chrome.runtime.sendMessage({ type: "MANUAL_SYNC_COOKIES" });
    } catch (e: any) {
      console.error("Account switch failed:", e);
      addLog(`❌ Switch failed: ${e.message}`);
    }
  };

  const handleCopyCK = (cookies: any[]) => {
    const ckString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    navigator.clipboard.writeText(ckString);
    alert("Cookie 已复制到剪贴板");
  };

  const handleSaveAccount = (platform: string) => {
    const name = prompt("请输入账号备注名称 (例如: 主推号-01)");
    if (!name) return;
    usePluginStore.getState().saveAccount(platform, name, currentCookies);
    alert("账号已保存到本地");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-card border-b border-border p-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <span className="text-2xl">🚀</span>
          </div>
          <div>
            <h1 className="text-lg font-bold">GrowHub 社媒助手</h1>
            <p className="text-xs text-gray-400">分布式采集执行层</p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("status")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "status"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          运行状态
        </button>
        <button
          onClick={() => setActiveTab("bind")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "bind"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          服务绑定
        </button>
        <button
          onClick={() => {
            setActiveTab("accounts");
            setActiveView("home");
          }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "accounts"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          账号管理
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "tasks"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          任务
          {taskQueue.filter(
            (t) => t.status === "pending" || t.status === "running",
          ).length > 0 && (
            <span className="absolute top-2 right-4 w-2 h-2 bg-primary rounded-full animate-pulse"></span>
          )}
        </button>
      </nav>

      {/* Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === "status" && (
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">连接状态</span>
                <div className="flex items-center space-x-2">
                  <span
                    className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                  ></span>
                  <span
                    className={`text-sm font-medium ${isConnected ? "text-green-400" : "text-red-400"}`}
                  >
                    {isConnected ? "已连接" : "未连接"}
                  </span>
                </div>
              </div>
              {serverUrl && (
                <div className="text-xs text-gray-500 truncate bg-black/20 p-2 rounded">
                  {serverUrl}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-xl p-4 border border-border">
                <div className="text-2xl font-bold text-primary">
                  {taskCount}
                </div>
                <div className="text-xs text-gray-400">已执行任务</div>
              </div>
              <div className="bg-card rounded-xl p-4 border border-border">
                <div className="text-sm font-medium text-white truncate h-8 flex items-end">
                  {lastSync ? new Date(lastSync).toLocaleTimeString() : "--"}
                </div>
                <div className="text-xs text-gray-400">最后同步</div>
              </div>
            </div>

            {/* Task Overview */}
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">任务概览</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {taskQueue.filter((t) => t.status === "pending").length}{" "}
                    待执行
                  </span>
                  <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
                    {taskQueue.filter((t) => t.status === "completed").length}{" "}
                    已完成
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              {taskQueue.length > 0 && (
                <div className="w-full bg-slate-900 rounded-full h-1.5 mb-4 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-500"
                    style={{
                      width: `${(taskQueue.filter((t) => t.status === "completed").length / taskQueue.length) * 100}%`,
                    }}
                  ></div>
                </div>
              )}

              <div
                className={`p-3 rounded-lg border ${activeTask ? "bg-primary/5 border-primary/20" : "bg-slate-900/50 border-border/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {activeTask && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                    )}
                    <span className="text-xs text-gray-400">当前执行</span>
                  </div>
                </div>
                {activeTask ? (
                  <p className="text-sm text-primary font-medium mt-1 truncate">
                    {activeTask}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic mt-1">
                    暂无进行中的任务
                  </p>
                )}
              </div>
            </div>

            {/* Capture Preview (New for debugging) */}
            {lastCapture && (
              <div className="bg-card rounded-xl p-4 border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-primary">
                    本地拦截预览
                  </h3>
                  <span className="text-[10px] text-gray-500">
                    {new Date(lastCapture.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">平台:</span>
                    <span className="text-white uppercase">
                      {lastCapture.platform}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">类型:</span>
                    <span className="text-white">
                      {lastCapture.isSSR ? "SSR 数据" : "API 数据"}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">数据大小:</span>
                    <span className="text-white">
                      {(lastCapture.dataLength / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] bg-black/40 p-2 rounded font-mono text-gray-300 break-all max-h-[60px] overflow-y-auto">
                    {lastCapture.bodyPreview}...
                  </div>
                </div>
              </div>
            )}

            {/* Task Logs */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-semibold text-white">任务日志</h3>
                  <div className="flex items-center bg-black/20 rounded-lg p-0.5">
                    {["all", "info", "warn", "error"].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setLogFilter(lvl as any)}
                        className={`px-2 py-0.5 text-[9px] rounded uppercase ${
                          logFilter === lvl
                            ? "bg-primary text-white"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {lvl === "all" ? "全部" : lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                  实时流
                </span>
              </div>
              <div className="p-2 space-y-1 max-h-[180px] overflow-y-auto font-mono text-[11px] bg-black/20">
                {logs.filter(
                  (l) => logFilter === "all" || l.level === logFilter,
                ).length > 0 ? (
                  logs
                    .filter((l) => logFilter === "all" || l.level === logFilter)
                    .slice(0, 30) // Show more now that it's scrollable
                    .map((log, i) => (
                      <div
                        key={i}
                        className={`pl-2 py-0.5 border-l-2 ${
                          log.level === "error"
                            ? "text-red-400 border-red-500/50"
                            : log.level === "warn"
                              ? "text-amber-400 border-amber-500/50"
                              : log.level === "success"
                                ? "text-green-400 border-green-500/50"
                                : "text-gray-400 border-border"
                        }`}
                      >
                        <span className="opacity-40 mr-1">
                          [{log.timestamp}]
                        </span>
                        {log.message}
                      </div>
                    ))
                ) : (
                  <p className="text-gray-600 text-center py-4 text-xs italic">
                    暂无满足条件的日志
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleSyncCookies}
                className="w-full py-3 px-4 bg-primary text-white hover:bg-primary/90 rounded-xl font-medium shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                立即同步 Cookie
              </button>
              <button
                onClick={handleUnbind}
                className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm transition-colors"
                style={{ height: "48px" }}
              >
                解除绑定
              </button>
            </div>
          </div>
        )}

        {activeTab === "bind" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">服务器地址</label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">API Token</label>
              <input
                type="password"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-gray-500">
                在 GrowHub 后台 → 个人设置 → API Token 获取
              </p>
            </div>
            <button
              onClick={handleBind}
              disabled={saving || !inputUrl || !inputToken}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/80 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? "验证中..." : "绑定服务"}
            </button>
          </div>
        )}

        {activeTab === "accounts" && (
          <div className="space-y-4">
            {activeView === "home" && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-400">
                  目前支持的平台
                </h2>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: "xhs", name: "小红书", icon: "📕" },
                    { id: "dy", name: "抖音", icon: "🎵" },
                    { id: "ks", name: "快手", icon: "📹" },
                    { id: "bili", name: "B站", icon: "📺" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPlatform(p.id);
                        setActiveView("accounts");
                        loadCurrentCookies(p.id);
                      }}
                      className="flex items-center justify-between p-4 bg-card hover:bg-white/5 border border-border rounded-xl transition-all group"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">{p.icon}</span>
                        <span className="font-medium text-white">{p.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {p.id === "xhs" && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              const keyword = prompt("输入测试关键词:", "冥想");
                              if (keyword) {
                                chrome.runtime.sendMessage({
                                  type: "TEST_TASK",
                                  platform: "xhs",
                                  url: `https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?keyword=${encodeURIComponent(keyword)}`,
                                });
                                alert("测试指令已发送，请观察浏览器是否跳转");
                              }
                            }}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-gray-300"
                          >
                            测试
                          </div>
                        )}
                        <span className="text-gray-500 group-hover:text-primary transition-colors">
                          →
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeView === "accounts" && selectedPlatform && (
              <div className="space-y-6 animate-in slide-in-from-right duration-200">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setActiveView("home")}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    ←
                  </button>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    {selectedPlatform === "xhs"
                      ? "小红书"
                      : selectedPlatform === "dy"
                        ? "抖音"
                        : selectedPlatform.toUpperCase()}{" "}
                    账号管理
                  </h2>
                </div>

                {/* Current Account Card */}
                <div className="bg-card rounded-xl border border-primary/20 p-4 space-y-3 shadow-lg shadow-primary/5">
                  <h3 className="text-xs font-semibold text-primary uppercase">
                    当前浏览器账号
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 overflow-hidden">
                        {currentProfile?.avatar ? (
                          <img
                            src={currentProfile.avatar}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          "👤"
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {currentProfile?.isLoggedIn
                            ? currentProfile.nickname
                            : loadingCookies
                              ? "检测中..."
                              : "未登录 / 登录已过期"}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {currentProfile?.isLoggedIn
                            ? `ID: ${currentProfile.userId}`
                            : currentCookies.length > 0
                              ? `已获取 ${currentCookies.length} 项数据 (凭证不完整)`
                              : "请先在浏览器登录该平台"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleCopyCK(currentCookies)}
                        disabled={currentCookies.length === 0}
                        title="复制 CK"
                        className="p-2 hover:bg-white/5 text-gray-400 hover:text-primary rounded-lg transition-colors disabled:opacity-30"
                      >
                        📄
                      </button>
                      <button
                        onClick={() => handleSaveAccount(selectedPlatform)}
                        disabled={currentCookies.length === 0}
                        title="保存到本地 (只要有Cookie即可)"
                        className="p-2 hover:bg-white/5 text-gray-400 hover:text-green-400 rounded-lg transition-colors disabled:opacity-30"
                      >
                        💾
                      </button>
                      <button
                        onClick={() => loadCurrentCookies(selectedPlatform)}
                        title="刷新"
                        className={`p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors ${loadingCookies ? "animate-spin" : ""}`}
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                </div>

                {/* Saved Accounts */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase px-1">
                    已保存账号
                  </h3>
                  <div className="space-y-2">
                    {usePluginStore.getState().savedAccounts[selectedPlatform]
                      ?.length > 0 ? (
                      usePluginStore
                        .getState()
                        .savedAccounts[selectedPlatform].map((acc) => (
                          <div
                            key={acc.id}
                            className="bg-card rounded-lg border border-border p-3 flex items-center justify-between group"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm border border-border">
                                🆔
                              </div>
                              <div className="max-w-[120px]">
                                <div className="text-sm font-medium text-white truncate">
                                  {acc.name}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  {new Date(acc.savedAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleSwitchAccount(acc.cookies)}
                                className="px-2 py-1 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 rounded font-medium"
                              >
                                切换
                              </button>
                              <button
                                onClick={() => handleCopyCK(acc.cookies)}
                                className="px-2 py-1 text-[10px] bg-white/5 text-gray-400 hover:text-white rounded"
                              >
                                复制
                              </button>
                              <button
                                onClick={() =>
                                  usePluginStore
                                    .getState()
                                    .deleteAccount(selectedPlatform, acc.id)
                                }
                                className="px-2 py-1 text-[10px] bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-8 bg-black/10 rounded-xl border border-dashed border-border text-gray-600 text-xs">
                        暂无已保存账号
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-4">
            {/* Running & Progress Info */}
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                任务队列 {taskQueue.length > 0 ? `(${taskQueue.length})` : ""}
              </h2>
              <button
                onClick={() => chrome.storage.local.set({ taskQueue: [] })}
                className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
              >
                清除历史
              </button>
            </div>

            {/* Running Tasks */}
            {taskQueue.some((t) => t.status === "running") && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xl">⚙️</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-primary uppercase">
                      正在执行
                    </div>
                    {taskQueue
                      .filter((t) => t.status === "running")
                      .map((task) => (
                        <div key={task.task_id} className="mt-1">
                          <div className="text-sm text-white font-medium truncate">
                            {task.task_type}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {task.url}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* List with Tabs within Tasks */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex border-b border-border bg-black/20">
                <div className="flex-1 py-2 text-center text-[10px] font-bold text-gray-400 border-r border-border">
                  待处理 (
                  {taskQueue.filter((t) => t.status === "pending").length})
                </div>
                <div className="flex-1 py-2 text-center text-[10px] font-bold text-gray-400">
                  已完成 (
                  {
                    taskQueue.filter(
                      (t) => t.status === "completed" || t.status === "failed",
                    ).length
                  }
                  )
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto divide-y divide-border/30">
                {taskQueue.length > 0 ? (
                  taskQueue
                    .sort((a, b) =>
                      (b.created_at || "").localeCompare(a.created_at || ""),
                    )
                    .map((task) => (
                      <div
                        key={task.task_id}
                        className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                              task.status === "completed"
                                ? "bg-green-500/10 text-green-500"
                                : task.status === "failed"
                                  ? "bg-red-500/10 text-red-500"
                                  : task.status === "running"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-black/30 text-gray-500"
                            }`}
                          >
                            {task.platform === "xhs"
                              ? "📕"
                              : task.platform === "dy"
                                ? "🎵"
                                : task.platform === "bili"
                                  ? "📺"
                                  : task.platform === "wb"
                                    ? "👁️"
                                    : task.platform === "ks"
                                      ? "📹"
                                      : "📱"}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {task.task_type}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500 italic">
                                {task.created_at
                                  ? new Date(
                                      task.created_at,
                                    ).toLocaleTimeString()
                                  : "--"}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                  task.status === "completed"
                                    ? "bg-green-500/20 text-green-400"
                                    : task.status === "failed"
                                      ? "bg-red-500/20 text-red-400"
                                      : task.status === "running"
                                        ? "bg-primary/20 text-primary"
                                        : "bg-slate-800 text-gray-500"
                                }`}
                              >
                                {task.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        {task.status === "completed" && (
                          <span className="text-green-500">✓</span>
                        )}
                      </div>
                    ))
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-3xl mb-2 opacity-20">📥</div>
                    <p className="text-sm text-gray-500">暂无任务数据</p>
                  </div>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-primary/5 rounded-xl border border-primary/10 p-4">
              <h4 className="text-[10px] font-bold text-primary uppercase mb-1 flex items-center gap-1">
                <span>💡</span> 任务来源与执行
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                任务由 GrowHub
                后台分发，插件将自动按队列顺序执行。若长时间无任务，请检查
                WebSocket 连接状态或刷新页面。
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 border-t border-border text-center text-xs text-gray-500">
        GrowHub v{chrome.runtime.getManifest().version}
      </footer>
    </div>
  );
}
