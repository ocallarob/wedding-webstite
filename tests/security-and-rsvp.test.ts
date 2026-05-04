import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSessionToken, verifyAdminSessionToken } from '../src/lib/adminSession';
import { createCsrfToken, verifyCsrfToken } from '../src/lib/csrf';
import { allowRsvpGet, allowRsvpPost } from '../src/lib/rsvpRateLimit';
import { RSVP_LIMITS, validateRsvpPayload } from '../src/lib/rsvpValidation';

test('admin session token verifies with correct secret and fails with wrong secret', () => {
  const token = createAdminSessionToken('secret');
  assert.equal(verifyAdminSessionToken(token, 'secret'), true);
  assert.equal(verifyAdminSessionToken(token, 'wrong'), false);
});

test('csrf token ties to session and secret', () => {
  const sessionToken = createAdminSessionToken('secret');
  const csrf = createCsrfToken(sessionToken, 'secret');
  assert.equal(verifyCsrfToken(csrf, sessionToken, 'secret'), true);
  assert.equal(verifyCsrfToken(csrf, sessionToken, 'wrong'), false);
  assert.equal(verifyCsrfToken(csrf, 'different-session', 'secret'), false);
});

test('rsvp payload validation accepts valid payload', () => {
  const result = validateRsvpPayload({
    token: 'abc',
    members: [{ id: 'm1', attending_day1: true, attending_day2: false, dietary: { options: [], other: '' } }],
    song: ' Song ',
    message: ' Message ',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.normalisedSong, 'Song');
  assert.equal(result.normalisedMessage, 'Message');
});

test('rsvp payload validation rejects malformed payloads', () => {
  assert.equal(validateRsvpPayload(null).ok, false);
  assert.equal(validateRsvpPayload({ token: '', members: [] }).ok, false);
  assert.equal(
    validateRsvpPayload({
      token: 't',
      members: new Array(RSVP_LIMITS.maxMembersPerSubmission + 1).fill({ id: 'x', attending_day1: true, attending_day2: true }),
    }).ok,
    false
  );
  assert.equal(
    validateRsvpPayload({
      token: 't',
      members: [{ id: 'm1', attending_day1: true, attending_day2: true }],
      song: 'a'.repeat(RSVP_LIMITS.maxSongLength + 1),
    }).ok,
    false
  );
});

test('rsvp get/post rate-limit helpers deny when any limit check fails', async () => {
  const denySecond = async (key: string) => !key.includes(':token:');
  assert.equal(await allowRsvpGet('1.2.3.4', 'tok', denySecond as any), false);
  assert.equal(await allowRsvpPost('1.2.3.4', 'tok', denySecond as any), false);

  const allowAll = async () => true;
  assert.equal(await allowRsvpGet('1.2.3.4', 'tok', allowAll as any), true);
  assert.equal(await allowRsvpPost('1.2.3.4', 'tok', allowAll as any), true);
});
