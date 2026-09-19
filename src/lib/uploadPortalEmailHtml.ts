export function buildUploadPortalEmailHtml(uploadUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Upload portal</title>
</head>
<body style="margin:0;padding:24px 12px;background:#fdfbf7;font-family:Arial,sans-serif;color:#3a3530">
  <div style="max-width:620px;margin:0 auto;border:1px solid #e8e2da;background:#fdfbf7;border-radius:18px;overflow:hidden">
    <div style="padding:38px 28px;text-align:center">
      <p style="margin:0;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#9c7a8c">Alannah &amp; Rob</p>
      <h1 style="margin:16px 0 0;font-family:Georgia,serif;font-size:40px;font-weight:400;color:#3a3530">Share your memories</h1>
      <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.6;color:#7a756f">
        Your Upload portal is ready for photographs and videos from our wedding weekend. Contributions are reviewed before they appear in the event gallery.
      </p>
      <p style="margin:24px 0 0">
        <a href="${uploadUrl}" style="display:inline-block;background:#dbb8b8;border:1px solid #dbb8b8;color:#3a3530;text-decoration:none;padding:12px 30px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase">Open Upload portal</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#7a756f">
        If the button does not work, use this link:<br>
        <a href="${uploadUrl}" style="color:#9c7a8c">${uploadUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
