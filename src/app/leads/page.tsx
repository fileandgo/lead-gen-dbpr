'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetail } from '@/components/leads/LeadDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FLORIDA_COUNTIES, TARGET_LICENSE_TYPES } from '@/lib/constants';
import type { LeadRow, LeadDetail as LeadDetailType, LeadFilters } from '@/types';
import { Download, Sparkles } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadDetailType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>({
    page: 1,
    pageSize: 25,
  });

  const loadLeads = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.county) params.set('county', filters.county);
    if (filters.trade) params.set('trade', filters.trade);
    if (filters.status) params.set('status', filters.status);
    if (filters.enriched) params.set('enriched', filters.enriched);
    if (filters.scoreMin !== undefined) params.set('scoreMin', String(filters.scoreMin));
    if (filters.scoreMax !== undefined) params.set('scoreMax', String(filters.scoreMax));
    if (filters.search) params.set('search', filters.search);
    params.set('page', String(filters.page || 1));
    params.set('pageSize', String(filters.pageSize || 25));

    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.leads || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const openDetail = (id: string) => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setSelectedLead(data);
        setDetailOpen(true);
      })
      .catch(console.error);
  };

  const handleEnrich = async () => {
    if (selectedIds.length === 0) return;
    setEnriching(true);
    try {
      await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: selectedIds }),
      });
      setSelectedIds([]);
      loadLeads();
    } catch (e) {
      console.error(e);
    } finally {
      setEnriching(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.county) params.set('county', filters.county);
      if (filters.trade) params.set('trade', filters.trade);
      if (filters.status) params.set('status', filters.status);
      if (filters.enriched) params.set('enriched', filters.enriched);
      if (filters.scoreMin !== undefined) params.set('scoreMin', String(filters.scoreMin));
      if (filters.scoreMax !== undefined) params.set('scoreMax', String(filters.scoreMax));

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
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
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / (filters.pageSize || 25));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="text-muted-foreground">{total} businesses found</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleEnrich}
              disabled={selectedIds.length === 0 || enriching}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {enriching ? 'Enriching...' : `Enrich Selected (${selectedIds.length})`}
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select
            value={filters.county || 'all'}
            onValueChange={(v) => setFilters({ ...filters, county: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Counties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Counties</SelectItem>
              {FLORIDA_COUNTIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.trade || 'all'}
            onValueChange={(v) => setFilters({ ...filters, trade: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All Trades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {TARGET_LICENSE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => setFilters({ ...filters, status: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="current">Current</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.enriched || 'all'}
            onValueChange={(v) => setFilters({ ...filters, enriched: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Enrichment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="enriched">Enriched</SelectItem>
              <SelectItem value="not_enriched">Not Enriched</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search business name..."
            className="w-64"
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          />
        </div>

        <LeadsTable
          leads={leads}
          loading={loading}
          selectedIds={selectedIds}
          onSelectIds={setSelectedIds}
          onOpenDetail={openDetail}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page || 1) <= 1}
              onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {filters.page || 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page || 1) >= totalPages}
              onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
            >
              Next
            </Button>
          </div>
        )}

        <LeadDetail
          lead={selectedLead}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    </AppLayout>
  );
}
