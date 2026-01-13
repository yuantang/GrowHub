import { useEffect, useState, useRef } from 'react';
import type { LogEntry } from '@/api';

// WebSocket API base URL - use API server not Vite dev server
const WS_BASE = import.meta.env.DEV
    ? 'ws://localhost:8040'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

export function useLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const url = `${WS_BASE}/api/ws/logs`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to logs websocket');
            ws.send('ping');
        };

        ws.onmessage = (event) => {
            // Ignore ping/pong messages
            if (event.data === 'pong' || event.data === 'ping') return;

            try {
                const data = JSON.parse(event.data);
                if (data && data.message) {
                    setLogs((prev) => [...prev, data]);
                }
            } catch (e) {
                // Silently ignore non-JSON messages (like heartbeats)
                if (typeof event.data === 'string' && event.data.length < 20) {
                    return; // Likely a heartbeat or control message
                }
                console.error('Failed to parse log message', e);
            }
        };

        ws.onerror = (error) => {
            console.warn('WebSocket error:', error);
        };

        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('ping');
            }
        }, 10000);

        return () => {
            clearInterval(pingInterval);
            ws.close();
        };
    }, []);

    return logs;
}

