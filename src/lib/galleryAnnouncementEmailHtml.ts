function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function buildGalleryAnnouncementSubject(): string {
  return 'The Alannah & Rob event gallery is ready';
}

export function buildGalleryAnnouncementEmailHtml(displayName: string, galleryUrl: string, uploadUrl: string): string {
  const safeName = escapeHtml(displayName);
  const safeGalleryUrl = escapeHtml(galleryUrl);
  const safeUploadUrl = escapeHtml(uploadUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Event gallery announcement</title>
</head>
<body style="margin:0;padding:24px 12px;background:#fdfbf7;font-family:Arial,sans-serif;color:#3a3530">
  <div style="max-width:620px;margin:0 auto;border:1px solid #e8e2da;background:#fdfbf7;border-radius:18px;overflow:hidden">
    <div style="padding:38px 28px;text-align:center">
      <p style="margin:0;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#9c7a8c">Alannah &amp; Rob</p>
      <h1 style="margin:16px 0 0;font-family:Georgia,serif;font-size:40px;font-weight:400;color:#3a3530">The gallery is ready</h1>
      <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.6;color:#7a756f">
        Hi ${safeName}, our event gallery is now ready. We would love you to revisit the wedding weekend and share any photographs or videos you captured.
      </p>
      <p style="margin:24px 0 0">
        <a href="${safeGalleryUrl}" style="display:inline-block;background:#dbb8b8;border:1px solid #dbb8b8;color:#3a3530;text-decoration:none;padding:12px 30px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase">Open event gallery</a>
      </p>
      <p style="margin:12px 0 0">
        <a href="${safeUploadUrl}" style="display:inline-block;border:1px solid #9c7a8c;color:#9c7a8c;text-decoration:none;padding:11px 28px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase">Share your memories</a>
      </p>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#7a756f">
        Contributions are reviewed before they appear in the event gallery.<br><br>
        Gallery link:<br><a href="${safeGalleryUrl}" style="color:#9c7a8c">${safeGalleryUrl}</a><br><br>
        Upload portal link:<br><a href="${safeUploadUrl}" style="color:#9c7a8c">${safeUploadUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
