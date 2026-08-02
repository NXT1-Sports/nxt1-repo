import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mediaProxyRoutes from '../agent/media-proxy.routes.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';

describe('media proxy export downloads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serves signed export PDFs with inline disposition when requested', async () => {
    vi.spyOn(AgentEphemeralStateService, 'validateSignedExportReadRequest').mockReturnValue(true);

    const pdfBytes = Buffer.from('%PDF-1.7\nfake-pdf-payload', 'utf8');

    const app = express();
    app.use((req, _res, next) => {
      (
        req as express.Request & {
          firebase?: {
            storage: {
              bucket: () => {
                file: () => {
                  exists: () => Promise<[boolean]>;
                  createReadStream: () => Readable;
                };
              };
            };
          };
        }
      ).firebase = {
        storage: {
          bucket: () => ({
            file: () => ({
              exists: async () => [true],
              createReadStream: () => Readable.from([pdfBytes]),
            }),
          }),
        },
      };
      next();
    });
    app.use('/api/v1/agent-x', mediaProxyRoutes);

    const response = await request(app)
      .get('/api/v1/agent-x/media-proxy/export/scout-report.pdf')
      .query({
        path: 'Users/user-1/threads/thread-1/exports/scout-report.pdf',
        mime: 'application/pdf',
        disposition: 'inline',
        exp: '9999999999999',
        sig: 'valid-signature',
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline;');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.equals(pdfBytes)).toBe(true);
  });

  it('serves legacy export URLs that embed the storage path in the route', async () => {
    const validateSpy = vi
      .spyOn(AgentEphemeralStateService, 'validateSignedExportReadRequest')
      .mockReturnValue(true);

    const pdfBytes = Buffer.from('%PDF-1.7\nlegacy-export-payload', 'utf8');

    const app = express();
    app.use((req, _res, next) => {
      (
        req as express.Request & {
          firebase?: {
            storage: {
              bucket: () => {
                file: () => {
                  exists: () => Promise<[boolean]>;
                  createReadStream: () => Readable;
                };
              };
            };
          };
        }
      ).firebase = {
        storage: {
          bucket: () => ({
            file: () => ({
              exists: async () => [true],
              createReadStream: () => Readable.from([pdfBytes]),
            }),
          }),
        },
      };
      next();
    });
    app.use('/api/v1/agent-x', mediaProxyRoutes);

    const legacyStoragePath = 'Users/user-1/threads/thread-1/exports/scout-report.pdf';
    const response = await request(app)
      .get(`/api/v1/agent-x/media-proxy/export/${legacyStoragePath}`)
      .query({
        path: legacyStoragePath,
        mime: 'application/pdf',
        disposition: 'inline',
        exp: '9999999999999',
        sig: 'valid-signature',
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('filename="scout-report.pdf"');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.equals(pdfBytes)).toBe(true);
    expect(validateSpy).toHaveBeenCalledWith({
      storagePath: legacyStoragePath,
      fileName: 'scout-report.pdf',
      mimeType: 'application/pdf',
      expRaw: '9999999999999',
      sigRaw: 'valid-signature',
    });
  });

  it('unwraps multipart-wrapped XLSX payloads before responding', async () => {
    vi.spyOn(AgentEphemeralStateService, 'validateSignedExportReadRequest').mockReturnValue(true);

    const xlsxBytes = Buffer.from('PK\x03\x04fake-xlsx-payload', 'binary');
    const wrappedPayload = Buffer.concat([
      Buffer.from(
        '--boundary-123\r\n' +
          'Content-Type: application/json\r\n\r\n' +
          '{"cacheControl":"public, max-age=31536000"}\r\n' +
          '--boundary-123\r\n' +
          'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
        'utf8'
      ),
      xlsxBytes,
      Buffer.from('\r\n--boundary-123--\r\n', 'utf8'),
    ]);

    const app = express();
    app.use((req, _res, next) => {
      (
        req as express.Request & {
          firebase?: {
            storage: {
              bucket: () => {
                file: () => {
                  exists: () => Promise<[boolean]>;
                  createReadStream: () => Readable;
                };
              };
            };
          };
        }
      ).firebase = {
        storage: {
          bucket: () => ({
            file: () => ({
              exists: async () => [true],
              createReadStream: () => Readable.from([wrappedPayload]),
            }),
          }),
        },
      };
      next();
    });
    app.use('/api/v1/agent-x', mediaProxyRoutes);

    const response = await request(app)
      .get('/api/v1/agent-x/media-proxy/export/test.xlsx')
      .query({
        path: 'Users/user-1/threads/thread-1/exports/test.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        exp: '9999999999999',
        sig: 'valid-signature',
      })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.equals(xlsxBytes)).toBe(true);
    expect(response.body.indexOf(Buffer.from('--boundary-123'))).toBe(-1);
  });
});
