import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Users,
  RefreshCw,
  Loader2,
  FileText,
  Smile,
  Meh,
  Frown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  fetchKeywordTrends,
  fetchCreatorLeaderboard,
  fetchCollectionStats,
  fetchPlatformDistribution,
  type KeywordTrendResponse,
  type CreatorLeaderboardItem,
  type CollectionStatsResponse,
  type PlatformDistributionItem,
} from "@/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  xhs: { label: "小红书", color: "#FF6B6B" },
  dy: { label: "抖音", color: "#1E1E1E" },
  douyin: { label: "抖音", color: "#1E1E1E" },
  bili: { label: "B站", color: "#FB7299" },
  bilibili: { label: "B站", color: "#FB7299" },
  wb: { label: "微博", color: "#FF8C00" },
  weibo: { label: "微博", color: "#FF8C00" },
  ks: { label: "快手", color: "#FFB800" },
  kuaishou: { label: "快手", color: "#FFB800" },
  zhihu: { label: "知乎", color: "#0084FF" },
};

const SENTIMENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  positive: {
    label: "正面",
    color: "#22C55E",
    icon: <Smile className="w-4 h-4" />,
  },
  neutral: {
    label: "中性",
    color: "#6B7280",
    icon: <Meh className="w-4 h-4" />,
  },
  negative: {
    label: "负面",
    color: "#EF4444",
    icon: <Frown className="w-4 h-4" />,
  },
};

const COLORS = [
  "#6366F1",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
];

const AnalyticsDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [keywordTrends, setKeywordTrends] = useState<KeywordTrendResponse[]>(
    [],
  );
  const [creatorLeaderboard, setCreatorLeaderboard] = useState<
    CreatorLeaderboardItem[]
  >([]);
  const [collectionStats, setCollectionStats] =
    useState<CollectionStatsResponse | null>(null);
  const [platformDist, setPlatformDist] = useState<PlatformDistributionItem[]>(
    [],
  );
  const [days, setDays] = useState(7);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [trends, creators, stats, distribution] = await Promise.all([
        fetchKeywordTrends(days, 5),
        fetchCreatorLeaderboard(30, 10),
        fetchCollectionStats(),
        fetchPlatformDistribution(days),
      ]);
      setKeywordTrends(trends);
      setCreatorLeaderboard(creators);
      setCollectionStats(stats);
      setPlatformDist(distribution);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      toast.error("加载分析数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [days]);

  // Transform keyword trends for chart
  const trendChartData = React.useMemo(() => {
    if (!keywordTrends.length) return [];

    // Get all unique dates
    const allDates = new Set<string>();
    keywordTrends.forEach((kw) =>
      kw.trend.forEach((t) => allDates.add(t.date)),
    );

    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((date) => {
      const point: Record<string, any> = { date: date.slice(5) }; // MM-DD format
      keywordTrends.forEach((kw) => {
        const found = kw.trend.find((t) => t.date === date);
        point[kw.keyword] = found?.count || 0;
      });
      return point;
    });
  }, [keywordTrends]);

  // Transform platform distribution for pie chart
  const pieChartData = React.useMemo(() => {
    return platformDist.map((item) => ({
      name: PLATFORM_LABELS[item.platform]?.label || item.platform,
      value: item.count,
      percentage: item.percentage,
    }));
  }, [platformDist]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载分析数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-indigo-500" />
            数据分析
          </h1>
          <p className="text-muted-foreground mt-1">
            洞察采集数据趋势，发现内容与博主价值
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            <option value={7}>最近 7 天</option>
            <option value={14}>最近 14 天</option>
            <option value={30}>最近 30 天</option>
          </select>
          <Button variant="outline" onClick={fetchAllData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {collectionStats && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <FileText className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {collectionStats.total_contents.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">总内容量</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-500">
                    {collectionStats.today_contents.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">今日新增</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-500">
                    {collectionStats.week_contents.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">本周新增</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-500">
                    {collectionStats.month_contents.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">本月新增</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Keyword Trends */}
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              热词趋势
            </h3>
            {trendChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid #333",
                      borderRadius: "8px",
                    }}
                  />
                  {keywordTrends.map((kw, idx) => (
                    <Line
                      key={kw.keyword}
                      type="monotone"
                      dataKey={kw.keyword}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                暂无趋势数据
              </div>
            )}
            {keywordTrends.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {keywordTrends.map((kw, idx) => (
                  <span
                    key={kw.keyword}
                    className="text-xs px-2 py-1 rounded-full border"
                    style={{
                      borderColor: COLORS[idx % COLORS.length],
                      color: COLORS[idx % COLORS.length],
                    }}
                  >
                    {kw.keyword} ({kw.total})
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Distribution */}
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              平台分布
            </h3>
            {pieChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={(props: any) =>
                      `${props.name} ${props.payload?.percentage || 0}%`
                    }
                    labelLine={false}
                  >
                    {pieChartData.map((_, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={COLORS[idx % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid #333",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [
                      typeof value === "number"
                        ? value.toLocaleString()
                        : String(value),
                      "数量",
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                暂无平台数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sentiment & Creator Leaderboard */}
      <div className="grid grid-cols-3 gap-6">
        {/* Sentiment Distribution */}
        {collectionStats && (
          <Card className="bg-card/50">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Smile className="w-5 h-5 text-green-500" />
                情感分布
              </h3>
              <div className="space-y-3">
                {Object.entries(collectionStats.by_sentiment).map(
                  ([sentiment, count]) => {
                    const config = SENTIMENT_CONFIG[sentiment] || {
                      label: sentiment,
                      color: "#666",
                      icon: null,
                    };
                    const total = Object.values(
                      collectionStats.by_sentiment,
                    ).reduce((a, b) => a + b, 0);
                    const percentage =
                      total > 0 ? ((count / total) * 100).toFixed(1) : 0;

                    return (
                      <div key={sentiment} className="flex items-center gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${config.color}20` }}
                        >
                          {config.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{config.label}</span>
                            <span className="text-muted-foreground">
                              {count.toLocaleString()} ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 bg-background rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: config.color,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Creator Leaderboard */}
        <Card className="bg-card/50 col-span-2">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-pink-500" />
              博主排行榜
            </h3>
            {creatorLeaderboard.length > 0 ? (
              <div className="space-y-2">
                {creatorLeaderboard.slice(0, 8).map((creator, idx) => (
                  <div
                    key={creator.author_id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors"
                  >
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                        idx < 3
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    {creator.author_avatar ? (
                      <img
                        src={creator.author_avatar}
                        alt={creator.author_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {creator.author_name?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {creator.author_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[creator.platform]?.label ||
                          creator.platform}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">
                        {creator.content_count} 篇
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {creator.total_likes.toLocaleString()} 赞
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                暂无博主数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsDashboardPage;
