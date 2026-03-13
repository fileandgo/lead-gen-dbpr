'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ExportHistory } from '@/components/exports/ExportHistory';
import type { ExportRunRow } from '@/types';

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/export')
      .then((r) => r.json())
      .then((data) => setExports(data.exports || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Exports</h1>
          <p className="text-muted-foreground">Download past lead exports</p>
        </div>
        <ExportHistory exports={exports} loading={loading} />
      </div>
    </AppLayout>
  );
}
