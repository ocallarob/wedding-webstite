import { describe, expect, it } from 'vitest';
import { createAdminSessionToken, verifyAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken, verifyCsrfToken } from '../src/lib/csrf';
import { allowRsvpGet, allowRsvpPost } from '../src/lib/rsvpRateLimit';
import { RSVP_LIMITS, validateRsvpPayload } from '../src/lib/rsvpValidation';
import { validateReminderTestPayload } from '../src/lib/reminderTestPayload';

describe('security and RSVP helpers', () => {
  it('admin session token verifies with correct secret and fails with wrong secret', () => {
    const token = createAdminSessionToken('secret');
    expect(verifyAdminSessionToken(token, 'secret')).toBe(true);
    expect(verifyAdminSessionToken(token, 'wrong')).toBe(false);
  });

  it('csrf token ties to session and secret', () => {
    const sessionToken = createAdminSessionToken('secret');
    const csrf = createCsrfToken(sessionToken, 'secret');
    expect(verifyCsrfToken(csrf, sessionToken, 'secret')).toBe(true);
    expect(verifyCsrfToken(csrf, sessionToken, 'wrong')).toBe(false);
    expect(verifyCsrfToken(csrf, 'different-session', 'secret')).toBe(false);
  });

  it('rsvp payload validation accepts valid payload', () => {
    const result = validateRsvpPayload({
      token: 'abc',
      members: [{ id: 'm1', attending_day1: true, attending_day2: false, dietary: { options: [], other: '' } }],
      song: ' Song ',
      message: ' Message ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalisedSong).toBe('Song');
    expect(result.normalisedMessage).toBe('Message');
  });

  it('rsvp payload validation rejects malformed payloads', () => {
    expect(validateRsvpPayload(null).ok).toBe(false);
    expect(validateRsvpPayload({ token: '', members: [] }).ok).toBe(false);
    expect(
      validateRsvpPayload({
        token: 't',
        members: new Array(RSVP_LIMITS.maxMembersPerSubmission + 1).fill({ id: 'x', attending_day1: true, attending_day2: true }),
      }).ok
    ).toBe(false);
    expect(
      validateRsvpPayload({
        token: 't',
        members: [{ id: 'm1', attending_day1: true, attending_day2: true }],
        song: 'a'.repeat(RSVP_LIMITS.maxSongLength + 1),
      }).ok
    ).toBe(false);
  });

  it('rsvp get/post rate-limit helpers deny when any limit check fails', async () => {
    const denySecond = async (key: string) => !key.includes(':token:');
    expect(await allowRsvpGet('1.2.3.4', 'tok', denySecond as any)).toBe(false);
    expect(await allowRsvpPost('1.2.3.4', 'tok', denySecond as any)).toBe(false);

    const allowAll = async () => true;
    expect(await allowRsvpGet('1.2.3.4', 'tok', allowAll as any)).toBe(true);
    expect(await allowRsvpPost('1.2.3.4', 'tok', allowAll as any)).toBe(true);
  });

  it('reminder test payload accepts exactly one valid recipient', () => {
    const result = validateReminderTestPayload({
      to: 'test@example.com',
      displayName: 'Anne & Brian',
      eveningInvite: true,
      rsvpToken: 'test-token',
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        to: 'test@example.com',
        displayName: 'Anne & Brian',
        eveningInvite: true,
        rsvpToken: 'test-token',
      },
    });
    expect(validateReminderTestPayload({ to: ['one@example.com', 'two@example.com'] }).ok).toBe(false);
    expect(validateReminderTestPayload({ to: 'not-an-email' }).ok).toBe(false);
  });
});
