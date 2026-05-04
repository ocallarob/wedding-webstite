export type RsvpMemberInput = {
  id: string;
  attending_day1: boolean;
  attending_day2: boolean;
  dietary?: unknown;
};

export const RSVP_LIMITS = {
  maxSongLength: 160,
  maxMessageLength: 2000,
  maxMembersPerSubmission: 16,
} as const;

export function validateRsvpPayload(body: unknown): {
  ok: true;
  token: string;
  members: RsvpMemberInput[];
  normalisedSong: string;
  normalisedMessage: string;
} | {
  ok: false;
  error: string;
} {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid payload' };

  const { token, members, song, message } = body as {
    token?: unknown;
    members?: unknown;
    song?: unknown;
    message?: unknown;
  };

  if (typeof token !== 'string' || token.length === 0) return { ok: false, error: 'token required' };
  if (!Array.isArray(members) || members.length === 0 || members.length > RSVP_LIMITS.maxMembersPerSubmission) {
    return { ok: false, error: 'members required' };
  }

  const normalisedSong = typeof song === 'string' ? song.trim() : '';
  const normalisedMessage = typeof message === 'string' ? message.trim() : '';
  if (normalisedSong.length > RSVP_LIMITS.maxSongLength) return { ok: false, error: 'song too long' };
  if (normalisedMessage.length > RSVP_LIMITS.maxMessageLength) return { ok: false, error: 'message too long' };

  const typedMembers: RsvpMemberInput[] = [];
  for (const member of members) {
    if (!member || typeof member !== 'object') return { ok: false, error: 'invalid member payload' };
    const m = member as Record<string, unknown>;
    if (typeof m.id !== 'string') return { ok: false, error: 'invalid member id' };
    if (typeof m.attending_day1 !== 'boolean' || typeof m.attending_day2 !== 'boolean') {
      return { ok: false, error: 'invalid attendance values' };
    }
    typedMembers.push({
      id: m.id,
      attending_day1: m.attending_day1,
      attending_day2: m.attending_day2,
      dietary: m.dietary,
    });
  }

  return { ok: true, token, members: typedMembers, normalisedSong, normalisedMessage };
}
