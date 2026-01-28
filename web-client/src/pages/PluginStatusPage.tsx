import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Users,
  Zap,
  Copy,
  Check,
} from "lucide-react";

interface PluginStatus {
  user_id: string;
  username: string;
  connected: boolean;
  connected_at: string | null;
  last_ping: string | null;
  task_count: number;
}

interface OnlineUser {
  user_id: string;
  username: string;
  connected_at: string;
  last_ping: string;
  task_count: number;
}

interface OnlineUsersResponse {
  online_count: number;
  users: OnlineUser[];
}

export default function PluginStatusPage() {
  const [myStatus, setMyStatus] = useState<PluginStatus | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUsersResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [statusRes, usersRes] = await Promise.all([
        fetch("/api/plugin/status", { headers }),
        fetch("/api/plugin/online-users", { headers }),
      ]);

      if (!statusRes.ok) throw new Error("Failed to fetch plugin status");
      if (!usersRes.ok) throw new Error("Failed to fetch online users");

      const statusData = await statusRes.json();
      const usersData = await usersRes.json();

      setMyStatus(statusData);
      setOnlineUsers(usersData);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to load plugin status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "--";
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  const formatDuration = (isoString: string | null) => {
    if (!isoString) return "--";
    const start = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

    if (diff < 60) return `${diff}秒`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟`;
    return `${Math.floor(diff / 3600)}小时 ${Math.floor((diff % 3600) / 60)}分钟`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">插件状态监控</h1>
          <p className="text-gray-400 text-sm mt-1">
            监控浏览器插件连接状态和任务执行情况
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* My Plugin Status */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-400" />
          我的插件状态
        </h2>

        {myStatus ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Connection Status */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                {myStatus.connected ? (
                  <Wifi className="w-6 h-6 text-green-400" />
                ) : (
                  <WifiOff className="w-6 h-6 text-red-400" />
                )}
                <span
                  className={`text-lg font-medium ${myStatus.connected ? "text-green-400" : "text-red-400"}`}
                >
                  {myStatus.connected ? "已连接" : "未连接"}
                </span>
              </div>
              <p className="text-xs text-gray-500">用户: {myStatus.username}</p>
            </div>

            {/* Connected Duration */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">连接时长</span>
              </div>
              <p className="text-xl font-semibold text-white">
                {myStatus.connected
                  ? formatDuration(myStatus.connected_at)
                  : "--"}
              </p>
            </div>

            {/* Last Ping */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">最后心跳</span>
              </div>
              <p className="text-xl font-semibold text-white">
                {formatTime(myStatus.last_ping)}
              </p>
            </div>

            {/* Task Count */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">已执行任务</span>
              </div>
              <p className="text-xl font-semibold text-indigo-400">
                {myStatus.task_count}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            {loading ? "加载中..." : "无法获取插件状态"}
          </div>
        )}

        {/* Installation Guide & Binding Params */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5">
            <h3 className="text-indigo-300 font-semibold mb-3 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              如何连接插件？
            </h3>
            <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
              <li>
                构建插件:{" "}
                <code className="bg-slate-900 px-2 py-0.5 rounded text-xs">
                  cd browser-plugin && npm run build
                </code>
              </li>
              <li>
                打开 Chrome 扩展程序页面:{" "}
                <code className="bg-slate-900 px-2 py-0.5 rounded text-xs text-indigo-400">
                  chrome://extensions/
                </code>
              </li>
              <li>开启「开发者模式」并「加载已解压的扩展程序」</li>
              <li>
                选择项目中的{" "}
                <code className="bg-slate-900 px-2 py-0.5 rounded text-xs text-indigo-400">
                  browser-plugin/dist
                </code>{" "}
                目录
              </li>
              <li>在插件面板的「服务绑定」页面输入下方参数</li>
            </ol>
          </div>

          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold mb-1">绑定参数</h3>

            {/* Server URL */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">
                服务器地址 (Server URL)
              </label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black/30 border border-white/5 px-3 py-2 rounded text-indigo-400 text-xs font-mono truncate">
                  {window.location.protocol}//{window.location.hostname}:8040
                </code>
                <button
                  onClick={(e) => {
                    navigator.clipboard.writeText(
                      `${window.location.protocol}//${window.location.hostname}:8040`,
                    );
                    const btn = e.currentTarget;
                    const icon = btn.querySelector(".copy-icon");
                    const check = btn.querySelector(".check-icon");
                    icon?.classList.add("hidden");
                    check?.classList.remove("hidden");
                    setTimeout(() => {
                      icon?.classList.remove("hidden");
                      check?.classList.add("hidden");
                    }, 2000);
                  }}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                  title="复制地址"
                >
                  <Copy className="w-4 h-4 text-gray-400 group-hover:text-white copy-icon" />
                  <Check className="w-4 h-4 text-green-500 hidden check-icon" />
                </button>
              </div>
            </div>

            {/* API Token */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">API Token</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black/30 border border-white/5 px-3 py-2 rounded text-indigo-400 text-xs font-mono truncate">
                  {localStorage.getItem("token") || "需登录后获取"}
                </code>
                <button
                  onClick={(e) => {
                    navigator.clipboard.writeText(
                      localStorage.getItem("token") || "",
                    );
                    const btn = e.currentTarget;
                    const icon = btn.querySelector(".copy-icon");
                    const check = btn.querySelector(".check-icon");
                    icon?.classList.add("hidden");
                    check?.classList.remove("hidden");
                    setTimeout(() => {
                      icon?.classList.remove("hidden");
                      check?.classList.add("hidden");
                    }, 2000);
                  }}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                  title="复制 Token"
                >
                  <Copy className="w-4 h-4 text-gray-400 group-hover:text-white copy-icon" />
                  <Check className="w-4 h-4 text-green-500 hidden check-icon" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Online Users List */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-green-400" />
          在线插件
          {onlineUsers && (
            <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-sm rounded-full">
              {onlineUsers.online_count} 在线
            </span>
          )}
        </h2>

        {onlineUsers && onlineUsers.users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                    用户
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                    连接时间
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                    最后心跳
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                    执行任务数
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {onlineUsers.users.map((user) => (
                  <tr
                    key={user.user_id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30"
                  >
                    <td className="py-3 px-4">
                      <span className="text-white font-medium">
                        {user.username}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {formatTime(user.connected_at)}
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {formatTime(user.last_ping)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-indigo-400 font-medium">
                        {user.task_count}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                        在线
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            {loading ? "加载中..." : "暂无在线插件"}
          </div>
        )}
      </div>

      {/* Last Refresh */}
      <p className="text-xs text-gray-500 text-center">
        最后刷新: {lastRefresh.toLocaleTimeString()} (每 10 秒自动刷新)
      </p>
    </div>
  );
}
