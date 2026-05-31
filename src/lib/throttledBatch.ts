export function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ThrottledBatchOptions<T> = {
  items: T[];
  intervalMs: number;
  runItem: (item: T) => Promise<void>;
  sleep?: (ms: number) => Promise<unknown>;
};

export async function runThrottledBatch<T>({
  items,
  intervalMs,
  runItem,
  sleep = defaultSleep,
}: ThrottledBatchOptions<T>): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    try {
      await runItem(item);
      sent += 1;
    } catch {
      failed += 1;
    }

    if (i < items.length - 1) {
      await sleep(intervalMs);
    }
  }

  return { sent, failed };
}
