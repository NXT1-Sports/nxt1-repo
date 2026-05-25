export interface SupportEmailTemplateInput {
  readonly title: string;
  readonly preheader?: string;
  readonly greeting?: string;
  readonly bodyLines: readonly string[];
  readonly ticketId?: string;
  readonly actionLabel?: string;
  readonly actionUrl?: string;
  readonly footerNote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildSupportEmailTemplate(input: SupportEmailTemplateInput): string {
  const preheader = input.preheader?.trim() || input.title;
  const greeting = input.greeting?.trim() || 'Hi there,';
  const footerNote =
    input.footerNote?.trim() ||
    'This message was sent by NXT1 Support. If you have questions, just reply to this email.';

  const renderedBody = input.bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#1f2937;">${escapeHtml(line)}</p>`
    )
    .join('');

  const ticketBlock = input.ticketId
    ? `<p style="margin:8px 0 0 0;font-size:14px;line-height:1.5;color:#4b5563;">Ticket ID: <strong>${escapeHtml(input.ticketId)}</strong></p>`
    : '';

  const actionBlock =
    input.actionLabel && input.actionUrl
      ? `<p style="margin:18px 0 0 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 18px;border-radius:8px;">${escapeHtml(input.actionLabel)}</a></p>`
      : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:620px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 12px 24px;background:#ffffff;border-bottom:1px solid #e5e7eb;">
                <p style="margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">NXT1 Support</p>
                <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.25;color:#111827;">${escapeHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px;">
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#1f2937;">${escapeHtml(greeting)}</p>
                ${renderedBody}
                ${ticketBlock}
                ${actionBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 22px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
