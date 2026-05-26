import { site } from '../../src/content/site';
import Image from 'next/image';

const partyPhotos: Record<string, string> = {
  'Caoimhe Leonard': '/photos/1.svg',
  'Caragh Leonard': '/photos/2.svg',
  'Emma Horgan': '/photos/3.svg',
  'Claire McBride': '/photos/4.svg',
  'Dan Hindle': '/photos/5.svg',
  'Dean Madden': '/photos/6.svg',
  'Richie Bennett': '/photos/7.svg',
  'Ruairi Leonard': '/photos/8.svg',
};

type PartyMember = {
  name: string;
  role: string;
  bio: string;
};

const mobilePartyOrder = [
  'Caoimhe Leonard',
  'Dan Hindle',
  'Caragh Leonard',
  'Dean Madden',
  'Emma Horgan',
  'Richie Bennett',
  'Claire McBride',
  'Ruairi Leonard',
];

function MemberCard({ member, reversed }: { member: PartyMember; reversed: boolean }) {
  return (
    <article className="min-h-[210px] rounded-xl border border-stone/70 bg-ivory/80 p-4">
      <div className={`flex items-start gap-4 ${reversed ? 'flex-row-reverse' : ''}`}>
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-stone/70 bg-ivory">
          <Image
            src={partyPhotos[member.name] ?? '/photos/9.svg'}
            alt={`${member.name} profile`}
            width={160}
            height={160}
            className="h-full w-full object-cover"
          />
        </div>
        <div className={`flex-1 ${reversed ? 'text-left' : 'text-right'}`}>
          <h3 className="font-heading text-2xl text-charcoal">{member.name}</h3>
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{member.role}</p>
          <p className="mt-2 text-sm leading-7 text-charcoal">{member.bio}</p>
        </div>
      </div>
    </article>
  );
}

export default function WeddingPartyPage() {
  const allMembers = site.weddingParty.flatMap((group) => group.members) as PartyMember[];
  const mobileMembers = mobilePartyOrder
    .map((name) => allMembers.find((member) => member.name === name))
    .filter((member): member is PartyMember => Boolean(member));

  return (
    <div className="relative overflow-hidden bg-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(219,184,184,0.18),transparent_52%),radial-gradient(circle_at_88%_22%,rgba(143,168,136,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10 px-5 pb-20 pt-[84px]">
        <header className="rounded-3xl border border-stone/80 bg-ivory/80 px-6 py-10 text-center shadow-[0_18px_50px_rgba(58,53,48,0.07)] backdrop-blur-sm sm:px-10">
          <p className="text-xs uppercase tracking-[0.26em] text-mauve">Wedding Party</p>
          <h1 className="mt-2 font-heading text-4xl font-light tracking-[0.05em] text-charcoal sm:text-5xl">The People Beside Us</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
            We are so lucky to be surrounded by family and friends we love.
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-xs uppercase tracking-[0.2em] text-muted">
            Photos coming soon for each of the bridal party.
          </p>
        </header>

        <div className="space-y-4 md:hidden">
          {mobileMembers.map((member, index) => (
            <MemberCard key={`mobile-${member.name}`} member={member} reversed={index % 2 === 0} />
          ))}
        </div>

        <div className="hidden gap-8 md:grid md:grid-cols-2">
          {site.weddingParty.map((group, groupIndex) => (
            <section key={group.heading} className="space-y-5 rounded-2xl border border-stone bg-ivory/85 p-6 shadow-[0_10px_30px_rgba(58,53,48,0.05)]">
              <h2 className="font-heading text-3xl text-mauve">{group.heading}</h2>
              <div className="space-y-4">
                {group.members.map((member, index) => {
                  const reversed = (groupIndex + index) % 2 === 0;
                  return <MemberCard key={`${group.heading}-${index}`} member={member} reversed={reversed} />;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
