import React from 'react';
import { ArrowUp, Check, ArrowRight } from 'lucide-react';

interface POAgingItem {
    po_number: string;
    status: string;
    quantity: number;
    value: number;
    days_in_status: number;
}

interface POAgingTableProps {
    data: POAgingItem[];
}

const formatCurrency = (value: number) => {
    if (value >= 1000000) {
        return `Rp ${(value / 1000000).toFixed(1)} mio`;
    }
    return `Rp ${value.toLocaleString()}`;
};

export const POAgingTable: React.FC<POAgingTableProps> = ({ data }) => {
    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold mb-4">PO Aging vs. Today</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                        <tr>
                            <th className="px-4 py-3 font-medium">PO Number</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium text-right">Quantity</th>
                            <th className="px-4 py-3 font-medium text-right">Value</th>
                            <th className="px-4 py-3 font-medium text-right">Days in Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, index) => (
                            <tr key={index} className="border-b border-border/50 hover:bg-muted/50">
                                <td className="px-4 py-3 font-medium">{item.po_number}</td>
                                <td className="px-4 py-3">{item.status}</td>
                                <td className="px-4 py-3 text-right">{item.quantity}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(item.value)}</td>
                                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                                    {item.days_in_status}
                                    <ArrowUp size={14} className="text-orange-500" />
                                    {/* Mocking the icons from image */}
                                    {index % 2 === 0 ? <Check size={14} className="text-orange-500" /> : <ArrowRight size={14} className="text-yellow-500" />}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
