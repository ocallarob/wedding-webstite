import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../../src/lib/db';
import { hasAdminAuth, isSameOriginRequest } from '../../../../../src/lib/adminAuth';
import { verifyCsrfToken } from '../../../../../src/lib/csrf';
import { getGalleryConfig } from '../../../../../src/lib/galleryConfig';
import { classifyGalleryEmailError, decideGalleryDelivery, type ExistingGalleryDelivery } from '../../../../../src/lib/galleryEmailDelivery';
import { buildGalleryEmailHtml, buildGalleryEmailSubject } from '../../../../../src/lib/galleryEmailHtml';
import { runThrottledBatch } from '../../../../../src/lib/throttledBatch';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 100;
const SEND_INTERVAL_MS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FROM = 'Alannah & Rob <hello@alannah-rob.ie>';

type EmailRequest = {
  requestId: string;
  householdIds: string[];
  allowResend: boolean;
};

type EligibleHousehold = {
  id: string;
  display_name: string;
  contact_email: string;
};

type DeliveryRow = {
  request_id: string;
  recipient: string;
  payload_sha256: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  provider_email_id: string | null;
  error: string | null;
  started_at: string;
};

type DeliveryResult = {
  householdId: string;
  status: 'sent' | 'failed' | 'skipped' | 'pending' | 'unknown';
  message?: string;
};

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function parseRequest(value: unknown): EmailRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const householdIds = Array.isArray(body.householdIds) ? body.householdIds : null;
  if (!UUID_PATTERN.test(requestId) || !householdIds || householdIds.length < 1 || householdIds.length > MAX_BATCH_SIZE) return null;
  if (!householdIds.every((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id))) return null;
  if (new Set(householdIds).size !== householdIds.length) return null;
  if (typeof body.allowResend !== 'boolean') return null;
  return { requestId, householdIds, allowResend: body.allowResend };
}

function payloadHash(payload: { from: string; to: string; subject: string; html: string }): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function latestDelivery(householdId: string): Promise<DeliveryRow | null> {
  const rows = await sql`
    SELECT request_id, recipient, payload_sha256, status, provider_email_id, error, started_at
    FROM gallery_email_deliveries
    WHERE household_id = ${householdId}::uuid
    ORDER BY started_at DESC, request_id DESC
    LIMIT 1
  `;
  return (rows[0] as DeliveryRow | undefined) ?? null;
}

async function deliveryForRequest(householdId: string, requestId: string): Promise<DeliveryRow | null> {
  const rows = await sql`
    SELECT request_id, recipient, payload_sha256, status, provider_email_id, error, started_at
    FROM gallery_email_deliveries
    WHERE household_id = ${householdId}::uuid AND request_id = ${requestId}::uuid
    LIMIT 1
  `;
  return (rows[0] as DeliveryRow | undefined) ?? null;
}

async function markUnknown(householdId: string, requestId: string, reason: string): Promise<void> {
  await sql`
    WITH transitioned AS (
      UPDATE gallery_email_deliveries
      SET status = 'unknown', error = ${reason}, completed_at = now()
      WHERE household_id = ${householdId}::uuid
        AND request_id = ${requestId}::uuid
        AND status = 'sending'
      RETURNING household_id, recipient
    )
    UPDATE households h
    SET gallery_email_failed_count = h.gallery_email_failed_count + 1,
        last_gallery_email_failed_at = now(),
        last_gallery_email_error = ${reason},
        last_gallery_email_recipient = transitioned.recipient
    FROM transitioned
    WHERE h.id = transitioned.household_id
  `;
}

async function markSent(householdId: string, requestId: string, providerEmailId: string): Promise<void> {
  await sql`
    WITH transitioned AS (
      UPDATE gallery_email_deliveries
      SET status = 'sent', provider_email_id = ${providerEmailId}, error = NULL, completed_at = now()
      WHERE household_id = ${householdId}::uuid
        AND request_id = ${requestId}::uuid
        AND status = 'sending'
      RETURNING household_id, recipient
    )
    UPDATE households h
    SET gallery_email_sent_at = now(),
        gallery_email_send_count = h.gallery_email_send_count + 1,
        gallery_email_failed_count = 0,
        last_gallery_email_failed_at = NULL,
        last_gallery_email_error = NULL,
        last_gallery_email_recipient = transitioned.recipient
    FROM transitioned
    WHERE h.id = transitioned.household_id
  `;
}

async function markFailed(householdId: string, requestId: string, reason: string): Promise<void> {
  await sql`
    WITH transitioned AS (
      UPDATE gallery_email_deliveries
      SET status = 'failed', error = ${reason}, completed_at = now()
      WHERE household_id = ${householdId}::uuid
        AND request_id = ${requestId}::uuid
        AND status = 'sending'
      RETURNING household_id, recipient
    )
    UPDATE households h
    SET gallery_email_failed_count = h.gallery_email_failed_count + 1,
        last_gallery_email_failed_at = now(),
        last_gallery_email_error = ${reason},
        last_gallery_email_recipient = transitioned.recipient
    FROM transitioned
    WHERE h.id = transitioned.household_id
  `;
}

function storedResult(row: DeliveryRow): DeliveryResult {
  if (row.status === 'sending') return { householdId: '', status: 'pending', message: 'Email delivery is still pending' };
  if (row.status === 'sent') return { householdId: '', status: 'sent' };
  if (row.status === 'failed') return { householdId: '', status: 'failed', message: row.error ?? 'Email delivery failed' };
  return { householdId: '', status: 'unknown', message: row.error ?? 'Email delivery outcome is unknown' };
}

async function processHousehold(
  household: EligibleHousehold,
  request: EmailRequest,
  galleryUrl: string,
  baseUrl: string,
  resend: Resend,
  retriedAfterInsertRace = false,
): Promise<DeliveryResult> {
  const payload = {
    from: FROM,
    to: household.contact_email,
    subject: buildGalleryEmailSubject(),
    html: buildGalleryEmailHtml(household.display_name, galleryUrl, baseUrl),
  };
  const hash = payloadHash(payload);

  const sameRequest = await deliveryForRequest(household.id, request.requestId);
  if (sameRequest && sameRequest.status !== 'sending') {
    return { ...storedResult(sameRequest), householdId: household.id };
  }

  const existing = sameRequest ?? await latestDelivery(household.id);
  const decision = decideGalleryDelivery(
    existing
      ? ({
          status: existing.status,
          requestId: existing.request_id,
          payloadHash: existing.payload_sha256,
          startedAt: existing.started_at,
        } satisfies ExistingGalleryDelivery)
      : null,
    hash,
    Date.now(),
    request.allowResend,
  );

  if (decision.action === 'skip') {
    return {
      householdId: household.id,
      status: decision.status === 'unknown' ? 'unknown' : 'skipped',
      message: decision.reason,
    };
  }

  if (decision.action === 'unknown') {
    if (decision.requestId) await markUnknown(household.id, decision.requestId, decision.reason);
    return { householdId: household.id, status: 'unknown', message: decision.reason };
  }

  let operationRequestId = request.requestId;
  if (decision.action === 'resume') {
    operationRequestId = decision.requestId;
  } else {
    try {
      await sql`
        INSERT INTO gallery_email_deliveries (
          household_id, request_id, recipient, payload_sha256, status, started_at
        ) VALUES (
          ${household.id}::uuid, ${operationRequestId}::uuid, ${household.contact_email}, ${hash}, 'sending', now()
        )
      `;
    } catch (error) {
      if (!retriedAfterInsertRace) {
        return processHousehold(household, request, galleryUrl, baseUrl, resend, true);
      }
      return { householdId: household.id, status: 'pending', message: error instanceof Error ? error.message : 'Concurrent delivery is pending' };
    }
  }

  const idempotencyKey = `gallery/${operationRequestId}/${household.id}`;
  try {
    const result = await resend.emails.send(payload, { idempotencyKey });
    if (result.error || !result.data?.id) {
      const reason = result.error?.message ?? 'Resend did not return a message id';
      if (classifyGalleryEmailError(result.error) === 'deterministic') {
        await markFailed(household.id, operationRequestId, reason);
        return { householdId: household.id, status: 'failed', message: reason };
      }
      return { householdId: household.id, status: 'pending', message: reason };
    }
    await markSent(household.id, operationRequestId, result.data.id);
    return { householdId: household.id, status: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown Resend error';
    if (classifyGalleryEmailError(error) === 'deterministic') {
      await markFailed(household.id, operationRequestId, reason);
      return { householdId: household.id, status: 'failed', message: reason };
    }
    return { householdId: household.id, status: 'pending', message: reason };
  }
}

export async function POST(request: NextRequest) {
  if (!hasAdminAuth(request)) return errorResponse('Unauthorized', 401);
  if (!isSameOriginRequest(request)) return errorResponse('Unauthorized', 401);

  const adminSecret = process.env.ADMIN_SECRET;
  const sessionToken = request.cookies.get('admin_session')?.value;
  if (!adminSecret || !verifyCsrfToken(request.headers.get('x-csrf-token') ?? '', sessionToken, adminSecret)) {
    return errorResponse('Invalid CSRF token', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON', 400);
  }
  const parsed = parseRequest(body);
  if (!parsed) return errorResponse('requestId, householdIds, and allowResend are invalid', 400);

  let config;
  try {
    config = getGalleryConfig();
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Gallery is not configured', 503);
  }
  const apiKey = process.env.RESEND_API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!apiKey || !baseUrl) return errorResponse('RESEND_API_KEY and NEXT_PUBLIC_BASE_URL are required', 503);

  let galleryUrl: string;
  try {
    const url = new URL('/gallery/access', baseUrl);
    url.searchParams.set('token', config.accessToken);
    galleryUrl = url.toString();
  } catch {
    return errorResponse('NEXT_PUBLIC_BASE_URL is invalid', 503);
  }

  const rows = (await sql`
    SELECT
      h.id,
      COALESCE(NULLIF(BTRIM(h.label), ''), member_names.display_name, h.contact_email) AS display_name,
      h.contact_email
    FROM households h
    JOIN household_rsvps hr ON hr.household_id = h.id
    LEFT JOIN LATERAL (
      SELECT string_agg(m.full_name, ' & ' ORDER BY m.sort_order, m.created_at) AS display_name
      FROM household_members m
      WHERE m.household_id = h.id
    ) member_names ON true
    WHERE h.id = ANY(${parsed.householdIds}::uuid[])
      AND h.contact_email IS NOT NULL
      AND BTRIM(h.contact_email) <> ''
      AND EXISTS (
        SELECT 1
        FROM household_members attending
        WHERE attending.household_id = h.id
          AND (attending.attending_day1 = true OR attending.attending_day2 = true)
      )
  `) as EligibleHousehold[];

  const byId = new Map(rows.map((row) => [row.id, row]));
  if (rows.length !== parsed.householdIds.length || parsed.householdIds.some((id) => !byId.has(id))) {
    return errorResponse('Every household must have a submitted RSVP, an attending member, and an email address', 400);
  }

  const resend = new Resend(apiKey);
  const orderedRows = parsed.householdIds.map((id) => byId.get(id) as EligibleHousehold);
  const results: DeliveryResult[] = [];
  await runThrottledBatch({
    items: orderedRows,
    intervalMs: SEND_INTERVAL_MS,
    runItem: async (household) => {
      results.push(await processHousehold(household, parsed, galleryUrl, baseUrl, resend));
    },
  });

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
