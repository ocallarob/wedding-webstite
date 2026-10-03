# Wedding Photo Sharing Context

This context describes the post-wedding event gallery and the photographs or videos guests send directly to the couple via WhatsApp.

## Gallery language

**Event gallery**:
The single collection of wedding media shared after the wedding. It is intentionally one collection rather than a set of albums.
_Avoid_: Album, gallery section

**Gallery link**:
A semi-private link granting access to the event gallery by possession; the gallery is not publicly listed or identity-restricted.
_Avoid_: Private gallery, public gallery

**Household Gallery link**:
A Gallery link associated with one household. Use of the link is attributed to that household, not to a specific person; forwarding does not change that attribution.
_Avoid_: Household token, RSVP invitation link

**Gallery viewer**:
A person viewing the event gallery through a currently valid Gallery link. A household association does not identify which household member—or other link holder—is viewing.
_Avoid_: Validated user, account

**Gallery open**:
A successful opening of the event gallery through a valid Gallery link, counted once within a browser-tab session. A new tab session may count separately; the count does not identify a person.
_Avoid_: Unique viewer

**Download request**:
A request for a downloadable copy of one published asset. It records an intent to download, not confirmation that the transfer completed.
_Avoid_: Completed download

**Single-asset download**:
A viewer requests one published asset at a time, typically its original file. The event gallery does not provide multi-select or bulk-download actions.
_Avoid_: Bulk download, download all

**Asset**:
One photograph or video belonging to the event gallery.
_Avoid_: File

**Photo source**:
The distinction between professional photographs and guest photographs taken with table cameras. Source filters show subsets of the same event gallery rather than separate collections.
_Avoid_: Album, gallery section

**Pending asset**:
An event-gallery asset awaiting review and not yet visible in the event gallery.
_Avoid_: Hidden photo

**Published asset**:
An approved asset that is visible to gallery viewers.
_Avoid_: Approved upload


**Gallery announcement**:
The post-wedding message that tells eligible households the event gallery is available and explains how to send photographs or videos to the couple via WhatsApp. It is distinct from an invitation or RSVP reminder.
_Avoid_: Invite, reminder

**Household**:
The invite group represented by a contact and one or more invited members. Gallery messaging is addressed to households rather than individual accounts.
_Avoid_: User, account, guest account

**Gallery-eligible household**:
A household with a contact email and at least one member recorded as attending at least one wedding day. Missing or negative attendance does not qualify the household for the gallery announcement.
_Avoid_: RSVP recipient, invite recipient
