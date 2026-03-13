import prisma from '../prisma';
import { runScrape } from '../scraper/dbpr-scraper';
import { enrichBusiness } from '../enrichment/apollo';
import { scoreBusiness } from '../scoring/lead-scorer';
import { sleep } from '../utils';

const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Background job worker that polls the database for pending scrape and
 * enrichment jobs. Runs as a separate process via `npm run worker`.
 *
 * Job types:
 * - Scrape jobs: picks up pending ScrapeRun records
 * - Enrichment jobs: picks up pending EnrichmentRun records
 */
export async function startWorker(): Promise<void> {
  console.log('[Worker] Starting job worker...');
  console.log('[Worker] Polling every', POLL_INTERVAL / 1000, 'seconds');

  let running = true;

  process.on('SIGINT', () => {
    console.log('[Worker] Shutting down...');
    running = false;
  });

  process.on('SIGTERM', () => {
    console.log('[Worker] Shutting down...');
    running = false;
  });

  while (running) {
    try {
      // Process pending scrape jobs
      await processPendingScrapes();

      // Process pending enrichment jobs
      await processPendingEnrichments();
    } catch (error) {
      console.error('[Worker] Error in job loop:', error);
    }

    await sleep(POLL_INTERVAL);
  }

  console.log('[Worker] Stopped.');
}

async function processPendingScrapes(): Promise<void> {
  const pendingRun = await prisma.scrapeRun.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (!pendingRun) return;

  console.log(
    `[Worker] Found pending scrape: ${pendingRun.id} (${pendingRun.county})`
  );

  const licenseTypes = pendingRun.selectedLicenseTypes as string[];

  await runScrape({
    runId: pendingRun.id,
    county: pendingRun.county,
    licenseTypes,
  });
}

async function processPendingEnrichments(): Promise<void> {
  const pendingRun = await prisma.enrichmentRun.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (!pendingRun) return;

  console.log(`[Worker] Found pending enrichment: ${pendingRun.id}`);

  try {
    await prisma.enrichmentRun.update({
      where: { id: pendingRun.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const filterJson = pendingRun.filterJson as Record<string, any> | null;
    const businessIds: string[] = filterJson?.businessIds || [];

    let enriched = 0;
    let failed = 0;

    for (const businessId of businessIds) {
      try {
        const business = await prisma.business.findUnique({
          where: { id: businessId },
        });

        if (business) {
          await enrichBusiness(business);
          await scoreBusiness(businessId);
          enriched++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`[Worker] Enrichment failed for ${businessId}:`, error);
        failed++;
      }
    }

    await prisma.enrichmentRun.update({
      where: { id: pendingRun.id },
      data: {
        status: 'completed',
        totalEnriched: enriched,
        totalFailed: failed,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.enrichmentRun.update({
      where: { id: pendingRun.id },
      data: {
        status: 'failed',
        errorMessage: message.substring(0, 1000),
        completedAt: new Date(),
      },
    });
  }
}
