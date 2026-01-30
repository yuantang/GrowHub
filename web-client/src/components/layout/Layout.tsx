import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  Github,
  Rocket,
  Settings,
  Flame,
  Sparkles,
  Shield,
  FolderOpen,
  Users,
  AlertTriangle,
  Bell,
  UserCog,
  Plug,
} from "lucide-react";
import { cn } from "@/utils/cn";

import { LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  // 重构后的导航结构
  let navItems = [
    // 核心入口
    { to: "/", icon: LayoutDashboard, label: "总览" },
    { to: "/projects", icon: FolderOpen, label: "监控项目", highlight: true },

    // 数据洞察
    { to: "/data", icon: Database, label: "数据管理" },
    { to: "/creators", icon: Users, label: "达人博主" },
    { to: "/hotspots", icon: Flame, label: "热点排行" },
    { to: "/sentiment", icon: AlertTriangle, label: "舆情监控" },

    // 工具
    { to: "/ai-creator", icon: Sparkles, label: "AI 创作" },

    // 系统配置
    { to: "/account-pool", icon: Shield, label: "账号池" },
    { to: "/notifications", icon: Bell, label: "通知配置" },
    { to: "/plugin-status", icon: Plug, label: "插件状态" },
  ];

  if (user?.role === "admin") {
    navItems.push({ to: "/settings", icon: Settings, label: "系统设置" });
    navItems.push({ to: "/admin/users", icon: UserCog, label: "用户管理" });
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Rocket className="w-6 h-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">GrowHub</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center px-4 py-3 rounded-lg transition-all duration-200 group text-sm font-medium",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          {user ? (
            <div className="flex flex-col space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden border border-primary/20">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium truncate">
                    {user.username}
                  </div>
                  <div className="flex items-center mt-1">
                    <div
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider",
                        user.role === "admin"
                          ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20",
                      )}
                    >
                      {user.role}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors border border-transparent hover:border-red-500/20"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </button>
            </div>
          ) : (
            <a
              href="https://github.com/yuantang/GrowHub"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-3 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all text-sm font-medium"
            >
              <Github className="w-5 h-5 mr-3" />
              GitHub
            </a>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 z-10">
          <div className="font-semibold text-lg flex items-center">
            {navItems.find((i) => i.to === location.pathname)?.label ||
              "Dashboard"}
          </div>
          <div className="flex items-center space-x-4">
            {/* Add Status Indicator or something here */}
            <div className="flex items-center space-x-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span>系统在线</span>
            </div>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-background/50">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
