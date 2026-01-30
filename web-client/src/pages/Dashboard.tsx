import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Loader2,
  Plus,
  Activity,
  AlertTriangle,
  FolderOpen,
  TrendingUp,
  PlayCircle,
  PauseCircle,
  ArrowRight,
  Bell,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const API_BASE = "/api";

interface DashboardStats {
  running_projects: number;
  total_projects: number;
  today_crawled: number;
  today_alerts: number;
  total_crawled: number;
  pending_alerts: number;
  trend: Array<{ date: string; crawled: number; alerts: number }>;
  project_status: Array<{
    id: number;
    name: string;
    is_active: boolean;
    today_crawled: number;
    today_alerts: number;
  }>;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-indigo-500" />
            舆情总览
          </h1>
          <p className="text-muted-foreground mt-1">
            实时监控你的品牌和竞品舆情动态
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/projects")}>
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">运行中项目</p>
                <p className="text-3xl font-bold text-indigo-600">
                  {stats?.running_projects || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  共 {stats?.total_projects || 0} 个项目
                </p>
              </div>
              <PlayCircle className="w-10 h-10 text-indigo-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今日抓取</p>
                <p className="text-3xl font-bold text-emerald-600">
                  {stats?.today_crawled || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  累计 {stats?.total_crawled?.toLocaleString() || 0}
                </p>
              </div>
              <Activity className="w-10 h-10 text-emerald-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今日预警</p>
                <p className="text-3xl font-bold text-amber-600">
                  {stats?.today_alerts || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">需关注内容</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待处理</p>
                <p className="text-3xl font-bold text-rose-600">
                  {stats?.pending_alerts || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  需要立即处理
                </p>
              </div>
              <Bell className="w-10 h-10 text-rose-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Project Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              7日趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.trend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="crawled"
                    name="抓取量"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="alerts"
                    name="预警数"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: "#f59e0b", strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Project Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              项目状态
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/projects")}
              className="text-xs"
            >
              查看全部 <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.project_status?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无监控项目</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate("/projects")}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  创建第一个项目
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {stats?.project_status?.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      {project.is_active ? (
                        <PlayCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <PauseCircle className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-sm">
                        {project.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-emerald-600">
                        +{project.today_crawled}
                      </span>
                      {project.today_alerts > 0 && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {project.today_alerts}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-primary/5 to-violet-500/5 border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">快速开始</h3>
              <p className="text-sm text-muted-foreground mt-1">
                创建监控项目，自动抓取并分析舆情内容
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/analysis")}>
                数据分析
              </Button>
              <Button variant="outline" onClick={() => navigate("/hotspots")}>
                热点排行
              </Button>
              <Button onClick={() => navigate("/projects")}>
                管理项目 <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
