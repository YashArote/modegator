// Dummy store logic for Action logs, which will be implemented in storage.
import { ActionLog } from '../../shared/types';
import { redis } from '@devvit/web/server';
import { KEYS } from '../storage/keys';

export async function appendToLog(logs: ActionLog[], ruleName: string) {
  if (!logs || logs.length === 0) return;
  
  const now = new Date();
  const parts = now.toISOString().split('T');
  const dateKey = (parts[0] || '').replace(/-/g, '');
  const key = `${KEYS.ACTION_LOG_PREFIX}${dateKey}`;
  
  const formattedLogs = logs.map(log => ({
    ...log,
    ruleName: log.ruleName || ruleName,
  }));
  
  for (const log of formattedLogs) {
    await redis.zAdd(key, { member: JSON.stringify(log), score: log.timestamp });
  }
  
  // Storage Capping & Optimization
  // Enforce Max 10,000 logs per day to stay well under Redis limits (~5MB per day)
  await redis.zRemRangeByRank(key, 0, -10001); 
  // Set 30 day expiration on the daily bucket
  await redis.expire(key, 30 * 24 * 60 * 60);
}

export async function getLogs(limit: number = 50, cursor?: number): Promise<ActionLog[]> {
  const allLogs: ActionLog[] = [];
  
  // Use cursor as start date, or current date if no cursor
  let currentDate = cursor ? new Date(cursor) : new Date();
  
  // We'll search backwards for up to 30 days (max retention) to find logs
  for (let i = 0; i < 30; i++) {
    const parts = currentDate.toISOString().split('T');
    const dateKey = (parts[0] || '').replace(/-/g, '');
    const key = `${KEYS.ACTION_LOG_PREFIX}${dateKey}`;

    const maxScore = cursor ? cursor : '+inf';
    const logsRaw = await redis.zRange(key, '-inf', maxScore as number, { by: 'score' });
    
    // Parse and sort descending by timestamp
    const dailyLogs = logsRaw.map(l => JSON.parse(l.member) as ActionLog)
                             .sort((a, b) => b.timestamp - a.timestamp);
    
    // Filter out exactly the cursor log if it was included
    const filtered = cursor ? dailyLogs.filter(l => l.timestamp < cursor) : dailyLogs;
    allLogs.push(...filtered);

    if (allLogs.length >= limit) break;
    
    // Move back one day
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return allLogs.slice(0, limit);
}

export async function clearLogs(): Promise<void> {
  const now = new Date();
  const parts = now.toISOString().split('T');
  const dateKey = (parts[0] || '').replace(/-/g, '');
  const key = `${KEYS.ACTION_LOG_PREFIX}${dateKey}`;
  await redis.del(key);
}
