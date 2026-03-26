import prisma from '../prisma';
import { runScrape } from '../scraper/dbpr-scraper';
import { enrichCompany, enrichBusinessContacts, enrichBusiness } from '../enrichment/apollo';
import { resolveBusinessGoogle, isGoogleAutoResolveEnabled } from '../enrichment/google-resolver';
import { scoreBusiness } from '../scoring/lead-scorer';
import { sleep } from '../utils';
import { ENRICHMENT_STAGE, BUSINESS_ENRICHMENT_STATUS, ENRICHMENT_PRESETS, GOOGLE_RESOLUTION_STATUS } from '../constants';
import type { EnrichmentConfig } from '@/types';

const POLL_INTERVAL = 5000; // 5 seconds

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
      await processPendingScrapes();
      await processPendingGoogleResolutions();
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

  // Auto-trigger Google resolution for newly scraped businesses
  await autoTriggerGoogleResolution(pendingRun.id, 'scrape');
}

/**
 * After a scrape or import completes, queue Google resolution for new businesses
 * that don't already have a resolution result.
 */
async function autoTriggerGoogleResolution(
  sourceRunId: string,
  source: 'scrape' | 'import'
): Promise<void> {
  try {
    const enabled = await isGoogleAutoResolveEnabled();
    if (!enabled) {
      console.log('[Worker] Google auto-resolution is disabled, skipping.');
      return;
    }

    // Find businesses from this run that don't have a Google resolution yet
    let businessIds: string[] = [];

    if (source === 'scrape') {
      // Get businesses linked to raw licenses from this scrape run
      const businesses = await prisma.business.findMany({
        where: {
          businessLicenses: { some: { rawLicense: { scrapeRunId: sourceRunId } } },
          googleResolution: null,
          excluded: false,
        },
        select: { id: true },
      });
      businessIds = businesses.map((b) => b.id);
    } else {
      // Import: get businesses linked to this import run
      const businesses = await prisma.business.findMany({
        where: {
          importRunId: sourceRunId,
          googleResolution: null,
          excluded: false,
        },
        select: { id: true },
      });
      businessIds = businesses.map((b) => b.id);
    }

    if (businessIds.length === 0) {
      console.log(`[Worker] No new businesses need Google resolution from ${source} ${sourceRunId}`);
      return;
    }

    console.log(`[Worker] Auto-queuing Google resolution for ${businessIds.length} businesses from ${source} ${sourceRunId}`);

    await prisma.googleResolutionRun.create({
      data: {
        triggeredBy: `auto_${source}`,
        businessIds,
        status: 'pending',
        totalSubmitted: businessIds.length,
      },
    });
  } catch (error) {
    console.error(`[Worker] Failed to auto-trigger Google resolution for ${source} ${sourceRunId}:`, error);
  }
}

async function processPendingGoogleResolutions(): Promise<void> {
  const pendingRun = await prisma.googleResolutionRun.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (!pendingRun) return;

  console.log(`[Worker] Found pending Google resolution: ${pendingRun.id}`);

  try {
    await prisma.googleResolutionRun.update({
      where: { id: pendingRun.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const businessIds: string[] = (pendingRun.businessIds as string[]) || [];
    let matched = 0;
    let possible = 0;
    let noMatch = 0;
    let failed = 0;

    for (const businessId of businessIds) {
      try {
        const business = await prisma.business.findUnique({
          where: { id: businessId },
        });

        if (!business || business.excluded) {
          if (business?.excluded) {
            console.log(`[Worker] Skipping excluded business for Google: ${business.displayBusinessName}`);
          }
          continue;
        }

        const status = await resolveBusinessGoogle(business);

        if (status === GOOGLE_RESOLUTION_STATUS.MATCHED) matched++;
        else if (status === GOOGLE_RESOLUTION_STATUS.POSSIBLE) possible++;
        else if (status === GOOGLE_RESOLUTION_STATUS.NO_MATCH) noMatch++;
        else if (status === GOOGLE_RESOLUTION_STATUS.FAILED) failed++;

        // Update run progress
        await prisma.googleResolutionRun.update({
          where: { id: pendingRun.id },
          data: { totalMatched: matched, totalPossible: possible, totalNoMatch: noMatch, totalFailed: failed },
        });

        // Rate limit: small delay between API calls
        await sleep(200);
      } catch (error) {
        console.error(`[Worker] Google resolution failed for ${businessId}:`, error);
        failed++;
      }
    }

    await prisma.googleResolutionRun.update({
      where: { id: pendingRun.id },
      data: {
        status: 'completed',
        totalMatched: matched,
        totalPossible: possible,
        totalNoMatch: noMatch,
        totalFailed: failed,
        completedAt: new Date(),
      },
    });

    console.log(
      `[Worker] Google resolution run ${pendingRun.id} completed: ` +
      `${matched} matched, ${possible} possible, ${noMatch} no match, ${failed} failed`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.googleResolutionRun.update({
      where: { id: pendingRun.id },
      data: {
        status: 'failed',
        errorMessage: message.substring(0, 1000),
        completedAt: new Date(),
      },
    });
  }
}

async function processPendingEnrichments(): Promise<void> {
  const pendingRun = await prisma.enrichmentRun.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (!pendingRun) return;

  console.log(`[Worker] Found pending enrichment: ${pendingRun.id} (stage: ${pendingRun.enrichmentStage})`);

  try {
    await prisma.enrichmentRun.update({
      where: { id: pendingRun.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const stage = pendingRun.enrichmentStage || ENRICHMENT_STAGE.FULL;
    const businessIds: string[] = (pendingRun.businessIds as string[]) || [];
    const enrichmentConfig = (pendingRun.enrichmentConfig as unknown as EnrichmentConfig) || ENRICHMENT_PRESETS.owner_admin;

    let enriched = 0;
    let failed = 0;

    for (const businessId of businessIds) {
      try {
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          include: { enrichment: true },
        });

        if (!business) {
          failed++;
          continue;
        }

        // Skip excluded businesses
        if (business.excluded) {
          console.log(`[Worker] Skipping excluded business: ${business.displayBusinessName}`);
          continue;
        }

        if (stage === ENRICHMENT_STAGE.COMPANY) {
          await enrichCompany(business);
          await scoreBusiness(businessId);
          enriched++;
        } else if (stage === ENRICHMENT_STAGE.CONTACTS) {
          // Contacts-only: requires existing company enrichment
          if (business.enrichment?.apolloOrgId) {
            await enrichBusinessContacts(
              businessId,
              business.enrichment.apolloOrgId,
              business.enrichment.domain,
              enrichmentConfig
            );
            await scoreBusiness(businessId);
            enriched++;
          } else {
            console.warn(`[Worker] No company enrichment for ${businessId}, skipping contacts stage`);
            failed++;
          }
        } else {
          // Full enrichment (passes config for contact phase)
          await enrichBusiness(business, enrichmentConfig);
          await scoreBusiness(businessId);
          enriched++;
        }

        // Update run progress
        await prisma.enrichmentRun.update({
          where: { id: pendingRun.id },
          data: { totalEnriched: enriched, totalFailed: failed },
        });
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

    console.log(`[Worker] Enrichment run ${pendingRun.id} completed: ${enriched} enriched, ${failed} failed`);
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
