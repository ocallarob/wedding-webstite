const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReminderTestPayload = {
  to: string;
  displayName: string;
  eveningInvite: boolean;
  rsvpToken?: string;
};

export function validateReminderTestPayload(value: unknown):
  | { ok: true; payload: ReminderTestPayload }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const body = value as Record<string, unknown>;
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : 'Test Guest';
  const rsvpToken = typeof body.rsvpToken === 'string' ? body.rsvpToken.trim() : undefined;

  if (!to || to.length > 254 || !EMAIL_PATTERN.test(to)) {
    return { ok: false, error: 'A valid single recipient email is required in "to"' };
  }
  if (!displayName || displayName.length > 120) {
    return { ok: false, error: '"displayName" must be between 1 and 120 characters' };
  }
  if (body.eveningInvite !== undefined && typeof body.eveningInvite !== 'boolean') {
    return { ok: false, error: '"eveningInvite" must be a boolean' };
  }
  if (rsvpToken && rsvpToken.length > 256) {
    return { ok: false, error: '"rsvpToken" must be 256 characters or fewer' };
  }

  return {
    ok: true,
    payload: {
      to,
      displayName,
      eveningInvite: body.eveningInvite === true,
      ...(rsvpToken && { rsvpToken }),
    },
  };
}
