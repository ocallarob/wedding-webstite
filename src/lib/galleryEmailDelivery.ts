const RESEND_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type GalleryDeliveryStatus = 'sending' | 'sent' | 'failed' | 'unknown';

export type ExistingGalleryDelivery = {
  status: GalleryDeliveryStatus;
  requestId?: string;
  request_id?: string;
  payloadHash?: string;
  payload_sha256?: string;
  startedAt?: Date | string | number;
  started_at?: Date | string | number;
  providerEmailId?: string | null;
  provider_email_id?: string | null;
};

export type GalleryDeliveryDecision =
  | { action: 'send' }
  | { action: 'resume'; requestId: string }
  | { action: 'skip'; status: 'sent' | 'failed' | 'unknown'; reason: string }
  | { action: 'unknown'; requestId: string; reason: string };

function field<T>(object: ExistingGalleryDelivery, camel: keyof ExistingGalleryDelivery, snake: keyof ExistingGalleryDelivery): T | undefined {
  return (object[camel] ?? object[snake]) as T | undefined;
}

function dateMs(value: Date | string | number | undefined): number | null {
  if (value === undefined) return null;
  const result = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

/**
 * Decides whether an admin request may create or resume a provider operation.
 * An unresolved send is never replaced: after Resend's idempotency window, or
 * after its payload changes, it becomes unknown and needs a new explicit send.
 */
export function decideGalleryDelivery(
  existing: ExistingGalleryDelivery | null | undefined,
  payloadHash: string,
  now: Date | string | number = Date.now(),
  allowResend = false,
): GalleryDeliveryDecision {
  if (!existing) return { action: 'send' };

  const requestId = field<string>(existing, 'requestId', 'request_id');
  const existingHash = field<string>(existing, 'payloadHash', 'payload_sha256');
  const startedAt = dateMs(field<Date | string | number>(existing, 'startedAt', 'started_at'));
  const age = startedAt === null ? Number.POSITIVE_INFINITY : dateMs(now) === null ? Number.POSITIVE_INFINITY : Math.max(dateMs(now)! - startedAt, 0);

  if (existing.status === 'sending') {
    if (!requestId) return { action: 'unknown', requestId: '', reason: 'Sending delivery has no request identity' };
    if (existingHash === payloadHash && age < RESEND_IDEMPOTENCY_WINDOW_MS) {
      return { action: 'resume', requestId };
    }
    return {
      action: 'unknown',
      requestId,
      reason: existingHash === payloadHash ? 'Sending delivery exceeded the 24-hour idempotency window' : 'Sending delivery payload changed',
    };
  }

  if (allowResend) return { action: 'send' };
  return {
    action: 'skip',
    status: existing.status,
    reason: existing.status === 'sent' ? 'Gallery email was already sent' : existing.status === 'unknown' ? 'Previous gallery email delivery is unresolved' : 'Previous gallery email failed',
  };
}

export type GalleryEmailErrorClass = 'deterministic' | 'ambiguous';

/** Treat only clearly rejected requests as terminal; network/5xx errors stay pending. */
export function classifyGalleryEmailError(error: unknown): GalleryEmailErrorClass {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof value.statusCode === 'number' ? value.statusCode : typeof value.status === 'number' ? value.status : null;
  const code = [value.name, value.code, value.type, value.message]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();

  if (/daily.?quota|quota.?exceed|validation|invalid|unauthori[sz]ed|forbidden|unprocessable|bad.?request/.test(code)) return 'deterministic';
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429) return 'deterministic';
  return 'ambiguous';
}

export { RESEND_IDEMPOTENCY_WINDOW_MS };
