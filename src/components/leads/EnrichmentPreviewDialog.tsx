'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ENRICHMENT_PRESETS, TITLE_MODE_DESCRIPTIONS, CREDIT_COSTS } from '@/lib/constants';
import type { EnrichmentPreview, EnrichmentMode, EnrichmentConfig, TitleMode, LeadFilters, EnrichmentWarning } from '@/types';

type PresetKey = keyof typeof ENRICHMENT_PRESETS | 'custom';

interface EnrichmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessIds?: string[];
  filters?: LeadFilters;
  onConfirm: (mode: EnrichmentMode, config: EnrichmentConfig) => void;
}

interface PreviewData {
  previews: EnrichmentPreview[];
  totalCount: number;
  readyCount: number;
  alreadyEnrichedCount: number;
  excludedCount: number;
}

const DEFAULT_PRESET: PresetKey = 'owner_admin';

const DEFAULT_CONFIG: EnrichmentConfig = {
  titleMode: 'mixed',
  maxContacts: 2,
  requireEmail: true,
  verifiedEmailOnly: true,
  skipExcludedTitles: true,
};

/** Warning badge configuration */
const WARNING_CONFIG: Record<EnrichmentWarning, { label: string; className: string }> = {
  excluded: { label: 'Excluded', className: 'border-red-300 text-red-600' },
  already_enriched: { label: 'Already enriched', className: 'border-blue-300 text-blue-600' },
  already_exported: { label: 'Exported', className: 'border-indigo-300 text-indigo-600' },
  no_business_name: { label: 'No name', className: 'border-red-300 text-red-600' },
  no_domain: { label: 'No domain', className: 'border-yellow-300 text-yellow-600' },
  weak_match: { label: 'Weak match', className: 'border-amber-300 text-amber-600' },
  no_address: { label: 'No address', className: 'border-yellow-300 text-yellow-600' },
  missing_city: { label: 'No city', className: 'border-yellow-300 text-yellow-600' },
  likely_owner_operated: { label: 'Owner-operated', className: 'border-purple-300 text-purple-600' },
};

export function EnrichmentPreviewDialog({
  open,
  onOpenChange,
  businessIds,
  filters,
  onConfirm,
}: EnrichmentPreviewDialogProps) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<EnrichmentMode>('company_and_contacts');
  const [preset, setPreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [config, setConfig] = useState<EnrichmentConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }

    // Reset to defaults when opening
    setMode('company_and_contacts');
    setPreset(DEFAULT_PRESET);
    setConfig(DEFAULT_CONFIG);

    setLoading(true);
    fetch('/api/enrich/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessIds, filters }),
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, businessIds, filters]);

  const handlePresetChange = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      const p = ENRICHMENT_PRESETS[key];
      setConfig({
        titleMode: p.titleMode,
        maxContacts: p.maxContacts,
        requireEmail: p.requireEmail,
        verifiedEmailOnly: p.verifiedEmailOnly,
        skipExcludedTitles: p.skipExcludedTitles,
      });
    }
  };

  const handleConfigChange = (partial: Partial<EnrichmentConfig>) => {
    setPreset('custom');
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const handleConfirm = () => {
    onConfirm(mode, config);
    onOpenChange(false);
  };

  const showContactConfig = mode !== 'company_only';

  // Credit estimate
  const creditEstimate = useMemo(() => {
    if (!data) return null;
    const ready = data.readyCount;

    let companyCredits = 0;
    let contactCredits = 0;

    if (mode === 'company_only' || mode === 'company_and_contacts') {
      companyCredits = ready * CREDIT_COSTS.COMPANY_ENRICH;
    }
    if (mode === 'company_and_contacts' || mode === 'contacts_only') {
      contactCredits = ready * config.maxContacts * CREDIT_COSTS.PERSON_ENRICH;
    }

    return {
      ready,
      companyCredits,
      contactCredits,
      totalCredits: companyCredits + contactCredits,
      maxCompanyEnrichments: mode !== 'contacts_only' ? ready : 0,
      maxContactEnrichments: mode !== 'company_only' ? ready * config.maxContacts : 0,
    };
  }, [data, mode, config.maxContacts]);

  // Dynamic confirm button text
  const confirmLabel = useMemo(() => {
    const count = data?.readyCount || 0;
    if (mode === 'company_only') return `Confirm Company Enrichment (${count})`;
    if (mode === 'contacts_only') return `Confirm Contacts Enrichment (${count})`;
    return `Confirm Company + Contacts Enrichment (${count})`;
  }, [mode, data?.readyCount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Review Enrichment{data ? ` \u2014 ${data.totalCount} business${data.totalCount !== 1 ? 'es' : ''}` : ''}
          </DialogTitle>
          <DialogDescription>
            Review the selected businesses before starting Apollo enrichment. Already enriched and excluded businesses will be skipped automatically.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data ? (
          <>
            {/* Enrichment Mode */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Enrichment Mode</span>
              <Select value={mode} onValueChange={(v) => setMode(v as EnrichmentMode)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_and_contacts">Company + Contacts</SelectItem>
                  <SelectItem value="company_only">Company Only</SelectItem>
                  <SelectItem value="contacts_only">Contacts Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contact enrichment config */}
            {showContactConfig && (
              <div className="space-y-3 rounded-md border p-3">
                {/* Preset row */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Preset</span>
                  <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetKey)}>
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ENRICHMENT_PRESETS).map(([key, p]) => (
                        <SelectItem key={key} value={key}>
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {preset !== 'custom' && (
                    <span className="text-xs text-muted-foreground">
                      {ENRICHMENT_PRESETS[preset as keyof typeof ENRICHMENT_PRESETS]?.description}
                    </span>
                  )}
                </div>

                {/* Controls row 1: Title Mode + Max Contacts */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Title Mode</span>
                      <Select
                        value={config.titleMode}
                        onValueChange={(v) => handleConfigChange({ titleMode: v as TitleMode })}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="mixed">Mixed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground pl-0.5">
                      {TITLE_MODE_DESCRIPTIONS[config.titleMode]}
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-1.5">Max Contacts</span>
                    <Select
                      value={String(config.maxContacts)}
                      onValueChange={(v) => handleConfigChange({ maxContacts: Number(v) })}
                    >
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Controls row 2: Checkboxes */}
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={config.requireEmail}
                      onCheckedChange={(v) => handleConfigChange({ requireEmail: !!v })}
                    />
                    <span>Require Email</span>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={config.verifiedEmailOnly}
                      onCheckedChange={(v) => handleConfigChange({ verifiedEmailOnly: !!v })}
                    />
                    <span>Verified Email Only</span>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={config.skipExcludedTitles}
                      onCheckedChange={(v) => handleConfigChange({ skipExcludedTitles: !!v })}
                    />
                    <span>Skip Excluded Titles</span>
                  </label>
                </div>
              </div>
            )}

            {/* Summary counts */}
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">{data.readyCount} ready</span>
              <span className="text-muted-foreground">{data.alreadyEnrichedCount} already enriched (skip)</span>
              <span className="text-muted-foreground">{data.excludedCount} excluded (skip)</span>
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto border rounded-md max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Trade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.previews.map((p) => (
                    <TableRow
                      key={p.id}
                      className={
                        p.excluded || p.warnings.includes('already_enriched')
                          ? 'opacity-50'
                          : undefined
                      }
                    >
                      <TableCell className="font-medium text-sm">
                        {p.displayBusinessName || '(no name)'}
                      </TableCell>
                      <TableCell className="text-sm">{p.county || '-'}</TableCell>
                      <TableCell className="text-xs">
                        {p.primaryTrade?.replace('Certified ', '').replace('Registered ', '') || '-'}
                      </TableCell>
                      <TableCell>
                        <EnrichmentStatusBadge status={p.enrichmentStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {p.warnings.map((w) => {
                            const cfg = WARNING_CONFIG[w];
                            return (
                              <Badge
                                key={w}
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${cfg.className}`}
                              >
                                {cfg.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.totalCount > 200 && (
              <p className="text-xs text-muted-foreground">
                Showing first 200 of {data.totalCount} businesses
              </p>
            )}

            {/* Credit estimate */}
            {creditEstimate && (
              <>
                <Separator />
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                  <h4 className="text-sm font-medium">Estimated Apollo Credit Usage</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Businesses to enrich</span>
                    <span>{creditEstimate.ready}</span>
                    {creditEstimate.maxCompanyEnrichments > 0 && (
                      <>
                        <span className="text-muted-foreground">Company enrichments (max)</span>
                        <span>{creditEstimate.maxCompanyEnrichments}</span>
                      </>
                    )}
                    {creditEstimate.maxContactEnrichments > 0 && (
                      <>
                        <span className="text-muted-foreground">Contact enrichments (max)</span>
                        <span>
                          up to {creditEstimate.maxContactEnrichments}
                          <span className="text-muted-foreground ml-1">
                            ({creditEstimate.ready} x {config.maxContacts} contacts)
                          </span>
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground font-medium pt-1">Estimated max credits</span>
                    <span className="font-medium pt-1">{creditEstimate.totalCredits}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Actual usage may be lower. Searches are free; credits are used per enrichment call.
                  </p>
                </div>
              </>
            )}
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !data || data.readyCount === 0}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrichmentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    none: { label: 'Not Enriched', className: 'bg-gray-100 text-gray-700' },
    queued: { label: 'Queued', className: 'bg-yellow-100 text-yellow-700' },
    company_done: { label: 'Company Only', className: 'bg-blue-100 text-blue-700' },
    enriched: { label: 'Enriched', className: 'bg-green-100 text-green-700' },
    partial: { label: 'Partial', className: 'bg-orange-100 text-orange-700' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  };

  const c = config[status] || config.none;
  return <Badge className={c.className} variant="secondary">{c.label}</Badge>;
}

export { EnrichmentStatusBadge };
