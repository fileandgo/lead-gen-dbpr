'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ScrapeRunSummary } from '@/types';
import { formatDate } from '@/lib/utils';

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'running':
      return 'bg-blue-100 text-blue-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

export function ScrapeHistory({ runs, loading }: { runs: ScrapeRunSummary[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scrape History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scrape runs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>County</TableHead>
                <TableHead>License Types</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raw Records</TableHead>
                <TableHead>Unique</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const types = Array.isArray(run.selectedLicenseTypes)
                  ? run.selectedLicenseTypes
                  : [];
                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.county}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {types.slice(0, 2).map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t.replace('Certified ', 'Cert ').replace('Registered ', 'Reg ')}
                          </Badge>
                        ))}
                        {types.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{types.length - 2} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(run.status)} variant="secondary">
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.totalRawRecords}</TableCell>
                    <TableCell>{run.totalUniqueRecords}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.startedAt ? formatDate(run.startedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.completedAt ? formatDate(run.completedAt) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-red-600">
                      {run.errorMessage || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
