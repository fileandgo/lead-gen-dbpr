'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ImportWizard } from '@/components/import/ImportWizard';
import { ImportHistory } from '@/components/import/ImportHistory';
import type { ImportRunSummary } from '@/types';

export default function ImportPage() {
  const [history, setHistory] = useState<ImportRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(() => {
    fetch('/api/import')
      .then((r) => r.json())
      .then((data) => setHistory(data.runs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import Leads</h1>
          <p className="text-muted-foreground">
            Import leads from CSV or Excel spreadsheets
          </p>
        </div>
        <ImportWizard onComplete={loadHistory} />
        <ImportHistory runs={history} loading={loading} />
      </div>
    </AppLayout>
  );
}
