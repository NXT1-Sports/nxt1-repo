import { describe, expect, it } from 'vitest';
import {
  buildMicrosoftSendMailPayload,
  buildRawGmailMessage,
  type ProviderEmailAttachment,
} from '../connected-mail.service.js';

const attachment: ProviderEmailAttachment = {
  filename: 'scout-report.pdf',
  contentType: 'application/pdf',
  contentBytes: Buffer.from('PDF bytes'),
  sizeBytes: 9,
};

function decodeRawGmailMessage(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

describe('connected mail attachment serialization', () => {
  it('builds multipart Gmail MIME when attachments are present', () => {
    const raw = buildRawGmailMessage(
      'coach@example.com',
      'Player report',
      '<p>Attached report.</p>',
      [attachment]
    );

    const mime = decodeRawGmailMessage(raw);

    expect(mime).toContain('Content-Type: multipart/mixed; boundary="nxt1_');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('Content-Type: application/pdf; name="scout-report.pdf"');
    expect(mime).toContain('Content-Disposition: attachment; filename="scout-report.pdf"');
    expect(mime).toContain(Buffer.from('PDF bytes').toString('base64'));
  });

  it('builds Microsoft Graph fileAttachment payloads', () => {
    const payload = buildMicrosoftSendMailPayload(
      'coach@example.com',
      'Player report',
      '<p>Attached report.</p>',
      [attachment]
    );

    expect(payload).toEqual({
      message: {
        subject: 'Player report',
        body: { contentType: 'HTML', content: '<p>Attached report.</p>' },
        toRecipients: [{ emailAddress: { address: 'coach@example.com' } }],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'scout-report.pdf',
            contentType: 'application/pdf',
            contentBytes: Buffer.from('PDF bytes').toString('base64'),
          },
        ],
      },
    });
  });
});
