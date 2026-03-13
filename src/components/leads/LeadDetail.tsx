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
import type { LeadDetail as LeadDetailType } from '@/types';

interface LeadDetailProps {
  lead: LeadDetailType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetail({ lead, open, onOpenChange }: LeadDetailProps) {
  const [manualScore, setManualScore] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{lead.displayBusinessName}</SheetTitle>
          <SheetDescription>{lead.normalizedAddress || 'No address'}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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

          {/* Enrichment */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Enrichment Data</h4>
            {lead.enrichment ? (
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.fullName || `${c.firstName} ${c.lastName}`}</span>
                    {c.isPreferred && (
                      <Badge className="bg-blue-100 text-blue-800" variant="secondary">
                        Preferred
                      </Badge>
                    )}
                  </div>
                  {c.title && <div className="text-muted-foreground">{c.title}</div>}
                  {c.email && <div className="text-green-600">{c.email}</div>}
                  {c.phone && <div>{c.phone}</div>}
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
