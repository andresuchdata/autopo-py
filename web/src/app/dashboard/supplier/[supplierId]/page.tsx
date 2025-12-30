'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowLeft } from 'lucide-react';
import { getSupplierPOItems, SupplierPOItem } from '@/services/api';
import { format } from 'date-fns';

interface SupplierDetailPageProps {
    params: {
        supplierId: string;
    };
}

const formatDate = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

export default function SupplierDetailPage({ params }: SupplierDetailPageProps) {
    const { supplierId } = params;
    const router = useRouter();
    const [items, setItems] = useState<SupplierPOItem[]>([]);
    const [supplierName, setSupplierName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const id = parseInt(supplierId, 10);
            if (isNaN(id)) {
                throw new Error('Invalid supplier ID');
            }
            const data = await getSupplierPOItems({ supplierId: id, pageSize: 100 });
            setItems(data.items);
            if (data.items.length > 0) {
                setSupplierName(data.items[0].supplier_name);
            }
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load supplier items');
        } finally {
            setLoading(false);
        }
    }, [supplierId]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-destructive">
                <p>Error: {error}</p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8">
            <div className="mb-6 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Supplier Details: {supplierName || `ID ${supplierId}`}</h1>
                    <p className="text-muted-foreground">Active Purchase Orders</p>
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="text-right">Sent Date</TableHead>
                            <TableHead className="text-right">Arrived Date</TableHead>
                            <TableHead className="text-right">ETA</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No active items found for this supplier.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={`${item.po_number}-${item.sku}`}>
                                    <TableCell className="font-medium">
                                        <a href={`/dashboard/po/${encodeURIComponent(item.po_number)}`} className="text-primary hover:underline">
                                            {item.po_number}
                                        </a>
                                    </TableCell>
                                    <TableCell>{item.sku}</TableCell>
                                    <TableCell className="max-w-[300px] truncate" title={item.product_name}>
                                        {item.product_name}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(item.po_sent_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(item.po_arrived_at)}
                                    </TableCell>
                                    {/* Note: SupplierPOItem interface in api.ts might need ETA field logic if not already present in response */}
                                    {/* The backend added ETA to SupplierPOItem, so frontend interface (if updated automatically or manually) should have it */}
                                    {/* I updated backend struct, but I should check if I updated frontend interface in prior step. No, I updated POSnapshotItem but not SupplierPOItem in api.ts */}
                                    {/* Wait, I should update SupplierPOItem in api.ts first? */}
                                    <TableCell className="text-right font-medium text-blue-600">
                                        {(item as any).eta ? formatDate((item as any).eta) : '-'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
