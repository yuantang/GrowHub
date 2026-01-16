import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Trash2, AlertTriangle, Database } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

const CLEAR_OPTIONS = [
  {
    id: "content",
    label: "清空内容数据 (GrowHub Content)",
    desc: "删除所有抓取的内容数据、通知记录和关键词统计。",
    warning: "注意：此操作不可恢复！",
  },
  {
    id: "creator",
    label: "清空达人博主 (GrowHub Creator)",
    desc: "删除所有提取的达人博主档案和统计。",
  },
  {
    id: "hotspot",
    label: "清空热点排行 (GrowHub Hotspot)",
    desc: "删除所有抓取的热点内容排行快照。",
  },
  {
    id: "checkpoint",
    label: "清空爬虫进度 (Checkpoints)",
    desc: "删除所有爬虫断点记录。下次任务将从头开始。",
  },
  {
    id: "all",
    label: "重置所有数据 (Reset All)",
    desc: "执行上述所有清理操作，让系统回归初始数据状态（保留配置）。",
    warning: "慎用！这将删除所有业务数据。",
  },
];

const SettingsPage: React.FC = () => {
  const { mutate } = useSWRConfig();
  const [clearing, setClearing] = useState(false);
  const [actionToConfirm, setActionToConfirm] = useState<string | null>(null);

  const handleClearData = async () => {
    if (!actionToConfirm) return;

    setClearing(true);
    try {
      const response = await fetch(
        `/api/growhub/system/data/clear?data_type=${actionToConfirm}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to clear data");

      toast.success("数据已清空");
      // Refresh content related caches
      mutate(
        (key) => typeof key === "string" && key.includes("/api/growhub"),
        undefined,
        { revalidate: true }
      );
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    } finally {
      setClearing(false);
      setActionToConfirm(null);
    }
  };

  const selectedOption = CLEAR_OPTIONS.find(
    (opt) => opt.id === actionToConfirm
  );

  return (
    <div className="container mx-auto py-6 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>

      <div className="grid gap-6">
        {/* Data Maintenance Card */}
        <Card className="border-red-100 dark:border-red-900/20">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-primary" />
              <span>数据维护</span>
            </CardTitle>
            <CardDescription>
              管理和清理系统产生的抓取数据。这些操作通常用于测试重置或清理旧数据。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CLEAR_OPTIONS.map((option) => (
              <div
                key={option.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/20 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-colors"
              >
                <div className="space-y-1">
                  <h3 className="font-medium flex items-center text-red-700 dark:text-red-400">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {option.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {option.desc}
                    {option.warning && (
                      <>
                        <br />
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {option.warning}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <Button
                  variant="destructive"
                  disabled={clearing}
                  onClick={() => setActionToConfirm(option.id)}
                >
                  {clearing && actionToConfirm === option.id
                    ? "清空中..."
                    : "清空"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!actionToConfirm}
        onClose={() => setActionToConfirm(null)}
        title="⚠️ 确认清空数据？"
        className="max-w-md"
      >
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>此操作将永久删除：</p>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-100 dark:border-red-900/30">
              <p className="font-medium text-red-600 dark:text-red-400 mb-1">
                {selectedOption?.label}
              </p>
              <p className="text-red-700 dark:text-red-300 text-xs">
                {selectedOption?.desc}
              </p>
            </div>
            <p>
              注：项目配置和账号信息<b>不会</b>被删除。
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setActionToConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearData}
              className="bg-red-600 hover:bg-red-700"
            >
              {clearing ? "处理中..." : "确认清空"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;
