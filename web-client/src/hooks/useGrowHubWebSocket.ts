import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
    type: string;
    channel?: string;
    data?: any;
    message?: string;
    timestamp?: string;
}

interface UseGrowHubWebSocketOptions {
    channel: 'alerts' | 'content' | 'stats';
    onMessage?: (data: any) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    autoReconnect?: boolean;
    reconnectInterval?: number;
}

interface UseGrowHubWebSocketReturn {
    isConnected: boolean;
    lastMessage: WebSocketMessage | null;
    error: string | null;
    reconnect: () => void;
}

const WS_BASE = 'ws://localhost:8040/api/growhub/ws';

export function useGrowHubWebSocket(options: UseGrowHubWebSocketOptions): UseGrowHubWebSocketReturn {
    const {
        channel,
        onMessage,
        onConnect,
        onDisconnect,
        autoReconnect = true,
        reconnectInterval = 3000,
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            const ws = new WebSocket(`${WS_BASE}/${channel}`);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log(`[GrowHub WS] Connected to ${channel}`);
                setIsConnected(true);
                setError(null);
                onConnect?.();

                // Start heartbeat
                heartbeatIntervalRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send('ping');
                    }
                }, 25000);
            };

            ws.onmessage = (event) => {
                const data = event.data;

                // Handle pong response
                if (data === 'pong' || data === 'ping') {
                    return;
                }

                try {
                    const message: WebSocketMessage = JSON.parse(data);
                    setLastMessage(message);

                    if (message.type !== 'connected') {
                        onMessage?.(message);
                    }
                } catch (e) {
                    // Non-JSON message, ignore
                    console.log(`[GrowHub WS] Non-JSON message: ${data}`);
                }
            };

            ws.onerror = (event) => {
                console.error(`[GrowHub WS] Error on ${channel}:`, event);
                setError('WebSocket 连接错误');
            };

            ws.onclose = () => {
                console.log(`[GrowHub WS] Disconnected from ${channel}`);
                setIsConnected(false);
                onDisconnect?.();

                // Clear heartbeat
                if (heartbeatIntervalRef.current) {
                    clearInterval(heartbeatIntervalRef.current);
                }

                // Auto reconnect
                if (autoReconnect) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log(`[GrowHub WS] Reconnecting to ${channel}...`);
                        connect();
                    }, reconnectInterval);
                }
            };

        } catch (e) {
            console.error(`[GrowHub WS] Failed to connect to ${channel}:`, e);
            setError('无法建立 WebSocket 连接');
        }
    }, [channel, onMessage, onConnect, onDisconnect, autoReconnect, reconnectInterval]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    const reconnect = useCallback(() => {
        disconnect();
        connect();
    }, [connect, disconnect]);

    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        isConnected,
        lastMessage,
        error,
        reconnect,
    };
}

export default useGrowHubWebSocket;
