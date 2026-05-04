import { sql } from './db';

type WindowConfig = {
  limit: number;
  windowSeconds: number;
};

let initialized = false;

async function ensureTable(): Promise<void> {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      key text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )
  `;
  initialized = true;
}

function windowStartIso(windowSeconds: number): string {
  const seconds = Math.floor(Date.now() / 1000);
  const start = seconds - (seconds % windowSeconds);
  return new Date(start * 1000).toISOString();
}

export async function checkRateLimit(key: string, config: WindowConfig): Promise<boolean> {
  await ensureTable();
  const start = windowStartIso(config.windowSeconds);

  const rows = await sql`
    INSERT INTO api_rate_limits (key, window_start, count)
    VALUES (${key}, ${start}::timestamptz, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = api_rate_limits.count + 1
    RETURNING count
  `;

  const count = Number(rows[0]?.count ?? 0);
  return count <= config.limit;
}
