
import { api } from './api';

export interface ValidationResponse {
    date: string;
    base_dir: string;
    results: FileResult[];
    summary: ValidationSummary;
}

export interface FileResult {
    file: string;
    status: string;
    output_file?: string;
    report_file?: string;
    error?: string;
    metrics?: Record<string, number | string | boolean | null>;
}

export interface ValidationSummary {
    total: number;
    success: number;
    failed: number;
    missing: number;
}

export interface PipelineTriggerResponse {
    message: string;
    run_id: number;
    date: string;
    status: string;
}

export interface PipelineConfig {
    data_source: 'google_drive' | 'legacy_db';
    run_date: string;
    store_ids?: number[];
    drive_folder_id?: string;
    priority?: number;
    scheduled_at?: string;
    retry_config?: RetryConfig;
}

export interface RetryConfig {
    enabled: boolean;
    max_attempts: number;
    initial_backoff_sec: number;
    max_backoff_sec: number;
    backoff_multiplier: number;
}

export interface PipelineRun {
    id: number;
    pipeline_name: string;
    date: string;
    status: string;
    total_files: number;
    processed_files: number;
    total_rows: number;
    started_at: string;
    completed_at?: string;
    error_message?: string;
    config: any;
    priority: number;
    is_paused: boolean;
    scheduled_at?: string;
    created_at: string;
    updated_at: string;
}

export interface StoreProgress {
    store_id: number;
    store_name: string;
    status: string;
    stage: string;
    progress_percent: number;
    error_message?: string;
    retry_count: number;
    updated_at: string;
}

export interface PipelineRunSummary {
    run: PipelineRun;
    store_progress: StoreProgress[];
    queued_count: number;
    processing_count: number;
    completed_count: number;
    failed_count: number;
}

export interface Store {
    id: number;
    name: string;
    original_id?: string;
}

export const operationsService = {
    async triggerPipeline(name: string, date: string, files?: string[]): Promise<PipelineTriggerResponse> {
        const response = await api.post<PipelineTriggerResponse>(`/pipelines/${name}/run?date=${date}`, { files });
        return response.data;
    },

    async configurePipeline(name: string, config: PipelineConfig): Promise<PipelineTriggerResponse> {
        const response = await api.post<PipelineTriggerResponse>(`/pipelines/${name}/configure`, config);
        return response.data;
    },

    async getPipelineRun(name: string, runId: number): Promise<PipelineRun> {
        const response = await api.get<PipelineRun>(`/pipelines/${name}/runs/${runId}`);
        return response.data;
    },

    async getPipelineRunSummary(name: string, runId: number): Promise<PipelineRunSummary> {
        const response = await api.get<PipelineRunSummary>(`/pipelines/${name}/runs/${runId}/summary`);
        return response.data;
    },

    async getStoreProgress(name: string, runId: number): Promise<{ run_id: number; progress: StoreProgress[] }> {
        const response = await api.get<{ run_id: number; progress: StoreProgress[] }>(`/pipelines/${name}/runs/${runId}/stores`);
        return response.data;
    },

    async listPipelineRuns(name: string, limit: number = 20, offset: number = 0): Promise<{ runs: PipelineRun[]; limit: number; offset: number }> {
        const response = await api.get<{ runs: PipelineRun[]; limit: number; offset: number }>(`/pipelines/${name}/runs`, {
            params: { limit, offset }
        });
        return response.data;
    },

    async pausePipelineRun(name: string, runId: number): Promise<{ message: string; run_id: number }> {
        const response = await api.post<{ message: string; run_id: number }>(`/pipelines/${name}/runs/${runId}/pause`);
        return response.data;
    },

    async resumePipelineRun(name: string, runId: number): Promise<{ message: string; run_id: number }> {
        const response = await api.post<{ message: string; run_id: number }>(`/pipelines/${name}/runs/${runId}/resume`);
        return response.data;
    },

    async retryFailedStores(name: string, runId: number): Promise<{ message: string; run_id: number }> {
        const response = await api.post<{ message: string; run_id: number }>(`/pipelines/${name}/runs/${runId}/retry`);
        return response.data;
    },

    async stopPipelineRun(name: string, runId: number): Promise<{ message: string; run_id: number }> {
        const response = await api.post<{ message: string; run_id: number }>(`/pipelines/${name}/runs/${runId}/stop`);
        return response.data;
    },

    async stopAllPipelines(): Promise<{ message: string }> {
        const response = await api.post<{ message: string }>('/pipelines/stop-all');
        return response.data;
    },

    async getAllStores(): Promise<{ stores: Store[] }> {
        const response = await api.get<{ stores: Store[] }>('/stores');
        return response.data;
    },

    async runValidation(date: string): Promise<ValidationResponse> {
        const response = await api.post<ValidationResponse>('/validation/run', { date });
        return response.data;
    },

    async getValidationResults(date: string): Promise<ValidationResponse | null> {
        try {
            const response = await api.get<ValidationResponse>(`/validation/results`, {
                params: { date }
            });
            // Check if response has 'exists' field (meaning no results)
            if ('exists' in response.data && !response.data.exists) {
                return null;
            }
            return response.data;
        } catch (error) {
            return null;
        }
    },

    async getReportContent(key: string, sheet: string = 'validation', format: string = 'json'): Promise<any> {
        const response = await api.get<any>(`/validation/report-content`, {
            params: { key, sheet, format }
        });
        return response.data;
    }
};
