type PartyMember = {
  name: string;
  role: string;
  bio: string;
};

const weddingParty: { heading: string; members: PartyMember[] }[] = [
  {
    heading: 'Bridesmaids',
    members: [
      {
        name: 'Coming Soon',
        role: 'Bridesmaid',
        bio: 'Details to follow.',
      },
      {
        name: 'Coming Soon',
        role: 'Bridesmaid',
        bio: 'Details to follow.',
      },
    ],
  },
  {
    heading: 'Groomsmen',
    members: [
      {
        name: 'Coming Soon',
        role: 'Groomsman',
        bio: 'Details to follow.',
      },
      {
        name: 'Coming Soon',
        role: 'Groomsman',
        bio: 'Details to follow.',
      },
    ],
  },
];

export default function WeddingPartyPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-5 pb-20 pt-[84px]">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Wedding Party</p>
        <h1 className="font-heading text-4xl font-semibold text-charcoal">The People Beside Us</h1>
        <p className="mx-auto max-w-2xl text-sm leading-7 text-muted">
          We are so lucky to be surrounded by family and friends we love.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        {weddingParty.map((group) => (
          <section key={group.heading} className="space-y-5 rounded-2xl border border-stone bg-ivory/80 p-6">
            <h2 className="font-heading text-3xl text-mauve">{group.heading}</h2>
            <div className="space-y-4">
              {group.members.map((member, index) => (
                <article key={`${group.heading}-${index}`} className="rounded-xl border border-stone/70 bg-ivory/70 p-4">
                  <h3 className="font-heading text-2xl text-charcoal">{member.name}</h3>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted">{member.role}</p>
                  <p className="mt-2 text-sm leading-7 text-charcoal">{member.bio}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
