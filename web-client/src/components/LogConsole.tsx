import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '@/api';
import { cn } from '@/utils/cn';
import { Terminal } from 'lucide-react';

interface LogConsoleProps {
    logs: LogEntry[];
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="rounded-lg border border-border bg-black/90 font-mono text-sm shadow-inner flex flex-col h-96">
            <div className="flex items-center px-4 py-2 border-b border-white/10 bg-white/5">
                <Terminal className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">系统日志</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
                {logs.length === 0 && (
                    <div className="text-muted-foreground/50 italic text-xs">等待日志...</div>
                )}
                {logs.map((log, index) => (
                    <div key={index} className="flex gap-2 text-xs">
                        <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
                        <span className={cn(
                            "break-all",
                            log.level === 'error' ? 'text-red-400' :
                                log.level === 'warning' ? 'text-yellow-400' :
                                    log.level === 'success' ? 'text-green-400' : 'text-gray-300'
                        )}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
