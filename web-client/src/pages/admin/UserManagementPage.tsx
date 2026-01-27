import React, { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAdminUsers,
  approveUser,
  disableUser,
  deleteUser,
  updateUserRole,
} from "../../api";
import type { User } from "../../api";
import {
  Loader2,
  Check,
  Ban,
  Trash2,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { cn } from "../../utils/cn";

const UserManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all"); // all, pending, active

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await getAdminUsers(filter === "all" ? undefined : filter);
      setUsers(data);
    } catch (err) {
      console.error("无法获取用户列表", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [filter]);

  const handleApprove = async (id: number) => {
    try {
      await approveUser(id);
      fetchUsers();
    } catch (err) {
      alert("批准用户失败");
    }
  };

  const handleDisable = async (id: number) => {
    if (!confirm("确定要禁用此用户吗？")) return;
    try {
      await disableUser(id);
      fetchUsers();
    } catch (err) {
      alert("禁用用户失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此用户吗？此操作无法撤销。")) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch (err) {
      alert("删除用户失败");
    }
  };

  const handleRoleChange = async (
    id: number,
    currentRole: "admin" | "user",
  ) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (
      !confirm(
        `确定要将此用户的角色更改为 ${newRole === "admin" ? "管理员" : "普通用户"} 吗？`,
      )
    )
      return;

    try {
      await updateUserRole(id, newRole);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || "更改角色失败");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Fallback if parsing fails
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "正常";
      case "pending":
        return "待审核";
      case "disabled":
        return "已禁用";
      default:
        return status;
    }
  };

  const getRoleLabel = (role: string) => {
    return role === "admin" ? "管理员" : "用户";
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-500">访问被拒绝</h2>
        <p className="mt-2 text-gray-500">只有管理员可以访问此页面。</p>
      </div>
    );
  }

  const filterOptions = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待审核" },
    { key: "active", label: "正常" },
    { key: "disabled", label: "已禁用" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">用户管理</h1>
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            {filterOptions.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted text-foreground border",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchUsers}
            className="p-2 hover:bg-muted rounded-full"
            title="刷新"
          >
            <Loader2 className={cn("w-5 h-5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">ID</th>
              <th className="p-4 font-medium">用户名</th>
              <th className="p-4 font-medium">邮箱</th>
              <th className="p-4 font-medium">角色</th>
              <th className="p-4 font-medium">状态</th>
              <th className="p-4 font-medium">创建时间</th>
              <th className="p-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/50">
                <td className="p-4">{u.id}</td>
                <td className="p-4 font-medium">{u.username}</td>
                <td className="p-4 text-muted-foreground">{u.email || "-"}</td>
                <td className="p-4">
                  <button
                    onClick={() =>
                      u.id !== user?.id && handleRoleChange(u.id, u.role)
                    }
                    className={cn(
                      "flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium transition-opacity",
                      u.id !== user?.id && "hover:opacity-80 cursor-pointer",
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                    )}
                    disabled={u.id === user?.id}
                    title={
                      u.id === user?.id ? "无法更改自己的角色" : "点击切换角色"
                    }
                  >
                    {u.role === "admin" ? (
                      <Shield className="w-3 h-3 mr-1" />
                    ) : (
                      <UserIcon className="w-3 h-3 mr-1" />
                    )}
                    {getRoleLabel(u.role)}
                  </button>
                </td>
                <td className="p-4">
                  <span
                    className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      u.status === "active"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : u.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                    )}
                  >
                    {getStatusLabel(u.status)}
                  </span>
                </td>
                <td className="p-4 text-muted-foreground">
                  {formatDate(u.created_at)}
                </td>
                <td className="p-4 text-right space-x-2">
                  {u.status === "pending" && (
                    <button
                      onClick={() => handleApprove(u.id)}
                      className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded"
                      title="批准"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {u.status === "active" && u.id !== user?.id && (
                    <button
                      onClick={() => handleDisable(u.id)}
                      className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 rounded"
                      title="禁用"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {u.id !== user?.id && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-muted-foreground"
                >
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagementPage;
