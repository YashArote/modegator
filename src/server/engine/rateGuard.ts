import { redis } from '@devvit/web/server';
import { KEYS } from '../storage/keys';

export async function checkRateLimit(username: string | undefined, maxPerHour: number): Promise<boolean> {
  if (!username) return true;
  
  const key = `${KEYS.RATE_LIMIT_PREFIX}${username}`;
  
  // Get current count
  const countStr = await redis.get(key);
  let count = 0;
  
  if (countStr) {
    count = parseInt(countStr, 10);
  }
  
  if (count >= maxPerHour) {
    return false;
  }
  
  // Increment and set expiry if it's the first time
  const newCount = await redis.incrBy(key, 1);
  if (newCount === 1) {
    // Expire in 1 hour
    await redis.expire(key, 3600);
  }
  
  return true;
}
