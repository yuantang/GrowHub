import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  EyeOff,
  Search,
  Activity,
  Smartphone,
  QrCode,
  Loader2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  fetchGrowHubAccounts,
  fetchGrowHubAccount,
  fetchGrowHubAccountStats,
  addGrowHubAccount,
  checkGrowHubAccountHealth,
  checkAllGrowHubAccounts,
  deleteGrowHubAccount,
  startGrowHubQRLogin,
  getGrowHubQRLoginStatus,
  cancelGrowHubQRLogin,
  type GrowHubAccount as Account,
  type GrowHubAccountStats as Statistics,
} from "@/api";

// Types are now imported from @/api

const PLATFORM_LABELS: Record<string, string> = {
  xhs: "小红书",
  douyin: "抖音",
  bilibili: "B站",
  weibo: "微博",
  zhihu: "知乎",
  kuaishou: "快手",
  tieba: "贴吧",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  active: { label: "正常", color: "text-green-500", icon: CheckCircle },
  cooldown: { label: "冷却中", color: "text-yellow-500", icon: Activity },
  expired: { label: "已过期", color: "text-red-500", icon: XCircle },
  banned: { label: "已封禁", color: "text-red-600", icon: AlertTriangle },
  unknown: { label: "未检测", color: "text-gray-500", icon: Shield },
};

const AccountPoolPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCookies, setShowCookies] = useState<Record<string, boolean>>({});
  const [filterPlatform, setFilterPlatform] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null); // 正在检测的账号ID

  // Add form
  const [newAccount, setNewAccount] = useState({
    platform: "xhs",
    account_name: "",
    cookies: "",
    group: "default",
    notes: "",
  });

  // Cookie guide state
  const [showCookieGuide, setShowCookieGuide] = useState(false);

  // QR Login state
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPlatform, setQRPlatform] = useState("xhs");
  const [qrLoading, setQRLoading] = useState(false);
  const [qrSession, setQRSession] = useState<{
    session_id: string;
    qr_image: string;
    status: string;
    message?: string;
  } | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAccounts();
    fetchStatistics();
  }, [filterPlatform, filterStatus]);

  const fetchAccounts = async () => {
    try {
      const data = await fetchGrowHubAccounts(filterPlatform, filterStatus);
      setAccounts(data.items || []);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  const fetchStatistics = async () => {
    try {
      const data = await fetchGrowHubAccountStats();
      setStatistics(data);
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    }
  };

  const addAccount = async () => {
    if (!newAccount.account_name || !newAccount.cookies) return;

    setLoading(true);
    try {
      await addGrowHubAccount(newAccount);
      setShowAddModal(false);
      setNewAccount({
        platform: "xhs",
        account_name: "",
        cookies: "",
        group: "default",
        notes: "",
      });
      fetchAccounts();
      fetchStatistics();
      alert("✅ 账号添加成功！");
    } catch (error: any) {
      console.error("Failed to add account:", error);
      const errorMsg =
        error.response?.data?.detail || error.message || "网络错误";
      alert(`❌ 添加失败: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const checkAccountHealth = async (accountId: string) => {
    setCheckingId(accountId);
    try {
      const data = await checkGrowHubAccountHealth(accountId);
      await fetchAccounts();
      await fetchStatistics();
      // 显示检测结果
      const status = data.account?.status;
      if (status === "active") {
        alert("✅ 账号状态正常！");
      } else {
        alert(
          `⚠️ 账号状态: ${status || "未知"}\n${data.check_result?.message || "检测完成"}`,
        );
      }
    } catch (error) {
      console.error("Failed to check account:", error);
      alert("❌ 检测失败，请稍后重试");
    } finally {
      setCheckingId(null);
    }
  };

  const checkAllAccounts = async () => {
    setLoading(true);
    try {
      await checkAllGrowHubAccounts();
      fetchAccounts();
      fetchStatistics();
    } catch (error) {
      console.error("Failed to check all accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  const handleDeleteClick = (accountId: string) => {
    setAccountToDelete(accountId);
  };

  const confirmDelete = async () => {
    if (!accountToDelete) return;
    const accountId = accountToDelete;
    setAccountToDelete(null); // Close modal immediately

    try {
      console.log(`Sending DELETE request for account: ${accountId}`);
      await deleteGrowHubAccount(accountId);
      console.log("Delete successful, refreshing list...");
      fetchAccounts();
      fetchStatistics();
    } catch (error: any) {
      console.error("Failed to delete account:", error);
      alert(`❌ 删除失败: ${error.response?.data?.detail || "未知错误"}`);
    }
  };

  const toggleShowCookies = (accountId: string) => {
    setShowCookies((prev) => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    if (score >= 30) return "bg-orange-500";
    return "bg-red-500";
  };

  // QR Login functions
  const startQRLogin = async () => {
    setQRLoading(true);
    setQRSession(null);

    try {
      const data = await startGrowHubQRLogin(qrPlatform);

      if (data.success) {
        setQRSession({
          session_id: data.session_id,
          qr_image: data.qr_image,
          status: "pending",
          message: "请使用手机 App 扫描二维码",
        });

        // Start polling for status
        startStatusPolling(data.session_id);
      } else {
        setQRSession({
          session_id: "",
          qr_image: "",
          status: "error",
          message: data.error || "启动扫码登录失败",
        });
      }
    } catch (error) {
      setQRSession({
        session_id: "",
        qr_image: "",
        status: "error",
        message: "网络错误，请重试",
      });
    } finally {
      setQRLoading(false);
    }
  };

  const startStatusPolling = (sessionId: string) => {
    // Clear existing poll
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
    }

    qrPollRef.current = setInterval(async () => {
      try {
        const data = await getGrowHubQRLoginStatus(sessionId);

        if (data.status === "success") {
          // Login successful!
          clearInterval(qrPollRef.current!);
          setQRSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: "success",
                  message: data.message || "登录成功！账号已自动添加",
                }
              : null,
          );

          // Refresh account list
          setTimeout(() => {
            fetchAccounts();
            fetchStatistics();
            setShowQRModal(false);
            setQRSession(null);
          }, 2000);
        } else if (data.status === "expired" || data.status === "error") {
          clearInterval(qrPollRef.current!);
          setQRSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: data.status,
                  message:
                    data.status === "expired"
                      ? "二维码已过期，请重新获取"
                      : data.error || "登录失败",
                }
              : null,
          );
        } else if (data.status === "scanned") {
          setQRSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: "scanned",
                  message: "已扫码，请在手机上确认登录",
                }
              : null,
          );
        }
      } catch (error) {
        // Ignore polling errors
      }
    }, 2000);
  };

  const cancelQRLogin = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
    }
    if (qrSession?.session_id) {
      cancelGrowHubQRLogin(qrSession.session_id).catch(() => {});
    }
    setShowQRModal(false);
    setQRSession(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current);
      }
    };
  }, []);

  const filteredAccounts = accounts.filter((acc) =>
    acc.account_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-500" />
            账号资产管理
          </h1>
          <p className="text-muted-foreground mt-1">
            管理多平台账号池，实现智能轮询与健康监控
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={checkAllAccounts}
            disabled={loading}
          >
            <Shield className="w-4 h-4 mr-2" />
            批量检测
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowQRModal(true)}
            className="border-primary/50 text-primary hover:bg-primary/10"
          >
            <QrCode className="w-4 h-4 mr-2" />
            扫码添加
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            手动添加
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-5 gap-4">
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.total}</div>
              <div className="text-sm text-muted-foreground">总账号数</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">
                {statistics.by_status?.active || 0}
              </div>
              <div className="text-sm text-muted-foreground">正常可用</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">
                {(statistics.by_status?.expired || 0) +
                  (statistics.by_status?.banned || 0)}
              </div>
              <div className="text-sm text-muted-foreground">异常账号</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.avg_health}%</div>
              <div className="text-sm text-muted-foreground">平均健康度</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {statistics.success_rate}%
              </div>
              <div className="text-sm text-muted-foreground">成功率</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索账号名称..."
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg"
          />
        </div>
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-lg"
        >
          <option value="">全部平台</option>
          {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-background border border-border rounded-lg"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={() => {
            setFilterPlatform("");
            setFilterStatus("");
            setSearchTerm("");
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          重置
        </Button>
      </div>

      {/* Accounts Table */}
      <Card className="bg-card/50">
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="p-4">账号</th>
                <th className="p-4">平台</th>
                <th className="p-4">状态</th>
                <th className="p-4">健康度</th>
                <th className="p-4">使用统计</th>
                <th className="p-4">最后更新</th>
                <th className="p-4">Cookie</th>
                <th className="p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-12 text-center text-muted-foreground"
                  >
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无账号</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const statusConfig =
                    STATUS_CONFIG[acc.status] || STATUS_CONFIG.unknown;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr
                      key={acc.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="p-4">
                        <div className="font-medium">{acc.account_name}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {acc.id}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded text-sm">
                          {PLATFORM_LABELS[acc.platform] || acc.platform}
                        </span>
                      </td>
                      <td className="p-4">
                        <div
                          className={`flex items-center gap-1 ${statusConfig.color}`}
                        >
                          <StatusIcon className="w-4 h-4" />
                          {statusConfig.label}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getHealthColor(acc.health_score)}`}
                              style={{ width: `${acc.health_score}%` }}
                            />
                          </div>
                          <span className="text-sm">{acc.health_score}%</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm">
                        <div>使用: {acc.use_count} 次</div>
                        <div className="text-muted-foreground">
                          成功: {acc.success_count} / 失败: {acc.fail_count}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {acc.updated_at
                          ? new Date(acc.updated_at).toLocaleString()
                          : "从未"}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded max-w-[150px] truncate">
                            {showCookies[acc.id] ? acc.cookies : "••••••••"}
                          </code>
                          <button
                            onClick={() => toggleShowCookies(acc.id)}
                            className="text-muted-foreground hover:text-foreground"
                            title={showCookies[acc.id] ? "隐藏" : "显示"}
                          >
                            {showCookies[acc.id] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                // Show loading toast? Or just do it quietly.
                                const fullAccount = await fetchGrowHubAccount(
                                  acc.id,
                                );
                                if (fullAccount && fullAccount.cookies) {
                                  navigator.clipboard.writeText(
                                    fullAccount.cookies,
                                  );
                                  toast.success("完整 Cookie 已复制到剪贴板");
                                } else {
                                  toast.error("未能获取完整 Cookie");
                                }
                              } catch (err) {
                                toast.error("获取账号详情失败");
                              }
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            title="复制完整 Cookie"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => checkAccountHealth(acc.id)}
                            title="检测健康"
                            disabled={checkingId === acc.id}
                          >
                            {checkingId === acc.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Shield className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(acc.id)}
                            className="text-red-500"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">添加账号</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  平台 *
                </label>
                <select
                  value={newAccount.platform}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, platform: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  账号名称 *
                </label>
                <input
                  type="text"
                  value={newAccount.account_name}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      account_name: e.target.value,
                    })
                  }
                  placeholder="给账号起个名字..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Cookie *
                </label>
                <textarea
                  value={newAccount.cookies}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, cookies: e.target.value })
                  }
                  placeholder="建议使用下方【方法一】获取，然后在此粘贴..."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg resize-none text-xs font-mono"
                />

                {/* Cookie 教程折叠面板 */}
                <div className="mt-2 border border-blue-500/20 bg-blue-500/5 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowCookieGuide(!showCookieGuide)}
                    className="w-full flex items-center justify-between p-3 text-xs font-medium text-blue-500 hover:bg-blue-500/10 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      小白教程：如何获取完整的 Cookie？
                    </span>
                    {showCookieGuide ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>

                  {showCookieGuide && (
                    <div className="p-3 pt-0 text-xs space-y-4">
                      <div className="bg-background/50 p-2 rounded border border-border/50">
                        <div className="font-bold text-green-500 mb-1">
                          方法一：控制台一键复制（推荐 ✨）
                        </div>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>在浏览器打开目标网站（如小红书）并登录</li>
                          <li>
                            按{" "}
                            <kbd className="px-1 py-0.5 bg-muted rounded border border-border font-sans">
                              F12
                            </kbd>{" "}
                            打开开发者工具，点击顶部标签栏的{" "}
                            <strong>控制台 (Console)</strong>
                          </li>
                          <li>
                            找到面板<strong>最底部</strong>的输入行（通常有一个{" "}
                            <span className="text-blue-500 font-bold">
                              &gt;
                            </span>{" "}
                            符号），粘贴代码并回车：
                          </li>
                        </ol>
                        <div className="mt-2 flex gap-2">
                          <code className="flex-1 bg-black/80 text-white p-2 rounded font-mono select-all">
                            copy(document.cookie)
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                "copy(document.cookie)",
                              );
                              alert("代码已复制！请去浏览器控制台粘贴回车即可");
                            }}
                            className="h-auto py-1"
                          >
                            复制
                          </Button>
                        </div>
                        <div className="mt-1 text-blue-500/80">
                          💡
                          提示：如果浏览器提示"禁止粘贴"，请先按提示输入“允许粘贴”并回车，然后再粘贴代码。
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          回车后如果显示 "undefined" 是正常的，Cookie
                          已自动复制到您的剪贴板！
                        </div>
                      </div>

                      <div className="space-y-1 text-muted-foreground border-t border-border/50 pt-2">
                        <div className="font-bold text-foreground">
                          方法二：Network 面板查找
                        </div>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>
                            按{" "}
                            <kbd className="px-1 py-0.5 bg-muted rounded border border-border font-sans">
                              F12
                            </kbd>{" "}
                            打开开发者工具，切到 <strong>网络 (Network)</strong>
                          </li>
                          <li>
                            <strong>刷新页面</strong>
                            ，点击第一个请求（通常是网站名）
                          </li>
                          <li>
                            在右侧 <strong>Headers</strong> 下找到{" "}
                            <strong>Request Headers</strong>
                          </li>
                          <li>
                            找到 <strong>Cookie</strong>{" "}
                            字段，复制冒号后的一长串字符
                          </li>
                        </ol>
                      </div>

                      <div className="flex items-start gap-2 text-orange-500 bg-orange-500/10 p-2 rounded">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          注意：不要在 <strong>Application/存储</strong>{" "}
                          面板（表格形式）一个个复制，那里是不完整的！我们需要的是包含所有参数的字符串。
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  分组
                </label>
                <input
                  type="text"
                  value={newAccount.group}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, group: e.target.value })
                  }
                  placeholder="default"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  备注
                </label>
                <input
                  type="text"
                  value={newAccount.notes}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, notes: e.target.value })
                  }
                  placeholder="可选..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                取消
              </Button>
              <Button
                onClick={addAccount}
                disabled={
                  loading || !newAccount.account_name || !newAccount.cookies
                }
              >
                添加账号
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* QR Login Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              扫码添加账号
            </h2>

            <p className="text-sm text-muted-foreground mb-4">
              选择平台后，用手机 App 扫描二维码登录，系统会自动获取 Cookie
            </p>

            {/* Platform Selection */}
            {!qrSession && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    选择平台
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "xhs", label: "小红书", emoji: "📕" },
                      { value: "douyin", label: "抖音", emoji: "🎵" },
                      { value: "bilibili", label: "B站", emoji: "📺" },
                      { value: "weibo", label: "微博", emoji: "📢" },
                    ].map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setQRPlatform(p.value)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          qrPlatform === p.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span className="text-xl mr-2">{p.emoji}</span>
                        <span className="font-medium">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={startQRLogin}
                  disabled={qrLoading}
                  className="w-full"
                >
                  {qrLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                      正在获取二维码...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" /> 获取登录二维码
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* QR Code Display */}
            {qrSession && (
              <div className="text-center space-y-4">
                {qrSession.status === "pending" ||
                qrSession.status === "scanned" ? (
                  <>
                    <div className="bg-white p-4 rounded-lg inline-block">
                      <img
                        src={`data:image/png;base64,${qrSession.qr_image}`}
                        alt="QR Code"
                        className="w-48 h-48 mx-auto"
                      />
                    </div>
                    <div
                      className={`text-sm flex items-center justify-center gap-2 ${
                        qrSession.status === "scanned"
                          ? "text-green-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {qrSession.status === "scanned" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {qrSession.message}
                    </div>
                  </>
                ) : qrSession.status === "success" ? (
                  <div className="py-8">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-medium text-green-500">
                      {qrSession.message}
                    </p>
                  </div>
                ) : (
                  <div className="py-4">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                    <p className="text-red-500 mb-4">{qrSession.message}</p>
                    <Button onClick={startQRLogin}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      重新获取
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button variant="outline" onClick={cancelQRLogin}>
                {qrSession?.status === "success" ? "完成" : "取消"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {accountToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-sm border border-border shadow-lg">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold">确认删除账号？</h3>
              <p className="text-sm text-muted-foreground mt-2">
                删除后无法恢复，且会清除该账号的所有历史记录。
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setAccountToDelete(null)}
              >
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPoolPage;
