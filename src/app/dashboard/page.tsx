'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCards } from '@/components/dashboard/StatsCards';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error(`Dashboard API error: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data && typeof data.totalBusinesses === 'number') {
          setStats(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your lead generation pipeline</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : stats ? (
          <StatsCards stats={stats} />
        ) : (
          <p className="text-muted-foreground">Failed to load dashboard data.</p>
        )}
      </div>
    </AppLayout>
  );
}
