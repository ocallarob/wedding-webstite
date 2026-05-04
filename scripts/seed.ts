import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const households = [
  {
    contact_email: 'test.anne@example.com',
    label: 'Anne Family',
    members: [
      { full_name: 'Anne Test', member_type: 'adult' },
      { full_name: 'Mark Test', member_type: 'adult' },
      { full_name: 'Ellie Test', member_type: 'child' },
    ],
  },
  {
    contact_email: 'test.brian@example.com',
    label: 'Brian',
    members: [{ full_name: 'Brian Test', member_type: 'adult' }],
  },
];

async function seed() {
  for (const household of households) {
    const inserted = await sql`
      INSERT INTO households (contact_email, label)
      VALUES (${household.contact_email}, ${household.label})
      ON CONFLICT (contact_email) DO UPDATE SET label = EXCLUDED.label
      RETURNING id
    `;

    const householdId = inserted[0].id as string;

    await sql`DELETE FROM household_members WHERE household_id = ${householdId}`;

    for (let i = 0; i < household.members.length; i += 1) {
      const member = household.members[i];
      await sql`
        INSERT INTO household_members (household_id, full_name, member_type, dietary, sort_order)
        VALUES (
          ${householdId},
          ${member.full_name},
          ${member.member_type},
          ${JSON.stringify({ options: [], other: '' })}::jsonb,
          ${i}
        )
      `;
    }
  }

  console.log('Seed complete');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
