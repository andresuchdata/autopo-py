"use client";

import React, { useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface DataViewerProps {
    data: any[];
    title?: string;
}

export function DataViewer({ data, title }: DataViewerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const headers = useMemo(() => {
        if (!data || data.length === 0) return [];
        return Object.keys(data[0]);
    }, [data]);

    const filteredData = useMemo(() => {
        let result = [...data];

        if (searchTerm) {
            result = result.filter((row) =>
                Object.values(row).some(
                    (val) =>
                        val !== null &&
                        String(val).toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        }

        if (sortConfig) {
            result.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (aVal === bVal) return 0;

                // Handle numbers
                const aNum = parseFloat(String(aVal).replace(/\./g, '').replace(',', '.'));
                const bNum = parseFloat(String(bVal).replace(/\./g, '').replace(',', '.'));

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                }

                // Handle strings
                return sortConfig.direction === 'asc'
                    ? String(aVal).localeCompare(String(bVal))
                    : String(bVal).localeCompare(String(aVal));
            });
        }

        return result;
    }, [data, searchTerm, sortConfig]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between">
                {title && <h3 className="text-lg font-semibold">{title}</h3>}
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search data..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="border rounded-md overflow-auto flex-1 bg-white">
                <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            {headers.map((header) => (
                                <TableHead
                                    key={header}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap"
                                    onClick={() => handleSort(header)}
                                >
                                    <div className="flex items-center gap-2">
                                        {header}
                                        {sortConfig?.key === header ? (
                                            sortConfig.direction === 'asc' ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )
                                        ) : (
                                            <Filter className="h-3 w-3 opacity-30" />
                                        )}
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length > 0 ? (
                            filteredData.map((row, i) => (
                                <TableRow key={i}>
                                    {headers.map((header) => (
                                        <TableCell key={header} className="whitespace-nowrap">
                                            {String(row[header] ?? '')}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={headers.length} className="h-24 text-center">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="text-xs text-muted-foreground">
                Showing {filteredData.length} of {data.length} rows
            </div>
        </div>
    );
}
