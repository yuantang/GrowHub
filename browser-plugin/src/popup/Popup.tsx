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
  } = usePluginStore();
  const [activeTab, setActiveTab] = useState<Tab>(
    serverUrl ? "status" : "bind",
  );
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(apiToken);
  const [saving, setSaving] = useState(false);

  // V5 Navigation: Internal view state within "accounts" tab
  const [activeView, setActiveView] = useState<View>("home");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  // Current session cookies for real-time display
  const [currentCookies, setCurrentCookies] = useState<any[]>([]);
  const [loadingCookies, setLoadingCookies] = useState(false);

  // V4 Optimization: Immediate status sync and polling
  useEffect(() => {
    // 1. Initial fresh pull from storage
    chrome.storage.local
      .get(["isConnected", "taskCount", "lastSync", "activeTask", "logs"])
      .then((data) => {
        usePluginStore.setState({
          isConnected: !!data.isConnected,
          taskCount: data.taskCount || 0,
          lastSync: data.lastSync || null,
          activeTask: data.activeTask || null,
          logs: data.logs || [],
        });
      });

    // 2. Continuous polling (Fallback for storage listener)
    const interval = setInterval(() => {
      chrome.storage.local
        .get(["isConnected", "taskCount", "activeTask"])
        .then((data) => {
          if (data.isConnected !== isConnected) {
            usePluginStore.setState({ isConnected: !!data.isConnected });
          }
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

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
    const platformConfigs: Record<string, string[]> = {
      xhs: [".xiaohongshu.com", "xiaohongshu.com"],
      dy: [".douyin.com", "douyin.com"],
      ks: [".kuaishou.com", "kuaishou.com"],
      bili: [".bilibili.com", "bilibili.com"],
    };

    const domains = platformConfigs[platform] || [];
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

  const handleSwitchAccount = async (cookies: any[]) => {
    if (!confirm("确定要切换到该账号吗？当前浏览器的登录状态将被覆盖。"))
      return;

    for (const c of cookies) {
      const url = `https://${c.domain.startsWith(".") ? c.domain.substring(1) : c.domain}${c.path}`;
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
    }

    alert("切换成功！请刷新页面查看。");
    // Trigger sync
    chrome.runtime.sendMessage({ type: "MANUAL_SYNC_COOKIES" });
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

            {/* Active Task */}
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">当前任务</h3>
                {activeTask && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </div>
              <div
                className={`p-3 rounded-lg border ${activeTask ? "bg-primary/5 border-primary/20" : "bg-slate-900/50 border-border/50"}`}
              >
                {activeTask ? (
                  <p className="text-sm text-primary font-medium">
                    {activeTask}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    暂无进行中的任务
                  </p>
                )}
              </div>
            </div>

            {/* Task Logs */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">任务日志</h3>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                  最近 10 条
                </span>
              </div>
              <div className="p-2 space-y-1 max-h-[150px] overflow-y-auto font-mono text-[11px]">
                {logs.length > 0 ? (
                  logs.slice(0, 10).map((log, i) => (
                    <div
                      key={i}
                      className="text-gray-400 border-l border-border pl-2 py-0.5"
                    >
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600 text-center py-4">暂无日志记录</p>
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
                      <span className="text-gray-500 group-hover:text-primary transition-colors">
                        →
                      </span>
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
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        👤
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          实时检测中...
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {currentCookies.length > 0
                            ? `已获取 ${currentCookies.length} 项数据`
                            : "未检测到有效 Cookie"}
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
                        title="保存到本地"
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
            {/* Running Tasks */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <span className="flex h-2 w-2 relative">
                  {taskQueue.some((t) => t.status === "running") && (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </>
                  )}
                </span>
                执行中
              </h3>
              {taskQueue.filter((t) => t.status === "running").length > 0 ? (
                taskQueue
                  .filter((t) => t.status === "running")
                  .map((task) => (
                    <div
                      key={task.task_id}
                      className="bg-primary/5 border border-primary/20 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {task.platform === "xhs"
                              ? "📕"
                              : task.platform === "dy"
                                ? "🎵"
                                : "📱"}
                          </span>
                          <div>
                            <div className="text-sm text-white">
                              {task.task_type}
                            </div>
                            <div className="text-xs text-gray-500 truncate max-w-[200px]">
                              {task.url}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {task.created_at
                            ? new Date(task.created_at).toLocaleTimeString()
                            : "--"}
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-gray-500 italic">暂无执行中任务</p>
              )}
            </div>

            {/* Pending Tasks */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-white mb-3">
                ⏳ 待执行 (
                {taskQueue.filter((t) => t.status === "pending").length})
              </h3>
              {taskQueue.filter((t) => t.status === "pending").length > 0 ? (
                <div className="space-y-2">
                  {taskQueue
                    .filter((t) => t.status === "pending")
                    .slice(0, 5)
                    .map((task) => (
                      <div
                        key={task.task_id}
                        className="flex items-center justify-between p-2 bg-black/20 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {task.platform === "xhs"
                              ? "📕"
                              : task.platform === "dy"
                                ? "🎵"
                                : "📱"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {task.task_type}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {task.created_at
                            ? new Date(task.created_at).toLocaleTimeString()
                            : "--"}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">暂无待执行任务</p>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-black/20 rounded-xl border border-border/50 p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                💡 任务来源
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                任务由 GrowHub
                后台自动下发。保持插件连接状态，后台配置的采集任务将自动分配到此执行。
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 border-t border-border text-center text-xs text-gray-500">
        GrowHub v1.0.0
      </footer>
    </div>
  );
}
