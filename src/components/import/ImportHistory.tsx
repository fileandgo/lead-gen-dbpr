'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ImportRunSummary } from '@/types';
import { formatDate } from '@/lib/utils';

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'processing':
      return 'bg-blue-100 text-blue-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

export function ImportHistory({
  runs,
  loading,
}: {
  runs: ImportRunSummary[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Skipped</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="max-w-[200px] truncate font-medium">
                    {run.fileName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs uppercase">
                      {run.fileType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={getStatusColor(run.status)}
                      variant="secondary"
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{run.totalRows}</TableCell>
                  <TableCell className="text-green-600">
                    {run.importedRows}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.skippedDuplicates}
                  </TableCell>
                  <TableCell className="text-blue-600">
                    {run.updatedExisting}
                  </TableCell>
                  <TableCell className="text-red-600">
                    {run.errorRows}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(run.createdAt)}
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
