import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardTable } from '../app/dashboard/DashboardTable';

describe('dashboard Gallery activity', () => {
  it('renders household activity without exposing the RSVP token in the Gallery-link cell', () => {
    const rsvpToken = 'rsvp-token-must-stay-out-of-gallery-link-cell';
    const markup = renderToStaticMarkup(createElement(DashboardTable, {
      csrfToken: 'dashboard-csrf',
      rows: [{
        id: '123e4567-e89b-42d3-a456-426614174001',
        label: 'Hart household',
        contact_email: 'hart@example.test',
        address_line_one: null,
        evening_invite: false,
        invite_token: rsvpToken,
        is_paper_invite: false,
        invited_at: '2026-09-01T12:00:00.000Z',
        invite_failed_count: 0,
        last_invite_error: null,
        reminder_count: 0,
        reminder_failed_count: 0,
        gallery_announcement_sent_at: null,
        gallery_announcement_sending_at: null,
        gallery_announcement_failed_count: 0,
        gallery_announcement_last_error: null,
        open_count: 0,
        first_opened_at: null,
        last_opened_at: null,
        gallery_open_count: 2,
        gallery_first_opened_at: '2026-09-10T12:00:00.000Z',
        gallery_last_opened_at: '2026-09-12T14:30:00.000Z',
        download_request_count: 3,
        asset_downloads: [{
          asset_id: '123e4567-e89b-42d3-a456-426614174002',
          display_name: 'ceremony.jpg',
          media_type: 'photo',
          request_count: 3,
          last_requested_at: '2026-09-12T14:35:00.000Z',
        }],
        song: null,
        message: null,
        submitted_at: '2026-09-01T12:00:00.000Z',
        members: [{
          full_name: 'Alex Hart',
          member_type: 'adult',
          attending_day1: true,
          attending_day2: false,
          dietary: null,
        }],
      }],
    }));

    expect(markup).toContain('2 tab-session opens');
    expect(markup).toContain('3 download requests');
    expect(markup).toContain('ceremony.jpg (photo)');

    const headers = [...markup.matchAll(/<th\b[^>]*>(.*?)<\/th>/gs)]
      .map(([, content]) => content.replace(/<[^>]*>/g, '').trim());
    const galleryColumn = headers.indexOf('Gallery link');
    const bodyRow = markup.match(/<tbody\b[^>]*>(.*?)<\/tbody>/s)?.[1];
    const cells = bodyRow ? [...bodyRow.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)] : [];
    const galleryCell = galleryColumn < 0 ? undefined : cells[galleryColumn]?.[1];

    expect(galleryCell).toBeDefined();
    expect(galleryCell).not.toContain(rsvpToken);
  });
});
