'use client';

import React from 'react';
import { AppLayout } from './AppLayout';

export function PageLoading() {
  return (
    <AppLayout>
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    </AppLayout>
  );
}
