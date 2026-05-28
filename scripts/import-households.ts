import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

type InputRow = {
  contact_email: string;
  label: string;
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
  const required = ['contact_email', 'label', 'members'];
  for (const key of required) {
    if (!header.includes(key)) throw new Error(`Missing required column: ${key}`);
  }

  const idx = {
    contact_email: header.indexOf('contact_email'),
    label: header.indexOf('label'),
    members: header.indexOf('members'),
    member_types: header.indexOf('member_types'),
    is_paper_invite: header.indexOf('is_paper_invite'),
  };

  const rows: InputRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const contactEmail = (cols[idx.contact_email] ?? '').trim().toLowerCase();
    const label = (cols[idx.label] ?? '').trim();
    const membersRaw = (cols[idx.members] ?? '').trim();
    const memberTypesRaw = idx.member_types >= 0 ? (cols[idx.member_types] ?? '').trim() : '';
    const isPaperInviteRaw = idx.is_paper_invite >= 0 ? (cols[idx.is_paper_invite] ?? '').trim().toLowerCase() : '';

    if (!contactEmail) throw new Error(`Row ${i + 1}: contact_email is required`);
    if (!membersRaw) throw new Error(`Row ${i + 1}: members is required`);

    const members = membersRaw.split('|').map((s) => s.trim()).filter(Boolean);
    if (members.length === 0) throw new Error(`Row ${i + 1}: at least one member is required`);

    const memberTypes = memberTypesRaw
      ? memberTypesRaw.split('|').map((s) => s.trim().toLowerCase())
      : [];

    rows.push({
      contact_email: contactEmail,
      label,
      members,
      member_types: memberTypes,
      is_paper_invite: isPaperInviteRaw === 'true' || isPaperInviteRaw === '1' || isPaperInviteRaw === 'yes',
    });
  }

  return rows;
}

function asMemberType(raw: string | undefined): 'adult' | 'child' {
  return raw === 'child' ? 'child' : 'adult';
}

async function upsertHousehold(row: InputRow): Promise<void> {
  const inserted = await sql`
    INSERT INTO households (contact_email, label, is_paper_invite)
    VALUES (${row.contact_email}, ${row.label || null}, ${row.is_paper_invite})
    ON CONFLICT (contact_email) DO UPDATE SET
      label = EXCLUDED.label,
      is_paper_invite = EXCLUDED.is_paper_invite
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
  const existing = await sql`
    SELECT id
    FROM households
    WHERE contact_email = ${row.contact_email}
    LIMIT 1
  `;

  if (existing.length > 0) return 'skipped';

  const inserted = await sql`
    INSERT INTO households (contact_email, label, is_paper_invite)
    VALUES (${row.contact_email}, ${row.label || null}, ${row.is_paper_invite})
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
    console.log(`- ${r.contact_email} | ${r.label || '(no label)'} | members: ${r.members.join(', ')}`);
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
