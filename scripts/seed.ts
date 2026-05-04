import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const guests = [
  { name: 'Rob O\'Callaghan', email: 'roboc.dev@proton.me' },
  { name: 'Test Guest Two', email: 'test2@example.com' },
  { name: 'Test Guest Three', email: 'test3@example.com' },
];

async function seed() {
  for (const guest of guests) {
    const rows = await sql`
      INSERT INTO guests (name, email)
      VALUES (${guest.name}, ${guest.email})
      ON CONFLICT (email) DO NOTHING
      RETURNING token
    `;
    if (rows[0]) {
      console.log(`Added ${guest.name} — token: ${rows[0].token}`);
    } else {
      console.log(`Skipped ${guest.name} (already exists)`);
    }
  }
}

seed().catch((err) => { console.error(err); process.exit(1); });
