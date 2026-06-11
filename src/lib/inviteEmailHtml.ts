type InviteEmailCopy = {
  title: string;
  scriptLineOne: string;
  scriptLineTwo: string;
  dateLine: string;
  locationLine: string;
  greeting: string;
  detailsLinkText: string;
};

function inviteCopyFor(eveningInvite: boolean): InviteEmailCopy {
  if (eveningInvite) {
    return {
      title: 'Alannah & Rob',
      scriptLineOne: 'invite you to celebrate',
      scriptLineTwo: 'at our evening reception',
      dateLine: 'Friday, 28 August 2026',
      locationLine: 'Lough Erne Resort, Co. Fermanagh',
      greeting: 'we&rsquo;d be so delighted if you could join us for the evening celebration.',
      detailsLinkText: 'See alannah-rob.ie for evening details.',
    };
  }

  return {
    title: 'Alannah & Rob',
    scriptLineOne: 'invite you to celebrate',
    scriptLineTwo: 'our wedding weekend',
    dateLine: 'Friday, 28 August 2026',
    locationLine: 'Co. Fermanagh',
    greeting: 'we&rsquo;d be so delighted to celebrate together.',
    detailsLinkText: 'See alannah-rob.ie for wedding details.',
  };
}

export function buildInviteEmailHtml(displayName: string, rsvpUrl: string, baseUrl: string, eveningInvite = false): string {
  const assetBase = baseUrl.replace(/\/$/, '');
  const copy = inviteCopyFor(eveningInvite);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're invited</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Charmonman:wght@400;700&family=Cormorant+Garamond:wght@300;400;500;600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px 12px;background:#fdfbf7;font-family:'Jost',Arial,sans-serif;color:#3a3530">
  <div style="max-width:620px;margin:0 auto;border:1px solid #e8e2da;background:#fdfbf7;box-shadow:0 20px 56px rgba(58,53,48,0.08);border-radius:18px;overflow:hidden">
    <div style="padding:34px 34px 30px;text-align:center;background:radial-gradient(circle at top,rgba(219,184,184,0.16),transparent 52%),radial-gradient(circle at 85% 20%,rgba(143,168,136,0.1),transparent 42%)">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;border-collapse:collapse">
        <tr>
          <td width="34%" align="left" valign="top">
            <img src="${assetBase}/assets/menlo-castle-rsvp.png" width="86" alt="" style="display:block;border:0;outline:none;text-decoration:none;opacity:0.7">
          </td>
          <td width="32%" align="center" valign="top">
            <p style="margin:2px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;letter-spacing:0.16em;color:#9c7a8c">
              A ◇ R
            </p>
          </td>
          <td width="34%" align="right" valign="top">&nbsp;</td>
        </tr>
      </table>

      <p style="margin:0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:17px;line-height:1.1;color:#9ab396;font-weight:400">
        le grá agus le háthas
      </p>
      <h1 style="margin:9px 0 0;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:60px;line-height:0.94;font-weight:400;letter-spacing:0.01em;color:#9c7a8c">
        ${copy.title}
      </h1>
      <p style="margin:5px 0 0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:22px;line-height:1.02;color:#dfc1c6;font-weight:400">
        ${copy.scriptLineOne}
      </p>
      <p style="margin:1px 0 0;font-family:'Charmonman','Brush Script MT','Segoe Script',cursive;font-size:21px;line-height:1.01;color:#dfc1c6;font-weight:400">
        ${copy.scriptLineTwo}
      </p>
      <div style="margin:8px auto 5px;max-width:430px;height:1px;background:#d9d2c9;opacity:0.75"></div>
      <p style="margin:14px 0 0;font-family:'Jost',Arial,sans-serif;font-size:11px;line-height:1.2;letter-spacing:0.28em;text-transform:uppercase;color:#7a756f">
        ${copy.dateLine}
      </p>
      <p style="margin:6px 0 0;font-family:'Jost',Arial,sans-serif;font-size:13px;line-height:1.4;color:#7a756f;letter-spacing:0.12em;text-transform:uppercase">
        ${copy.locationLine}
      </p>
      <p style="margin:15px 0 0;font-family:'Jost',Arial,sans-serif;font-size:15px;line-height:1.68;color:#3a3530">
        Dear ${displayName}, ${copy.greeting}
      </p>

      <div style="text-align:center;margin-top:16px">
        <a href="${rsvpUrl}" style="display:inline-block;background:#dbb8b8;border:1px solid #dbb8b8;color:#3a3530;text-decoration:none;padding:12px 30px;border-radius:999px;font-family:'Jost',Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase">RSVP Now</a>
      </div>
      <p style="margin:14px 0 0;font-family:'Jost',Arial,sans-serif;font-size:12px;line-height:1.5;color:#7a756f;text-align:center">
        If the button does not work, use this link:<br>
        <a href="${rsvpUrl}" style="color:#9c7a8c">Open your RSVP link</a>
      </p>
      <p style="margin:10px 0 0;font-family:'Jost',Arial,sans-serif;font-size:12px;line-height:1.5;color:#7a756f;text-align:center">
        ${copy.detailsLinkText.replace('alannah-rob.ie', '<a href="https://alannah-rob.ie" style="color:#9c7a8c">alannah-rob.ie</a>')}
      </p>

      <div style="text-align:right;margin-top:15px">
        <img src="${assetBase}/assets/devenish-tower-rsvp.png" width="108" alt="" style="display:inline-block;border:0;outline:none;text-decoration:none;opacity:0.75">
      </div>
    </div>
  </div>
</body>
</html>`;
}
