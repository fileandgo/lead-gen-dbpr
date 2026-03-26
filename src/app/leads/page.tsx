'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetail } from '@/components/leads/LeadDetail';
import { EnrichmentPreviewDialog } from '@/components/leads/EnrichmentPreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FLORIDA_COUNTIES, TARGET_LICENSE_TYPES } from '@/lib/constants';
import type { LeadRow, LeadDetail as LeadDetailType, LeadFilters, EnrichmentMode, EnrichmentConfig } from '@/types';
import { Download, Sparkles, Ban, CheckCircle, Globe } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadDetailType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'selected' | 'filtered'>('selected');
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [googleResolving, setGoogleResolving] = useState(false);
  const [googleAutoResolve, setGoogleAutoResolve] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [filters, setFilters] = useState<LeadFilters>({
    page: 1,
    pageSize: 25,
    excluded: 'included',
  });

  const loadLeads = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.county) params.set('county', filters.county);
    if (filters.trade) params.set('trade', filters.trade);
    if (filters.status) params.set('status', filters.status);
    if (filters.enriched) params.set('enriched', filters.enriched);
    if (filters.googleStatus) params.set('googleStatus', filters.googleStatus);
    if (filters.excluded) params.set('excluded', filters.excluded);
    if (filters.hasBusinessName) params.set('hasBusinessName', filters.hasBusinessName);
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

  // Polling: check enrichment run status and refresh leads
  const startPolling = (enrichmentRunId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/enrich');
        const data = await res.json();
        const run = data.runs?.find((r: any) => r.id === enrichmentRunId);
        loadLeads();
        if (!run || run.status === 'completed' || run.status === 'failed') {
          stopPolling();
          setEnriching(false);
        }
      } catch {
        // keep polling
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Load settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setGoogleAutoResolve(data.google_auto_resolve_enabled !== 'false');
        setSettingsLoaded(true);
      })
      .catch(console.error);
  }, []);

  const handleToggleGoogleAutoResolve = async (enabled: boolean) => {
    setGoogleAutoResolve(enabled);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_auto_resolve_enabled: String(enabled) }),
      });
    } catch (e) {
      console.error(e);
      setGoogleAutoResolve(!enabled); // revert on error
    }
  };

  const handleGoogleResolveSelected = async () => {
    if (selectedIds.length === 0) return;
    setGoogleResolving(true);
    try {
      await fetch('/api/google-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: selectedIds }),
      });
      setSelectedIds([]);
      // Poll for updates
      const poll = setInterval(() => {
        loadLeads();
        fetch('/api/google-resolve')
          .then((r) => r.json())
          .then((data) => {
            const latest = data.runs?.[0];
            if (!latest || latest.status === 'completed' || latest.status === 'failed') {
              clearInterval(poll);
              setGoogleResolving(false);
            }
          })
          .catch(() => {});
      }, 3000);
    } catch (e) {
      console.error(e);
      setGoogleResolving(false);
    }
  };

  const openDetail = (id: string) => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setSelectedLead(data);
        setDetailOpen(true);
      })
      .catch(console.error);
  };

  const handleEnrichSelected = () => {
    if (selectedIds.length === 0) return;
    setPreviewMode('selected');
    setPreviewOpen(true);
  };

  const handleEnrichFiltered = () => {
    setPreviewMode('filtered');
    setPreviewOpen(true);
  };

  const handleEnrichConfirm = async (mode: EnrichmentMode, config: EnrichmentConfig) => {
    setEnriching(true);
    try {
      const body: Record<string, unknown> = { enrichmentMode: mode, enrichmentConfig: config };
      if (previewMode === 'selected') {
        body.businessIds = selectedIds;
      } else {
        body.filters = filters;
      }

      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      setSelectedIds([]);
      loadLeads();

      if (data.enrichmentRunId) {
        startPolling(data.enrichmentRunId);
      } else {
        setEnriching(false);
      }
    } catch (e) {
      console.error(e);
      setEnriching(false);
    }
  };

  const handleExclude = async (excluded: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      await fetch('/api/leads/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: selectedIds, excluded }),
      });
      setSelectedIds([]);
      loadLeads();
    } catch (e) {
      console.error(e);
    }
  };

  const handleExcludeToggleFromDetail = (_id: string, _excluded: boolean) => {
    loadLeads();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportFilters = {
        ...filters,
        hasEmailOnly,
        preferredOnly,
      };

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportFilters),
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
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExclude(true)}
              disabled={selectedIds.length === 0}
            >
              <Ban className="mr-1 h-3 w-3" />
              Exclude ({selectedIds.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExclude(false)}
              disabled={selectedIds.length === 0}
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              Include ({selectedIds.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoogleResolveSelected}
              disabled={selectedIds.length === 0 || googleResolving}
            >
              <Globe className="mr-1 h-3 w-3" />
              {googleResolving ? 'Resolving...' : `Google Resolve (${selectedIds.length})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleEnrichSelected}
              disabled={selectedIds.length === 0 || enriching}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {enriching ? 'Enriching...' : `Enrich Selected (${selectedIds.length})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleEnrichFiltered}
              disabled={enriching}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Enrich All Filtered
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
            value={filters.googleStatus || 'all'}
            onValueChange={(v) => setFilters({ ...filters, googleStatus: v === 'all' ? undefined : v, page: 1 })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Google Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Google Status</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="possible">Possible</SelectItem>
              <SelectItem value="no_match">No Match</SelectItem>
              <SelectItem value="not_resolved">Not Resolved</SelectItem>
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

          <Select
            value={filters.excluded || 'included'}
            onValueChange={(v) => setFilters({ ...filters, excluded: v as 'included' | 'excluded' | 'all', page: 1 })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Included Only" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="included">Included Only</SelectItem>
              <SelectItem value="excluded">Excluded Only</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              placeholder="Min Score"
              className="w-28"
              min={0}
              max={100}
              value={filters.scoreMin ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  scoreMin: e.target.value ? Number(e.target.value) : undefined,
                  page: 1,
                })
              }
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="number"
              placeholder="Max Score"
              className="w-28"
              min={0}
              max={100}
              value={filters.scoreMax ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  scoreMax: e.target.value ? Number(e.target.value) : undefined,
                  page: 1,
                })
              }
            />
          </div>

          <Input
            placeholder="Search business name..."
            className="w-64"
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          />
        </div>

        {/* Export options + Settings */}
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">Export options:</span>
            <label className="flex items-center gap-1.5">
              <Checkbox checked={hasEmailOnly} onCheckedChange={(v) => setHasEmailOnly(!!v)} />
              <span>Has Email Only</span>
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox checked={preferredOnly} onCheckedChange={(v) => setPreferredOnly(!!v)} />
              <span>Preferred Contacts Only</span>
            </label>
          </div>
          <label className="flex items-center gap-1.5 border-l pl-4">
            <Checkbox
              checked={googleAutoResolve}
              onCheckedChange={(v) => handleToggleGoogleAutoResolve(!!v)}
              disabled={!settingsLoaded}
            />
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Google Auto-Resolve</span>
          </label>
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
          onExcludeToggle={handleExcludeToggleFromDetail}
        />

        <EnrichmentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          businessIds={previewMode === 'selected' ? selectedIds : undefined}
          filters={previewMode === 'filtered' ? filters : undefined}
          onConfirm={handleEnrichConfirm}
        />
      </div>
    </AppLayout>
  );
}
