import React from 'react';
import { ChevronLeft, ChevronRight, FileText, Clock } from 'lucide-react';
import { clsx } from 'clsx';

export interface Store {
    name: string;
    safe_name: string;
    filename: string;
    row_count: number;
    timestamp: string;
}

interface SidebarProps {
    stores: Store[];
    selectedStore: string | null;
    onSelectStore: (storeName: string) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
}

export function Sidebar({
    stores,
    selectedStore,
    onSelectStore,
    collapsed,
    onToggleCollapse
}: SidebarProps) {
    const formatTimestamp = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('id-ID', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return timestamp;
        }
    };

    return (
        <div
            className={clsx(
                "bg-white border-r border-gray-200 transition-all duration-300 flex flex-col h-screen fixed left-0 top-0 bottom-0 z-10",
                collapsed ? "w-12" : "w-64"
            )}
        >
            {/* Header with Toggle */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0 bg-white">
                {!collapsed && (
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                        Stores
                    </h2>
                )}
                <button
                    onClick={onToggleCollapse}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <ChevronLeft className="w-4 h-4" />
                    )}
                </button>
            </div>

            {/* Store List */}
            {!collapsed && (
                <div className="flex-1 overflow-y-auto py-2">
                    {stores.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                            No stores processed yet
                        </div>
                    ) : (
                        <div className="px-2 space-y-1">
                            {stores.map((store) => (
                                <button
                                    key={store.safe_name}
                                    onClick={() => onSelectStore(store.name)}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-lg transition-all duration-200",
                                        "hover:bg-gray-50 border",
                                        selectedStore === store.name
                                            ? "bg-blue-50 border-blue-200 shadow-sm"
                                            : "bg-white border-gray-100 hover:border-gray-200"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className={clsx(
                                                "font-semibold text-sm truncate",
                                                selectedStore === store.name
                                                    ? "text-blue-700"
                                                    : "text-gray-800"
                                            )}>
                                                {store.name}
                                            </div>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                                <FileText className="w-3 h-3" />
                                                <span className="truncate">{store.filename}</span>
                                            </div>
                                        </div>
                                        <div className={clsx(
                                            "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
                                            selectedStore === store.name
                                                ? "bg-blue-100 text-blue-700"
                                                : "bg-gray-100 text-gray-600"
                                        )}>
                                            {store.row_count}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatTimestamp(store.timestamp)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Collapsed State Icons */}
            {collapsed && stores.length > 0 && (
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {stores.map((store) => (
                        <button
                            key={store.safe_name}
                            onClick={() => onSelectStore(store.name)}
                            className={clsx(
                                "w-full p-2 rounded-lg transition-all",
                                selectedStore === store.name
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                            )}
                            title={store.name}
                        >
                            <FileText className="w-4 h-4 mx-auto" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
