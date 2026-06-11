import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

type InputRow = {
  contact_email: string;
  address_line_one: string;
  label: string;
  evening_invite: boolean;
  members: string[];
  member_types: string[];
  is_paper_invite: boolean;
};

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
  const required = ['label', 'members'];
  for (const key of required) {
    if (!header.includes(key)) throw new Error(`Missing required column: ${key}`);
  }

  const idx = {
    contact_email: header.indexOf('contact_email'),
    address_line_one: header.indexOf('address_line_one'),
    label: header.indexOf('label'),
    evening_invite: header.indexOf('evening_invite'),
    members: header.indexOf('members'),
    member_types: header.indexOf('member_types'),
    is_paper_invite: header.indexOf('is_paper_invite'),
  };

  const rows: InputRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const contactEmail = idx.contact_email >= 0 ? (cols[idx.contact_email] ?? '').trim().toLowerCase() : '';
    const addressLineOne = idx.address_line_one >= 0 ? (cols[idx.address_line_one] ?? '').trim() : '';
    const label = (cols[idx.label] ?? '').trim();
    const eveningInviteRaw = idx.evening_invite >= 0 ? (cols[idx.evening_invite] ?? '').trim().toLowerCase() : '';
    const membersRaw = (cols[idx.members] ?? '').trim();
    const memberTypesRaw = idx.member_types >= 0 ? (cols[idx.member_types] ?? '').trim() : '';
    const isPaperInviteRaw = idx.is_paper_invite >= 0 ? (cols[idx.is_paper_invite] ?? '').trim().toLowerCase() : '';

    const isPaperInvite = isPaperInviteRaw === 'true' || isPaperInviteRaw === '1' || isPaperInviteRaw === 'yes';
    if (!isPaperInvite && !contactEmail) throw new Error(`Row ${i + 1}: contact_email is required for email invites`);
    if (eveningInviteRaw && !['true', '1', 'yes', 'false', '0', 'no'].includes(eveningInviteRaw)) {
      throw new Error(`Row ${i + 1}: evening_invite must be true/false`);
    }
    if (isPaperInvite && !contactEmail && !addressLineOne) {
      throw new Error(`Row ${i + 1}: address_line_one is required when contact_email is blank`);
    }
    if (!membersRaw) throw new Error(`Row ${i + 1}: members is required`);

    const members = membersRaw.split('|').map((s) => s.trim()).filter(Boolean);
    if (members.length === 0) throw new Error(`Row ${i + 1}: at least one member is required`);

    const memberTypes = memberTypesRaw
      ? memberTypesRaw.split('|').map((s) => s.trim().toLowerCase())
      : [];

    rows.push({
      contact_email: contactEmail,
      address_line_one: addressLineOne,
      label,
      evening_invite: eveningInviteRaw === 'true' || eveningInviteRaw === '1' || eveningInviteRaw === 'yes',
      members,
      member_types: memberTypes,
      is_paper_invite: isPaperInvite,
    });
  }

  return rows;
}

function asMemberType(raw: string | undefined): 'adult' | 'child' {
  return raw === 'child' ? 'child' : 'adult';
}

async function upsertHousehold(row: InputRow): Promise<void> {
  const existing = await findExistingHousehold(row);
  const inserted = existing.length > 0
    ? await sql`
        UPDATE households
        SET contact_email = ${row.contact_email || null},
          address_line_one = ${row.address_line_one || null},
          label = ${row.label || null},
          evening_invite = ${row.evening_invite},
          is_paper_invite = ${row.is_paper_invite}
        WHERE id = ${existing[0].id}
        RETURNING id
      `
    : await sql`
        INSERT INTO households (contact_email, address_line_one, label, evening_invite, is_paper_invite)
        VALUES (${row.contact_email || null}, ${row.address_line_one || null}, ${row.label || null}, ${row.evening_invite}, ${row.is_paper_invite})
        RETURNING id
      `;

  const householdId = inserted[0].id as string;
  await sql`DELETE FROM household_members WHERE household_id = ${householdId}`;

  for (let i = 0; i < row.members.length; i += 1) {
    const name = row.members[i];
    const type = asMemberType(row.member_types[i]);
    await sql`
      INSERT INTO household_members (household_id, full_name, member_type, dietary, sort_order)
      VALUES (${householdId}, ${name}, ${type}, ${JSON.stringify({ options: [], other: '' })}::jsonb, ${i})
    `;
  }
}

async function insertOnlyHousehold(row: InputRow): Promise<'inserted' | 'skipped'> {
  const existing = await findExistingHousehold(row);

  if (existing.length > 0) return 'skipped';

  const inserted = await sql`
    INSERT INTO households (contact_email, address_line_one, label, evening_invite, is_paper_invite)
    VALUES (${row.contact_email || null}, ${row.address_line_one || null}, ${row.label || null}, ${row.evening_invite}, ${row.is_paper_invite})
    RETURNING id
  `;

  const householdId = inserted[0].id as string;

  for (let i = 0; i < row.members.length; i += 1) {
    const name = row.members[i];
    const type = asMemberType(row.member_types[i]);
    await sql`
      INSERT INTO household_members (household_id, full_name, member_type, dietary, sort_order)
      VALUES (${householdId}, ${name}, ${type}, ${JSON.stringify({ options: [], other: '' })}::jsonb, ${i})
    `;
  }

  return 'inserted';
}

async function findExistingHousehold(row: InputRow) {
  if (row.contact_email) {
    return sql`
      SELECT id
      FROM households
      WHERE contact_email = ${row.contact_email}
      LIMIT 1
    `;
  }

  return sql`
    SELECT id
    FROM households
    WHERE is_paper_invite = true
      AND lower(address_line_one) = lower(${row.address_line_one})
    LIMIT 1
  `;
}

async function main() {
  const fileArg = process.argv[2];
  const flags = new Set(process.argv.slice(3));
  if (!fileArg) {
    throw new Error(
      'Usage: pnpm tsx --env-file=.env.local scripts/import-households.ts <csv_path> [--apply] [--insert-only]',
    );
  }
  const apply = flags.has('--apply');
  const insertOnly = flags.has('--insert-only');
  const csvPath = resolve(process.cwd(), fileArg);
  const csv = readFileSync(csvPath, 'utf8');
  const rows = parseRows(csv);

  console.log(`Parsed ${rows.length} households from ${csvPath}`);
  for (const r of rows) {
    console.log(`- ${r.contact_email || r.address_line_one} | ${r.label || '(no label)'} | evening: ${r.evening_invite ? 'yes' : 'no'} | members: ${r.members.join(', ')}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write to database.');
    return;
  }

  if (insertOnly) {
    let insertedCount = 0;
    let skippedCount = 0;
    for (const row of rows) {
      const result = await insertOnlyHousehold(row);
      if (result === 'inserted') insertedCount += 1;
      if (result === 'skipped') skippedCount += 1;
    }
    console.log(`\nInserted ${insertedCount} new households. Skipped ${skippedCount} existing households.`);
    return;
  }

  for (const row of rows) {
    await upsertHousehold(row);
  }
  console.log(`\nImported ${rows.length} households (upsert mode).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
