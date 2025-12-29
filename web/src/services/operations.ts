
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

export const operationsService = {
    async triggerPipeline(name: string, date: string, files?: string[]): Promise<PipelineTriggerResponse> {
        const response = await api.post<PipelineTriggerResponse>(`/pipelines/${name}/run?date=${date}`, { files });
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
