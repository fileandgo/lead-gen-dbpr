'use client';

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getScoreBadgeColor, getStatusBadgeColor } from '@/lib/utils';
import { EnrichmentStatusBadge } from '@/components/leads/EnrichmentPreviewDialog';
import { GoogleStatusBadge } from '@/components/leads/LeadsTable';
import type { LeadDetail as LeadDetailType } from '@/types';

interface LeadDetailProps {
  lead: LeadDetailType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExcludeToggle?: (id: string, excluded: boolean) => void;
}

export function LeadDetail({ lead, open, onOpenChange, onExcludeToggle }: LeadDetailProps) {
  const [manualScore, setManualScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [excluding, setExcluding] = useState(false);

  if (!lead) return null;

  const effectiveScore = lead.score?.manualOverride ?? lead.score?.score ?? 0;

  const handleSaveOverride = async () => {
    const value = parseInt(manualScore);
    if (isNaN(value) || value < 0 || value > 100) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualOverride: value }),
      });
      setManualScore('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleExcludeToggle = async () => {
    setExcluding(true);
    try {
      const newExcluded = !lead.excluded;
      await fetch('/api/leads/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: [lead.id], excluded: newExcluded }),
      });
      onExcludeToggle?.(lead.id, newExcluded);
    } catch (e) {
      console.error(e);
    } finally {
      setExcluding(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-2">
              {lead.displayBusinessName}
              {lead.excluded && (
                <Badge variant="outline" className="border-red-300 text-red-600">Excluded</Badge>
              )}
            </div>
          </SheetTitle>
          <SheetDescription>{lead.normalizedAddress || 'No address'}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant={lead.excluded ? 'default' : 'outline'}
              size="sm"
              onClick={handleExcludeToggle}
              disabled={excluding}
            >
              {excluding ? 'Updating...' : lead.excluded ? 'Include Business' : 'Exclude Business'}
            </Button>
          </div>

          {/* Basic Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Business Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">County</div>
              <div>{lead.county || '-'}</div>
              <div className="text-muted-foreground">Primary Trade</div>
              <div>{lead.primaryTrade || '-'}</div>
              <div className="text-muted-foreground">Status</div>
              <div>
                {lead.latestLicenseStatus ? (
                  <Badge className={getStatusBadgeColor(lead.latestLicenseStatus)} variant="secondary">
                    {lead.latestLicenseStatus}
                  </Badge>
                ) : '-'}
              </div>
              <div className="text-muted-foreground">License #</div>
              <div className="font-mono text-xs">{lead.canonicalLicenseNumber || '-'}</div>
            </div>
          </div>

          <Separator />

          {/* Licenses */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Licenses ({lead.licenses.length})</h4>
            {lead.licenses.map((lic) => (
              <div key={lic.id} className="rounded border p-2 text-xs">
                <div className="font-medium">{lic.licenseType}</div>
                <div className="text-muted-foreground">
                  #{lic.licenseNumber} &middot; {lic.status}
                  {lic.expirationDate && ` &middot; Exp: ${lic.expirationDate}`}
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Google Resolution */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Google Business Resolution</h4>
              {lead.googleResolution && (
                <GoogleStatusBadge
                  status={lead.googleResolution.matchStatus as any}
                  domain={lead.googleResolution.resolvedDomain}
                />
              )}
            </div>
            {lead.googleResolution ? (
              <div className="space-y-2">
                {lead.googleResolution.matchStatus === 'matched' && (
                  <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
                    Business confirmed via Google. Domain will be used for Apollo enrichment.
                  </div>
                )}
                {lead.googleResolution.matchStatus === 'possible' && (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
                    Possible match found — review before enrichment.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Resolved Name</div>
                  <div>{lead.googleResolution.resolvedName || '-'}</div>
                  <div className="text-muted-foreground">Domain</div>
                  <div>{lead.googleResolution.resolvedDomain || '-'}</div>
                  <div className="text-muted-foreground">Website</div>
                  <div>
                    {lead.googleResolution.resolvedWebsite ? (
                      <a
                        href={lead.googleResolution.resolvedWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {lead.googleResolution.resolvedWebsite}
                      </a>
                    ) : '-'}
                  </div>
                  <div className="text-muted-foreground">Phone</div>
                  <div>{lead.googleResolution.resolvedPhone || '-'}</div>
                  <div className="text-muted-foreground">Address</div>
                  <div>{lead.googleResolution.resolvedAddress || '-'}</div>
                  <div className="text-muted-foreground">Confidence</div>
                  <div>{lead.googleResolution.confidence != null ? `${(lead.googleResolution.confidence * 100).toFixed(0)}%` : '-'}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not resolved yet — Google step runs automatically after import/scrape</p>
            )}
          </div>

          <Separator />

          {/* Enrichment */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Enrichment Data (Apollo)</h4>
              {lead.enrichment && (
                <EnrichmentStatusBadge status={
                  lead.enrichment.enrichmentStatus === 'completed' ? 'enriched' :
                  lead.enrichment.enrichmentStatus
                } />
              )}
            </div>
            {lead.enrichment ? (
              <div className="space-y-2">
                {lead.enrichment.enrichmentStrategy?.startsWith('person_') && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">
                    Matched via person search (no company data available). Contact found directly from licensee name.
                  </div>
                )}
                {lead.enrichment.errorReason && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                    {lead.enrichment.errorReason}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Company</div>
                  <div>{lead.enrichment.companyName || '-'}</div>
                  <div className="text-muted-foreground">Domain</div>
                  <div>{lead.enrichment.domain || '-'}</div>
                  <div className="text-muted-foreground">Website</div>
                  <div>{lead.enrichment.website || '-'}</div>
                  <div className="text-muted-foreground">Phone</div>
                  <div>{lead.enrichment.phone || '-'}</div>
                  <div className="text-muted-foreground">Employees</div>
                  <div>{lead.enrichment.employeeCount || '-'}</div>
                  <div className="text-muted-foreground">Revenue</div>
                  <div>{lead.enrichment.estimatedRevenue || '-'}</div>
                  <div className="text-muted-foreground">Confidence</div>
                  <div>{lead.enrichment.apolloMatchConfidence || '-'}</div>
                  <div className="text-muted-foreground">Strategy</div>
                  <div>{lead.enrichment.enrichmentStrategy?.replace(/_/g, ' ') || '-'}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not enriched yet</p>
            )}
          </div>

          <Separator />

          {/* Contacts */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Contacts ({lead.contacts.length})</h4>
            {lead.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts found</p>
            ) : (
              lead.contacts.map((c) => (
                <div key={c.id} className="rounded border p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.fullName || `${c.firstName} ${c.lastName}`}</span>
                    {c.isPreferred && (
                      <Badge className="bg-blue-100 text-blue-800" variant="secondary">
                        Preferred
                      </Badge>
                    )}
                    {c.titleBucket && (
                      <Badge
                        variant="secondary"
                        className={
                          c.titleBucket === 'owner'
                            ? 'bg-purple-100 text-purple-700'
                            : c.titleBucket === 'admin'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-gray-100 text-gray-600'
                        }
                      >
                        {c.titleBucket}
                      </Badge>
                    )}
                    {c.contactRankScore != null && (
                      <span className="text-muted-foreground">Rank: {c.contactRankScore}</span>
                    )}
                  </div>
                  {c.title && <div className="text-muted-foreground">{c.title}</div>}
                  {c.email && (
                    <div className={c.emailStatus === 'valid' || c.emailStatus === 'verified' ? 'text-green-600' : 'text-amber-600'}>
                      {c.email}
                      {c.emailStatus && <span className="ml-1 text-[10px]">({c.emailStatus})</span>}
                    </div>
                  )}
                  {c.phone && <div>{c.phone}</div>}
                  {c.contactRankReasons && c.contactRankReasons.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.contactRankReasons.map((reason) => (
                        <Badge key={reason} variant="outline" className="text-[10px] px-1 py-0">
                          {reason.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <Separator />

          {/* Score */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Lead Score</h4>
            {lead.score ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={getScoreBadgeColor(effectiveScore)} variant="secondary">
                    {effectiveScore} / 100
                  </Badge>
                  {lead.score.manualOverride !== null && (
                    <span className="text-xs text-muted-foreground">(Manual override)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(lead.score.scoreBreakdownJson).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <div className="text-muted-foreground">{key}</div>
                      <div>+{value}</div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not scored yet</p>
            )}

            <div className="flex items-end gap-2 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Manual Score Override (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={manualScore}
                  onChange={(e) => setManualScore(e.target.value)}
                  placeholder="e.g. 85"
                  className="w-32"
                />
              </div>
              <Button size="sm" onClick={handleSaveOverride} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
