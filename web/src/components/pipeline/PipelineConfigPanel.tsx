'use client';

import { useState, useEffect } from 'react';
import { Calendar, Database, HardDrive, Settings, Play, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { operationsService, type Store, type PipelineConfig } from '@/services/operations';
import { format } from 'date-fns';

interface PipelineConfigPanelProps {
    pipelineName: string;
    onSubmit: (config: PipelineConfig) => void;
    isLoading?: boolean;
}

export function PipelineConfigPanel({ pipelineName, onSubmit, isLoading }: PipelineConfigPanelProps) {
    const [dataSource, setDataSource] = useState<'google_drive' | 'legacy_db'>('google_drive');
    const [runDate, setRunDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStores, setSelectedStores] = useState<number[]>([]);
    const [driveFolderID, setDriveFolderID] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [priority, setPriority] = useState(0);
    const [scheduledAt, setScheduledAt] = useState('');
    const [retryEnabled, setRetryEnabled] = useState(true);
    const [maxAttempts, setMaxAttempts] = useState(3);

    useEffect(() => {
        loadStores();
    }, []);

    const loadStores = async () => {
        try {
            const { stores: storeList } = await operationsService.getAllStores();
            setStores(storeList);
        } catch (error) {
            console.error('Failed to load stores:', error);
        }
    };

    const handleStoreToggle = (storeId: number) => {
        setSelectedStores(prev =>
            prev.includes(storeId)
                ? prev.filter(id => id !== storeId)
                : [...prev, storeId]
        );
    };

    const handleSelectAll = () => {
        if (selectedStores.length === stores.length) {
            setSelectedStores([]);
        } else {
            setSelectedStores(stores.map(s => s.id));
        }
    };

    const handleSubmit = () => {
        const config: PipelineConfig = {
            data_source: dataSource,
            run_date: runDate,
            store_ids: selectedStores.length > 0 ? selectedStores : undefined,
            drive_folder_id: dataSource === 'google_drive' ? driveFolderID || undefined : undefined,
            priority: priority || undefined,
            scheduled_at: scheduledAt || undefined,
            retry_config: retryEnabled ? {
                enabled: true,
                max_attempts: maxAttempts,
                initial_backoff_sec: 5,
                max_backoff_sec: 300,
                backoff_multiplier: 2
            } : undefined
        };

        onSubmit(config);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Pipeline Configuration
                </CardTitle>
                <CardDescription>
                    Configure and run the {pipelineName} pipeline
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Data Source Selection */}
                <div className="space-y-3">
                    <Label className="text-base font-semibold">Data Source</Label>
                    <RadioGroup value={dataSource} onValueChange={(v) => setDataSource(v as any)}>
                        <div className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent">
                            <RadioGroupItem value="google_drive" id="google_drive" />
                            <Label htmlFor="google_drive" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4" />
                                    <span className="font-medium">Google Drive</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Read raw CSV files from M2 web app reports
                                </p>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent">
                            <RadioGroupItem value="legacy_db" id="legacy_db" />
                            <Label htmlFor="legacy_db" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    <span className="font-medium">Legacy Database</span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Query directly from M2 CI3 MySQL database
                                </p>
                            </Label>
                        </div>
                    </RadioGroup>

                    {dataSource === 'google_drive' && (
                        <div className="mt-3">
                            <Label htmlFor="drive_folder">Drive Folder ID (Optional)</Label>
                            <Input
                                id="drive_folder"
                                value={driveFolderID}
                                onChange={(e) => setDriveFolderID(e.target.value)}
                                placeholder="Leave empty to use default folder"
                                className="mt-1"
                            />
                        </div>
                    )}
                </div>

                {/* Run Date */}
                <div className="space-y-2">
                    <Label htmlFor="run_date" className="text-base font-semibold flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Run Date
                    </Label>
                    <Input
                        id="run_date"
                        type="date"
                        value={runDate}
                        onChange={(e) => setRunDate(e.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                    />
                </div>

                {/* Store Selection */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">
                            Store Selection
                        </Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAll}
                            type="button"
                        >
                            {selectedStores.length === stores.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {selectedStores.length === 0
                            ? 'All stores will be processed'
                            : `${selectedStores.length} store(s) selected`}
                    </p>
                    <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                        {stores.map((store) => (
                            <div key={store.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`store-${store.id}`}
                                    checked={selectedStores.includes(store.id)}
                                    onCheckedChange={() => handleStoreToggle(store.id)}
                                />
                                <Label
                                    htmlFor={`store-${store.id}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                >
                                    {store.name}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Advanced Options */}
                <div className="space-y-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        type="button"
                        className="w-full justify-start"
                    >
                        <Settings className="h-4 w-4 mr-2" />
                        {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                    </Button>

                    {showAdvanced && (
                        <div className="space-y-4 pl-4 border-l-2">
                            <div className="space-y-2">
                                <Label htmlFor="priority">Priority (0 = normal, higher = more important)</Label>
                                <Input
                                    id="priority"
                                    type="number"
                                    value={priority}
                                    onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                                    min="0"
                                    max="10"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="scheduled_at" className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Schedule For Later (Optional)
                                </Label>
                                <Input
                                    id="scheduled_at"
                                    type="datetime-local"
                                    value={scheduledAt}
                                    onChange={(e) => setScheduledAt(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="retry_enabled"
                                        checked={retryEnabled}
                                        onCheckedChange={(checked) => setRetryEnabled(checked as boolean)}
                                    />
                                    <Label htmlFor="retry_enabled">Enable Smart Retry</Label>
                                </div>
                                {retryEnabled && (
                                    <div className="pl-6 space-y-2">
                                        <Label htmlFor="max_attempts">Max Retry Attempts</Label>
                                        <Input
                                            id="max_attempts"
                                            type="number"
                                            value={maxAttempts}
                                            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 3)}
                                            min="1"
                                            max="10"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                >
                    <Play className="h-4 w-4 mr-2" />
                    {isLoading ? 'Starting Pipeline...' : scheduledAt ? 'Schedule Pipeline' : 'Run Pipeline Now'}
                </Button>
            </CardContent>
        </Card>
    );
}
