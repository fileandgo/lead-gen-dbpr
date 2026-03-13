/**
 * Background job worker entry point.
 * Run with: npm run worker (or npx tsx worker.ts)
 *
 * This process polls the database for pending scrape and enrichment jobs
 * and processes them in the background, separate from the Next.js server.
 */
import { startWorker } from './src/lib/worker/job-worker';

startWorker().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
