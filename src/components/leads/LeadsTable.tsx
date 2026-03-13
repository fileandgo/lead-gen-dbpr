'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { getScoreBadgeColor, getStatusBadgeColor } from '@/lib/utils';
import type { LeadRow } from '@/types';
import { Eye } from 'lucide-react';

interface LeadsTableProps {
  leads: LeadRow[];
  loading: boolean;
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onOpenDetail: (id: string) => void;
}

export function LeadsTable({ leads, loading, selectedIds, onSelectIds, onOpenDetail }: LeadsTableProps) {
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.includes(l.id));

  const toggleAll = () => {
    if (allSelected) {
      onSelectIds(selectedIds.filter((id) => !leads.find((l) => l.id === id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...leads.map((l) => l.id)])];
      onSelectIds(newIds);
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectIds(selectedIds.filter((i) => i !== id));
    } else {
      onSelectIds([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (leads.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No leads found. Run a scrape first.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          </TableHead>
          <TableHead>Business Name</TableHead>
          <TableHead>Trade</TableHead>
          <TableHead>License #</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>County</TableHead>
          <TableHead>Enriched</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell>
              <Checkbox
                checked={selectedIds.includes(lead.id)}
                onCheckedChange={() => toggleOne(lead.id)}
              />
            </TableCell>
            <TableCell className="font-medium">{lead.displayBusinessName}</TableCell>
            <TableCell>
              <span className="text-xs">
                {lead.primaryTrade?.replace('Certified ', '').replace('Registered ', '') || '-'}
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs">{lead.canonicalLicenseNumber || '-'}</TableCell>
            <TableCell>
              {lead.latestLicenseStatus ? (
                <Badge className={getStatusBadgeColor(lead.latestLicenseStatus)} variant="secondary">
                  {lead.latestLicenseStatus.split(',')[0]}
                </Badge>
              ) : (
                '-'
              )}
            </TableCell>
            <TableCell>{lead.county || '-'}</TableCell>
            <TableCell>
              <Badge
                className={
                  lead.enrichmentStatus === 'enriched'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }
                variant="secondary"
              >
                {lead.enrichmentStatus === 'enriched' ? 'Yes' : 'No'}
              </Badge>
            </TableCell>
            <TableCell>
              {lead.preferredContactName ? (
                <div className="text-xs">
                  <div className="font-medium">{lead.preferredContactName}</div>
                  <div className="text-muted-foreground">{lead.preferredContactTitle}</div>
                  {lead.hasEmail && <div className="text-green-600">Has email</div>}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {lead.score !== null ? (
                <Badge className={getScoreBadgeColor(lead.score)} variant="secondary">
                  {lead.manualOverride !== null ? `${lead.manualOverride}*` : lead.score}
                </Badge>
              ) : (
                '-'
              )}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="icon" onClick={() => onOpenDetail(lead.id)}>
                <Eye className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
