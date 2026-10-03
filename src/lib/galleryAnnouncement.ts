export type GalleryAnnouncementMember = {
  full_name?: unknown;
  attending_day1?: unknown;
  attending_day2?: unknown;
};

export type GalleryAnnouncementHousehold = {
  label?: unknown;
  contact_email?: unknown;
  members?: unknown;
  gallery_announcement_sent_at?: unknown;
};

export function isGalleryAnnouncementEligible(household: GalleryAnnouncementHousehold): boolean {
  if (typeof household.contact_email !== 'string' || household.contact_email.trim() === '') return false;
  if (!Array.isArray(household.members)) return false;

  return household.members.some((member): member is GalleryAnnouncementMember => {
    if (!member || typeof member !== 'object') return false;
    const candidate = member as GalleryAnnouncementMember;
    return candidate.attending_day1 === true || candidate.attending_day2 === true;
  });
}

export function galleryAnnouncementDisplayName(household: GalleryAnnouncementHousehold): string {
  if (typeof household.label === 'string' && household.label.trim()) return household.label.trim();

  const memberNames = Array.isArray(household.members)
    ? household.members
      .map((member) => {
        if (!member || typeof member !== 'object') return '';
        const name = (member as GalleryAnnouncementMember).full_name;
        return typeof name === 'string' ? name.trim() : '';
      })
      .filter(Boolean)
    : [];
  if (memberNames.length > 0) return memberNames.join(' & ');

  return typeof household.contact_email === 'string' ? household.contact_email.trim() : 'Wedding guest';
}
