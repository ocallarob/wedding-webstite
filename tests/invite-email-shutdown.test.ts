import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.sendEmail };
  },
}));

import { POST as postInvites } from '../app/api/invites/send/route';
import { POST as postDashboard } from '../app/api/dashboard/route';
import { POST as postReminderTest } from '../app/api/reminders/test/route';

function dashboardRequest(action: string): NextRequest {
  const formData = new FormData();
  formData.set('action', action);
  return new NextRequest('http://localhost/api/dashboard', {
    method: 'POST',
    body: formData,
  });
}

describe('invite email shutdown', () => {
  it('rejects the initial invite endpoint without touching email or household state', async () => {
    const response = await postInvites(new NextRequest('http://localhost/api/invites/send', { method: 'POST' }));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'Invite email sending is disabled' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('rejects reminder test sends without touching email or household state', async () => {
    const response = await postReminderTest(new NextRequest('http://localhost/api/reminders/test', { method: 'POST' }));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'Reminder email sending is disabled' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it.each(['send_reminders', 'resend_invite'])('redirects disabled dashboard action %s', async (action) => {
    const response = await postDashboard(dashboardRequest(action));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/dashboard?error=invite_sending_disabled');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
