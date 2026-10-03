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
  return "Can you believe it's already been a month?";
}

export function buildGalleryAnnouncementEmailHtml(displayName: string, galleryUrl: string, baseUrl: string): string {
  const assetBase = baseUrl.replace(/\/$/, '');
  const safeName = escapeHtml(displayName);
  const safeGalleryUrl = escapeHtml(galleryUrl);
  const safeHeroImageUrl = escapeHtml(`${assetBase}/assets/wedding-professional-hero.jpg`);
  const safeImageUrl = escapeHtml(`${assetBase}/assets/wedding-table-camera.jpg`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Our wedding gallery</title>
</head>
<body style="margin:0;padding:24px 12px;background:#fdfbf7;font-family:Arial,sans-serif;color:#3a3530">
  <div style="max-width:620px;margin:0 auto;border:1px solid #e8e2da;background:#fdfbf7;border-radius:18px;overflow:hidden">
    <img src="${safeHeroImageUrl}" alt="Alannah and Rob embracing by the lake at sunset" width="620" style="display:block;width:100%;height:auto;border:0;border-radius:18px 18px 0 0">
    <div style="padding:38px 28px;text-align:center">
      <p style="margin:0;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#9c7a8c">Alannah &amp; Rob</p>
      <h1 style="margin:16px 0 0;font-family:Georgia,serif;font-size:40px;font-weight:400;color:#3a3530">One month already</h1>
      <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.6;color:#7a756f">
        Hi ${safeName}, we can't believe it's already been a month since our wedding!
      </p>
      <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.6;color:#7a756f">
        Thank you so much for celebrating with us and for making the day so special. A special thank you to the amateur photographers among you. Your photos have given us so many lovely moments to relive.
      </p>
      <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.6;color:#7a756f">
        We've now received our professional photos, and the gallery brings them together with the photos taken by our guests.
      </p>
      <p style="margin:24px 0 0">
        <a href="${safeGalleryUrl}" style="display:inline-block;background:#dbb8b8;border:1px solid #dbb8b8;color:#3a3530;text-decoration:none;padding:12px 30px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase">View the gallery</a>
      </p>
      <div style="margin:24px 0 0">
        <img src="${safeImageUrl}" alt="Alannah and Rob behind the wedding table flowers" width="564" style="display:block;width:100%;height:auto;border:0;border-radius:12px">
      </div>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#7a756f">
        If you have any other photos or videos from the day, please send them to us on WhatsApp. We'd love to see them.
      </p>
    </div>
  </div>
</body>
</html>`;
}
