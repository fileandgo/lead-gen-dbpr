import { startWorker } from './job-worker';

startWorker().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
