import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Github,
  Rocket,
  Settings,
  Flame,
  Sparkles,
  Shield,
  FolderOpen,
  UserCog,
  LogOut,
  Clapperboard,
  BarChart3,
  Send,
  Image,
  History,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth } from "../../contexts/AuthContext";

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { to: "/projects", icon: FolderOpen, label: "热门抓取" },
    { to: "/hotspots", icon: Flame, label: "热点库" },
    { to: "/data-monitor", icon: BarChart3, label: "数据监控" },
    { to: "/remix-workflow", icon: Clapperboard, label: "内容创作" },
    { to: "/image-gen", icon: Image, label: "图文生成" },
    { to: "/image-gen-history", icon: History, label: "图文历史" },
    { to: "/auto-publish", icon: Send, label: "矩阵分发" },
    { to: "/account-pool", icon: Shield, label: "账号池" },
    { to: "/settings", icon: Settings, label: "系统设置" },
  ];

  if (user?.role === "admin") {
    navItems.push({ to: "/admin/users", icon: UserCog, label: "用户管理" });
  }

  const currentLabel =
    [
      ...navItems,
      { to: "/remix-workflow", label: "内容创作" },
      { to: "/ai-creator", label: "内容创作" },
      { to: "/image-gen", label: "图文生成" },
      { to: "/image-gen-history", label: "图文历史" }
    ].find(
      (i) =>
        location.pathname === i.to ||
        (i.to !== "/" && location.pathname.startsWith(i.to + "/")),
    )?.label || "GrowHub";

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
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
                  "flex items-center px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium",
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
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden text-sm font-medium truncate">
                  {user.username}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
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
              className="flex items-center px-4 py-3 rounded-lg text-muted-foreground hover:bg-muted/50 text-sm"
            >
              <Github className="w-5 h-5 mr-3" />
              GitHub
            </a>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card/50 flex items-center justify-between px-8">
          <div className="font-semibold text-lg">{currentLabel}</div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>系统在线</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-5 bg-background/50">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
