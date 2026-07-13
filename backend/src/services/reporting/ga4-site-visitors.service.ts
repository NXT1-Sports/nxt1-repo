/**
 * @fileoverview GA4 site visitors reporting helpers.
 * @module @nxt1/backend/services/reporting/ga4-site-visitors
 */

import { logger } from '../../utils/logger.js';
import { GoogleAuth } from 'google-auth-library';

const GA4_PROPERTY_ID = process.env['GA4_PROPERTY_ID']?.trim();
const GA4_DATA_API_BASE_URL = 'https://analyticsdata.googleapis.com/v1beta';
const GA4_READ_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizePropertyId(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('properties/')) {
    return trimmed.slice('properties/'.length);
  }
  return trimmed;
}

async function getAccessToken(): Promise<string | null> {
  try {
    // GA4 Data API requires analytics.readonly scope. Firebase Admin credentials
    // can mint tokens, but default scopes may not include Analytics.
    const auth = new GoogleAuth({
      credentials:
        process.env['FIREBASE_CLIENT_EMAIL'] && process.env['FIREBASE_PRIVATE_KEY']
          ? {
              client_email: process.env['FIREBASE_CLIENT_EMAIL'],
              private_key: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
            }
          : undefined,
      scopes: [GA4_READ_SCOPE],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
    const accessToken = token?.trim();
    return accessToken || null;
  } catch (error) {
    logger.warn('[GA4SiteVisitors] Failed to obtain access token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchGa4SiteVisitors(
  startDate: Date,
  endDate: Date,
  periodLabel: 'week' | 'month'
): Promise<number | undefined> {
  const propertyId = normalizePropertyId(GA4_PROPERTY_ID);
  if (!propertyId) {
    return undefined;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    logger.warn(
      '[GA4SiteVisitors] Skipping site visitors fetch because access token is unavailable'
    );
    return undefined;
  }

  const endpoint = `${GA4_DATA_API_BASE_URL}/properties/${propertyId}:runReport`;
  const payload = {
    dateRanges: [
      {
        startDate: formatIsoDate(startDate),
        endDate: formatIsoDate(endDate),
      },
    ],
    metrics: [{ name: 'totalUsers' }],
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      logger.warn('[GA4SiteVisitors] GA4 Data API request failed', {
        status: response.status,
        details: details.slice(0, 500),
      });
      return undefined;
    }

    const body = (await response.json()) as {
      rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
    };

    const rawValue = body.rows?.[0]?.metricValues?.[0]?.value;
    const parsed = Number.parseInt(rawValue ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      logger.warn('[GA4SiteVisitors] Invalid GA4 totalUsers value', { rawValue });
      return undefined;
    }

    return parsed;
  } catch (error) {
    logger.warn('[GA4SiteVisitors] Failed to fetch GA4 site visitors', {
      error: error instanceof Error ? error.message : String(error),
      [`${periodLabel}Start`]: startDate.toISOString(),
      [`${periodLabel}End`]: endDate.toISOString(),
    });
    return undefined;
  }
}

/**
 * Fetches GA4 weekly unique visitors (`totalUsers`) for the given week range.
 * Returns `undefined` when GA4 is not configured or the API call fails.
 */
export async function fetchGa4WeeklySiteVisitors(
  weekStart: Date,
  weekEnd: Date
): Promise<number | undefined> {
  return fetchGa4SiteVisitors(weekStart, weekEnd, 'week');
}

/**
 * Fetches GA4 monthly unique visitors (`totalUsers`) for the given month range.
 * Returns `undefined` when GA4 is not configured or the API call fails.
 */
export async function fetchGa4MonthlySiteVisitors(
  monthStart: Date,
  monthEnd: Date
): Promise<number | undefined> {
  return fetchGa4SiteVisitors(monthStart, monthEnd, 'month');
}
