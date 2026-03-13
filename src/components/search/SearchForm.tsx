'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { FLORIDA_COUNTIES, TARGET_LICENSE_TYPES } from '@/lib/constants';
import { Search, Loader2 } from 'lucide-react';

const licenseTypeOptions = TARGET_LICENSE_TYPES.map((t) => ({ label: t, value: t }));

export function SearchForm({ onSubmit }: { onSubmit: () => void }) {
  const [county, setCounty] = useState('');
  const [licenseTypes, setLicenseTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (!county || licenseTypes.length === 0) {
      setMessage('Please select a county and at least one license type.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county, licenseTypes }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`Scrape job created (ID: ${data.id}). Worker will process it shortly.`);
        setCounty('');
        setLicenseTypes([]);
        onSubmit();
      } else {
        setMessage(data.error || 'Failed to create scrape job.');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New DBPR Search</CardTitle>
        <CardDescription>
          Select a Florida county and one or more Construction Industry license types to scrape.
          License Category is locked to &quot;Construction Industry&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>License Category</Label>
            <div className="flex h-10 w-full items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              Construction Industry
            </div>
          </div>

          <div className="space-y-2">
            <Label>County</Label>
            <Select value={county} onValueChange={setCounty}>
              <SelectTrigger>
                <SelectValue placeholder="Select a county" />
              </SelectTrigger>
              <SelectContent>
                {FLORIDA_COUNTIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>License Types</Label>
          <MultiSelect
            options={licenseTypeOptions}
            selected={licenseTypes}
            onChange={setLicenseTypes}
            placeholder="Select license types..."
          />
        </div>

        {message && (
          <p className={`text-sm ${message.includes('created') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={loading} className="w-full md:w-auto">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Job...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Run Search
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
