import { useEffect, useRef, useState, useCallback } from 'react';
import type { StoreProgress } from '@/services/operations';

export interface ProgressUpdate {
    run_id: number;
    status: string;
    processed_files: number;
    total_files: number;
    total_rows: number;
    store_progress: StoreProgress[];
    queued_count: number;
    processing_count: number;
    completed_count: number;
    failed_count: number;
    timestamp: string;
}

interface UsePipelineSSEOptions {
    pipelineName: string;
    runId: number | null;
    onProgress?: (update: ProgressUpdate) => void;
    onComplete?: (data: any) => void;
    onError?: (error: Error) => void;
}

export function usePipelineSSE({
    pipelineName,
    runId,
    onProgress,
    onComplete,
    onError
}: UsePipelineSSEOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<ProgressUpdate | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;

    const connect = useCallback(() => {
        if (!runId || eventSourceRef.current) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
        const url = `${apiUrl}/pipelines/${pipelineName}/runs/${runId}/stream`;

        console.log('[SSE] Connecting to:', url);

        try {
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                console.log('[SSE] Connection opened');
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
            };

            eventSource.addEventListener('progress', (event) => {
                try {
                    const data: ProgressUpdate = JSON.parse(event.data);
                    console.log('[SSE] Progress update:', data);
                    setLastUpdate(data);
                    onProgress?.(data);
                } catch (error) {
                    console.error('[SSE] Failed to parse progress event:', error);
                }
            });

            eventSource.addEventListener('complete', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[SSE] Pipeline complete:', data);
                    onComplete?.(data);
                    disconnect();
                } catch (error) {
                    console.error('[SSE] Failed to parse complete event:', error);
                }
            });

            eventSource.onerror = (error) => {
                console.error('[SSE] Connection error:', error);
                setIsConnected(false);

                // Attempt to reconnect with exponential backoff
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
                    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        disconnect();
                        reconnectAttemptsRef.current++;
                        connect();
                    }, delay);
                } else {
                    console.error('[SSE] Max reconnect attempts reached');
                    onError?.(new Error('Failed to maintain SSE connection'));
                    disconnect();
                }
            };
        } catch (error) {
            console.error('[SSE] Failed to create EventSource:', error);
            onError?.(error as Error);
        }
    }, [pipelineName, runId, onProgress, onComplete, onError]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (eventSourceRef.current) {
            console.log('[SSE] Disconnecting');
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            setIsConnected(false);
        }
    }, []);

    useEffect(() => {
        if (runId) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [runId, connect, disconnect]);

    return {
        isConnected,
        lastUpdate,
        disconnect
    };
}
