import { redis, scheduler } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import type { ModKitConfig } from '../../shared/types';

export async function syncScheduledTasks(config: ModKitConfig) {
  try {
    // 1. Fetch old job IDs from Redis
    const oldJobsRaw = await redis.get(KEYS.SCHEDULED_JOBS);
    if (oldJobsRaw) {
      const oldJobs: string[] = JSON.parse(oldJobsRaw);
      // 2. Cancel all old jobs
      for (const jobId of oldJobs) {
        try {
          await scheduler.cancelJob(jobId);
        } catch (e) {
          console.warn(`Failed to cancel old job ${jobId}:`, e);
        }
      }
    }

    const newJobs: string[] = [];

    // 3. Register new jobs
    if (config.scheduled && config.scheduled.length > 0) {
      for (const task of config.scheduled) {
        if (!task.cron) continue;

        try {
          const jobId = await scheduler.runJob({
            name: 'yaml-runner',
            cron: task.cron,
            data: { taskName: task.name },
          });
          newJobs.push(jobId);
          console.log(`Registered scheduled task '${task.name}' with cron '${task.cron}' (Job ID: ${jobId})`);
        } catch (e) {
          console.error(`Failed to register scheduled task '${task.name}':`, e);
        }
      }
    }

    // 4. Save new job IDs
    await redis.set(KEYS.SCHEDULED_JOBS, JSON.stringify(newJobs));

  } catch (err) {
    console.error('Failed to sync scheduled tasks:', err);
  }
}
