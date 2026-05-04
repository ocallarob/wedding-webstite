import { neon } from '@neondatabase/serverless';

// Lazy wrapper — neon client is created per-call so module import never throws at build time.
// @neondatabase/serverless uses HTTP for each query, so no persistent connection overhead.
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url)(strings, ...values);
}

export type Guest = {
  id: string;
  name: string;
  email: string;
  token: string;
  invited_at: string | null;
};

export type Rsvp = {
  token: string;
  attending_day1: boolean;
  attending_day2: boolean;
  dietary: string | null;
  song: string | null;
  message: string | null;
  submitted_at: string;
};

export type GuestWithRsvp = Guest & { rsvp: Rsvp | null };
