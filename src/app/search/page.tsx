'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SearchForm } from '@/components/search/SearchForm';
import { ScrapeHistory } from '@/components/search/ScrapeHistory';
import type { ScrapeRunSummary } from '@/types';

export default function SearchPage() {
  const [history, setHistory] = useState<ScrapeRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(() => {
    fetch('/api/scrape')
      .then((r) => r.json())
      .then((data) => setHistory(data.runs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Search & Scrape</h1>
          <p className="text-muted-foreground">
            Search Florida DBPR for licensed contractors by county and license type
          </p>
        </div>
        <SearchForm onSubmit={loadHistory} />
        <ScrapeHistory runs={history} loading={loading} />
      </div>
    </AppLayout>
  );
}
