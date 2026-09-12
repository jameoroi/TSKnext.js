import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';

export type JobName = 'email.order' | 'search.product.sync' | 'image.optimize' | 'maintenance.backup';

let queue: Queue | null | undefined;

export function jobsQueue() {
  if (queue !== undefined) return queue;
  const connection = getRedis();
  if (!connection) return (queue = null);
  queue = new Queue('tsk-jobs', { connection, defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 500, removeOnFail: 1000 } });
  return queue;
}

export async function enqueue(name: JobName, data: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  const q = jobsQueue();
  if (!q) return { queued: false, reason: 'redis_not_configured' };
  const job = await q.add(name, data, opts);
  return { queued: true, id: job.id };
}
