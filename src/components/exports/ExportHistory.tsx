'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { ExportRunRow } from '@/types';
import { Download } from 'lucide-react';

export function ExportHistory({ exports, loading }: { exports: ExportRunRow[]; loading: boolean }) {
  const handleRedownload = async (exportId: string) => {
    // Re-trigger the export with the same filters
    const exp = exports.find((e) => e.id === exportId);
    if (!exp) return;

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exp.filterJson),
      });
      const data = await res.json();
      if (data.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || 'leads-export.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : exports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exports yet. Export leads from the Leads page.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Filters</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="font-medium">{exp.fileName || 'export.csv'}</TableCell>
                  <TableCell>{exp.totalExported}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {JSON.stringify(exp.filterJson)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(exp.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleRedownload(exp.id)}>
                      <Download className="mr-1 h-4 w-4" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
