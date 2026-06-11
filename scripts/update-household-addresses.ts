import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

type InputRow = {
  contact_email: string;
  address_line_one: string;
  label: string;
  members: string[];
  is_paper_invite: boolean;
};

type Match =
  | { status: 'matched'; id: string; current_address_line_one: string | null; current_is_paper_invite: boolean }
  | { status: 'not_found' }
  | { status: 'ambiguous'; count: number };

const sql = neon(process.env.DATABASE_URL!);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  out.push(current.trim());
  return out;
}

function parseRows(csv: string): InputRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    throw new Error('CSV must include header and at least one row');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const required = ['contact_email', 'address_line_one', 'label', 'members', 'is_paper_invite'];
  for (const key of required) {
    if (!header.includes(key)) throw new Error(`Missing required column: ${key}`);
  }

  const idx = {
    contact_email: header.indexOf('contact_email'),
    address_line_one: header.indexOf('address_line_one'),
    label: header.indexOf('label'),
    members: header.indexOf('members'),
    is_paper_invite: header.indexOf('is_paper_invite'),
  };

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const membersRaw = (cols[idx.members] ?? '').trim();
    const isPaperInviteRaw = (cols[idx.is_paper_invite] ?? '').trim().toLowerCase();

    return {
      contact_email: (cols[idx.contact_email] ?? '').trim().toLowerCase(),
      address_line_one: (cols[idx.address_line_one] ?? '').trim(),
      label: (cols[idx.label] ?? '').trim(),
      members: membersRaw.split('|').map((s) => s.trim()).filter(Boolean),
      is_paper_invite: isPaperInviteRaw === 'true' || isPaperInviteRaw === '1' || isPaperInviteRaw === 'yes',
    };
  });
}

function rowLabel(row: InputRow): string {
  return row.contact_email || row.label || row.members.join(' & ') || '(unlabelled row)';
}

async function assertAddressLineOneColumnExists(): Promise<void> {
  const rows = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'households'
      AND column_name = 'address_line_one'
    LIMIT 1
  `;

  if (!rows[0]) {
    throw new Error('households.address_line_one does not exist. Run pnpm db:migrate before updating addresses.');
  }
}

async function findHousehold(row: InputRow): Promise<Match> {
  if (row.contact_email) {
    const rows = await sql`
      SELECT id, address_line_one, is_paper_invite
      FROM households
      WHERE contact_email = ${row.contact_email}
      LIMIT 1
    `;

    if (!rows[0]) return { status: 'not_found' };
    return {
      status: 'matched',
      id: String(rows[0].id),
      current_address_line_one: typeof rows[0].address_line_one === 'string' ? rows[0].address_line_one : null,
      current_is_paper_invite: Boolean(rows[0].is_paper_invite),
    };
  }

  const memberKey = row.members.join('|');
  const rowsByIdentity = await sql`
    SELECT h.id, h.address_line_one, h.is_paper_invite
    FROM households h
    WHERE h.is_paper_invite = ${row.is_paper_invite}
      AND lower(COALESCE(h.label, '')) = lower(${row.label})
      AND COALESCE((
        SELECT string_agg(m.full_name, '|' ORDER BY m.sort_order, m.created_at)
        FROM household_members m
        WHERE m.household_id = h.id
      ), '') = ${memberKey}
    LIMIT 2
  `;

  const rows = rowsByIdentity.length > 0 ? rowsByIdentity : await sql`
    SELECT id, address_line_one, is_paper_invite
    FROM households
    WHERE is_paper_invite = ${row.is_paper_invite}
      AND lower(address_line_one) = lower(${row.address_line_one})
    LIMIT 2
  `;

  if (rows.length === 0) return { status: 'not_found' };
  if (rows.length > 1) return { status: 'ambiguous', count: rows.length };
  return {
    status: 'matched',
    id: String(rows[0].id),
    current_address_line_one: typeof rows[0].address_line_one === 'string' ? rows[0].address_line_one : null,
    current_is_paper_invite: Boolean(rows[0].is_paper_invite),
  };
}

async function main() {
  const fileArg = process.argv[2];
  const flags = new Set(process.argv.slice(3));
  if (!fileArg) {
    throw new Error(
      'Usage: pnpm tsx --env-file=.env.local scripts/update-household-addresses.ts <csv_path> [--apply]',
    );
  }

  const apply = flags.has('--apply');
  const csvPath = resolve(process.cwd(), fileArg);
  const rows = parseRows(readFileSync(csvPath, 'utf8'));
  const rowsWithAddress = rows.filter((row) => row.address_line_one);

  await assertAddressLineOneColumnExists();

  let updated = 0;
  let unchanged = 0;
  let skippedNoAddress = rows.length - rowsWithAddress.length;
  let skippedNotFound = 0;
  let skippedAmbiguous = 0;

  console.log(`Parsed ${rows.length} households from ${csvPath}`);
  console.log(`Found ${rowsWithAddress.length} rows with address_line_one`);

  for (const row of rowsWithAddress) {
    const match = await findHousehold(row);

    if (match.status === 'not_found') {
      skippedNotFound += 1;
      console.log(`- skip not found: ${rowLabel(row)} | ${row.address_line_one}`);
      continue;
    }

    if (match.status === 'ambiguous') {
      skippedAmbiguous += 1;
      console.log(`- skip ambiguous (${match.count} matches): ${rowLabel(row)} | ${row.address_line_one}`);
      continue;
    }

    if (match.current_address_line_one === row.address_line_one && match.current_is_paper_invite) {
      unchanged += 1;
      console.log(`- unchanged: ${rowLabel(row)} | ${row.address_line_one} | paper invite already true`);
      continue;
    }

    updated += 1;
    console.log(
      `- ${apply ? 'update' : 'would update'}: ${rowLabel(row)} | ` +
        `${match.current_address_line_one ?? '(blank)'} -> ${row.address_line_one} | ` +
        `paper ${match.current_is_paper_invite ? 'true' : 'false'} -> true`,
    );

    if (apply) {
      await sql`
        UPDATE households
        SET address_line_one = ${row.address_line_one},
          is_paper_invite = true
        WHERE id = ${match.id}
      `;
    }
  }

  console.log(
    `\n${apply ? 'Updated' : 'Would update'} ${updated} households. ` +
      `Unchanged ${unchanged}. Skipped ${skippedNoAddress} without address, ${skippedNotFound} not found, ${skippedAmbiguous} ambiguous.`,
  );

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write address_line_one values and set paper invite true.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
