import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Activity, Github, Rocket, Hash, Bell, Settings, Filter, Flame, Sparkles, Calendar, Shield, FolderOpen } from 'lucide-react';
import { cn } from '@/utils/cn';

const Layout: React.FC = () => {
    const location = useLocation();

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: '控制台' },
        { to: '/data', icon: Database, label: '数据管理' },
        { to: '/analysis', icon: Activity, label: '数据分析' },
        // GrowHub Core - 监控项目作为核心入口
        { to: '/projects', icon: FolderOpen, label: '监控项目', isNew: true, highlight: true },
        { to: '/keywords', icon: Hash, label: '关键词管理' },
        { to: '/monitor', icon: Bell, label: '内容监控' },
        { to: '/hotspots', icon: Flame, label: '热点排行' },
        { to: '/ai-creator', icon: Sparkles, label: 'AI 创作' },
        // Automation
        { to: '/scheduler', icon: Calendar, label: '任务调度' },
        { to: '/account-pool', icon: Shield, label: '账号池' },
        // Settings
        { to: '/rules', icon: Filter, label: '分发规则' },
        { to: '/notifications', icon: Settings, label: '通知配置' },
    ];

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
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                )
                            }
                        >
                            <item.icon className="w-5 h-5 mr-3" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-border">
                    <a
                        href="https://github.com/NanmiCoder/MediaCrawler"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center px-4 py-3 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all text-sm font-medium"
                    >
                        <Github className="w-5 h-5 mr-3" />
                        GitHub
                    </a>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 z-10">
                    <div className="font-semibold text-lg flex items-center">
                        {navItems.find(i => i.to === location.pathname)?.label || 'Dashboard'}
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
