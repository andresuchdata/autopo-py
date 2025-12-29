"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { VirtualizedCSVViewer } from "@/components/storage/VirtualizedCSVViewer";

export default function ValidationDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const key = decodeURIComponent(params.key as string);

    // Extract store name from key (e.g., "validation/2025/12/29/validation_1. Miss Glam Padang.xlsx")
    const fileName = key.split('/').pop() || '';
    const storeName = fileName.replace(/^validation_\d+\.\s*/, '').replace('.xlsx', '');

    const [activeSheet, setActiveSheet] = useState('validation');

    // Available sheets in the validation Excel files
    const sheets = [
        { id: 'validation', label: 'Validation Details' },
        { id: 'metrics', label: 'Metrics' },
        // Add more sheets as needed based on your Excel structure
    ];

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Fixed Header - accounts for top navigation */}
            <div className="sticky top-0 z-40 bg-background border-b border-border shadow-sm">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.back()}
                            className="gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Button>
                        <div className="flex-1">
                            <h1 className="text-lg font-semibold text-foreground">
                                Validation Report: {storeName}
                            </h1>
                            <p className="text-xs text-muted-foreground">{fileName}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs for different sheets */}
            <div className="sticky top-[57px] z-30 bg-background border-b border-border">
                <div className="container mx-auto px-4">
                    <Tabs value={activeSheet} onValueChange={setActiveSheet} className="w-full">
                        <TabsList className="h-10 bg-muted/50">
                            {sheets.map(sheet => (
                                <TabsTrigger key={sheet.id} value={sheet.id} className="text-sm">
                                    {sheet.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                <Tabs value={activeSheet} className="h-full">
                    {sheets.map(sheet => (
                        <TabsContent key={sheet.id} value={sheet.id} className="h-full m-0 p-0">
                            <div className="h-full">
                                <VirtualizedCSVViewer
                                    fileKey={key}
                                    fileName={`${storeName} - ${sheet.label}`}
                                    onClose={() => router.back()}
                                    downloadUrl={`/validation/report-content?key=${encodeURIComponent(key)}&sheet=${sheet.id}&format=csv`}
                                />
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </div>
    );
}
