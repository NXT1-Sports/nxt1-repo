export interface MarketingEmailShellButton {
  readonly label: string;
  readonly href: string;
  readonly variant?: 'primary' | 'secondary';
}

export interface MarketingEmailShellInput {
  readonly preheader: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly introHtml?: string;
  readonly sectionsHtml: string[];
  readonly ctaButtons?: readonly MarketingEmailShellButton[];
  readonly footerHtml?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderButton(button: MarketingEmailShellButton): string {
  const isSecondary = button.variant === 'secondary';
  const backgroundColor = isSecondary ? 'transparent' : '#ccff00';
  const color = isSecondary ? '#111111' : '#0b1a00';
  const border = isSecondary ? '1px solid #cfd7e1' : '1px solid #ccff00';

  return [
    `<a href="${button.href}" style="display:inline-block;background-color:${backgroundColor};color:${color};border:${border};font-size:18px;font-weight:800;text-decoration:none;border-radius:999px;padding:14px 30px;margin:8px 6px;">`,
    escapeHtml(button.label),
    '</a>',
  ].join('');
}

export function buildMarketingEmailShell(input: MarketingEmailShellInput): string {
  const ctaButtons = input.ctaButtons ?? [];
  const footerHtml = input.footerHtml ?? '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;width:100% !important;background-color:#f3f5f7;color:#111111;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;">
      ${escapeHtml(input.preheader)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f3f5f7;">
      <tr>
        <td style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:10px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="background-color:#0b0f13;border:1px solid #1f2b38;border-radius:14px 14px 0 0;padding:28px 22px;text-align:center;">
                      <img src="https://raw.githubusercontent.com/NXT1-Sports/nxt1-repo/main/packages/design-tokens/assets/logo/nxt1-whitelogo.png" alt="NXT1" width="160" style="display:block;margin:0 auto 16px auto;width:160px;max-width:75%;height:auto;" />
                      ${input.eyebrow ? `<p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ccff00;">${escapeHtml(input.eyebrow)}</p>` : ''}
                      <h1 style="margin:0;font-size:42px;line-height:1.1;font-weight:800;color:#ffffff;">${escapeHtml(input.title)}</h1>
                      ${input.subtitle ? `<p style="margin:12px 0 0 0;font-size:21px;line-height:1.4;color:#d7e0ea;">${escapeHtml(input.subtitle)}</p>` : ''}
                    </td>
                  </tr>

                  ${input.introHtml ? `<tr><td style="background-color:#ffffff;border-left:1px solid #d6dde5;border-right:1px solid #d6dde5;padding:26px 22px 12px 22px;">${input.introHtml}</td></tr>` : ''}

                  ${input.sectionsHtml
                    .map(
                      (sectionHtml) =>
                        `<tr><td style="background-color:#ffffff;border-left:1px solid #d6dde5;border-right:1px solid #d6dde5;padding:0 22px 14px 22px;">${sectionHtml}</td></tr>`
                    )
                    .join('')}

                  ${
                    ctaButtons.length > 0
                      ? `<tr><td style="background-color:#ffffff;border-left:1px solid #d6dde5;border-right:1px solid #d6dde5;padding:4px 22px 20px 22px;text-align:center;">${ctaButtons.map(renderButton).join('')}</td></tr>`
                      : ''
                  }

                  ${footerHtml ? `<tr><td style="background-color:#0f1620;border:1px solid #1f2b38;border-top:none;border-radius:0 0 14px 14px;padding:18px 22px;text-align:center;">${footerHtml}</td></tr>` : ''}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
