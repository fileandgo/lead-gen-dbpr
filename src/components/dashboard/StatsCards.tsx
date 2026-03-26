'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DashboardStats } from '@/types';
import { Building2, Sparkles, Mail, TrendingUp, AlertTriangle, XCircle } from 'lucide-react';

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
      description: `${stats.partialBusinesses} partial, ${stats.failedBusinesses} failed`,
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

      {/* Enrichment Errors */}
      {stats.recentEnrichmentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Enrichment Issues ({stats.partialBusinesses + stats.failedBusinesses})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentEnrichmentErrors.map((err) => (
                  <TableRow key={err.id}>
                    <TableCell className="font-medium">{err.businessName}</TableCell>
                    <TableCell>{err.county || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          err.enrichmentStatus === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }
                        variant="secondary"
                      >
                        {err.enrichmentStatus === 'failed' ? (
                          <><XCircle className="mr-1 h-3 w-3" />Error</>
                        ) : (
                          <><AlertTriangle className="mr-1 h-3 w-3" />No Match</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {err.errorReason || 'No details available'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(err.enrichedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Enrichment Runs */}
      {stats.recentEnrichmentRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Enrichment Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Enriched</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentEnrichmentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="capitalize">{run.enrichmentStage}</TableCell>
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
                    <TableCell>{run.totalSubmitted}</TableCell>
                    <TableCell>{run.totalEnriched}</TableCell>
                    <TableCell>
                      {run.totalFailed > 0 ? (
                        <span className="text-red-600 font-medium">{run.totalFailed}</span>
                      ) : (
                        run.totalFailed
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Scrape Runs */}
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
