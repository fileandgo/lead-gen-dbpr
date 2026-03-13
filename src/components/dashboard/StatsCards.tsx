'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DashboardStats } from '@/types';
import { Building2, Sparkles, Mail, TrendingUp } from 'lucide-react';

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      title: 'Total Businesses',
      value: stats.totalBusinesses.toLocaleString(),
      icon: Building2,
      description: 'Unique businesses scraped',
    },
    {
      title: 'Enriched',
      value: stats.enrichedBusinesses.toLocaleString(),
      icon: Sparkles,
      description: 'Companies enriched via Apollo',
    },
    {
      title: 'Leads with Email',
      value: stats.leadsWithEmail.toLocaleString(),
      icon: Mail,
      description: 'Preferred contacts with email',
    },
    {
      title: 'Avg Lead Score',
      value: stats.averageScore.toString(),
      icon: TrendingUp,
      description: 'Out of 100',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Scrape Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentScrapes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scrape runs yet. Go to Search & Scrape to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>County</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Unique</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentScrapes.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.county}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          run.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : run.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : run.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }
                        variant="secondary"
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.totalRawRecords}</TableCell>
                    <TableCell>{run.totalUniqueRecords}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
