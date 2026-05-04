import { checkRateLimit } from './rateLimit';

type CheckFn = typeof checkRateLimit;

export async function allowRsvpGet(ip: string, token: string, check: CheckFn = checkRateLimit): Promise<boolean> {
  const ipAllowed = await check(`rsvp:get:ip:${ip}`, { limit: 120, windowSeconds: 60 });
  const tokenAllowed = await check(`rsvp:get:token:${token}`, { limit: 60, windowSeconds: 60 });
  return ipAllowed && tokenAllowed;
}

export async function allowRsvpPost(ip: string, token: string, check: CheckFn = checkRateLimit): Promise<boolean> {
  const ipAllowed = await check(`rsvp:post:ip:${ip}`, { limit: 30, windowSeconds: 60 });
  const tokenAllowed = await check(`rsvp:post:token:${token}`, { limit: 15, windowSeconds: 60 });
  return ipAllowed && tokenAllowed;
}
