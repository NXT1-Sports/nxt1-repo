/**
 * @fileoverview College Routes (MongoDB + Redis Cache)
 * @module @nxt1/backend/routes/colleges
 *
 * College filter routes using MongoDB with Redis cache
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { CollegeModel } from '../models/college.model.js';
import { getCacheService } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';
import { College } from '@nxt1/shared-types/college';

const router: ExpressRouter = Router();
const CACHE_TTL = 86400; // 24 hours

/**
 * GET /api/v1/colleges/filter
 * Query colleges from MongoDB with Redis cache
 *
 * Query params:
 * - sport: string (required) - Sport name (Football, Basketball, etc.)
 * - state?: string - State abbreviation (CA, NY, etc.)
 * - division?: string | string[] - Division(s) (D1, D2, D3, etc.)
 * - conference?: string - Conference name
 * - name?: string | string[] - College name(s)
 * - text?: string - Text search across multiple fields
 */
router.get('/filter', async (req: Request, res: Response) => {
  try {
    const { sport, state, division, conference, name } = req.query;
    const { text } = req.query;

    if (!sport || typeof sport !== 'string') {
      return res.status(400).json({ message: 'Sport query is required!' });
    }

    // Generate cache key
    const cacheKey = `colleges:filter:${JSON.stringify({ sport, state, division, conference, name, text })}`;

    // Check cache first
    const cache = getCacheService();
    const cached = await cache.get<{ colleges: College[] }>(cacheKey);
    if (cached) {
      logger.info('[Colleges] Cache HIT:', { sport, text });
      return res.json(cached);
    }

    logger.info('[Colleges] Cache MISS:', { sport, text });

    // Build MongoDB query with aggregation pipeline (same as old backend)
    const regExp = (val: string) => new RegExp(`^${val}$`, 'i');
    const capitalize = (s: string) => s.replace(/./, (c) => c.toUpperCase());

    const capitalizedSport = capitalize(sport);
    const sportDivision = `sportInfo.${capitalizedSport}.division`;
    const sportConference = `sportInfo.${capitalizedSport}.conference`;

    // Division filter (always array)
    const divisionsArr = Array.isArray(division)
      ? division.map((d) => regExp(d as string))
      : division
        ? [regExp(division as string)]
        : [];

    // Name filter (always array)
    const namesArr = Array.isArray(name)
      ? name.map((n) => regExp(n as string))
      : name
        ? [regExp(name as string)]
        : [];

    const stateFilter = state ? { state: regExp(state as string) } : {};
    const nameFilter = namesArr.length ? { name: { $in: namesArr } } : {};

    // Text search filter
    let textFilter = {};
    if (text) {
      // Check if text is duplicate with other params
      const allParams = [sport, state, conference, division, name]
        .flat()
        .filter(Boolean) as string[];
      const isDuplicate = allParams.some(
        (val) => val.toLowerCase() === (text as string).toLowerCase()
      );

      if (!isDuplicate) {
        textFilter = {
          $or: [
            { state: { $regex: text, $options: 'i' } },
            { city: { $regex: text, $options: 'i' } },
            { [sportDivision]: { $regex: text, $options: 'i' } },
            { [sportConference]: { $regex: text, $options: 'i' } },
            { name: { $regex: text, $options: 'i' } },
          ],
        };
      }
    }

    // Aggregation pipeline
    const colleges = await CollegeModel.aggregate([
      {
        $addFields: {
          matchedSport: {
            $filter: {
              input: { $objectToArray: '$sportInfo' },
              as: 'si',
              cond: {
                $and: [
                  // Match sport name (case-insensitive)
                  { $eq: [{ $toLower: '$$si.k' }, sport.toLowerCase()] },

                  // Match divisions if specified
                  ...(divisionsArr.length
                    ? [
                        {
                          $or: [
                            {
                              $in: [
                                '$$si.v.division',
                                Array.isArray(division) ? division : division ? [division] : [],
                              ],
                            },
                            {
                              $setIsSubset: [
                                Array.isArray(division) ? division : division ? [division] : [],
                                {
                                  $cond: [{ $isArray: '$$si.v.division' }, '$$si.v.division', []],
                                },
                              ],
                            },
                          ],
                        },
                      ]
                    : []),

                  // Match conference if specified
                  ...(conference
                    ? [
                        {
                          $and: [
                            { $ne: ['$$si.v.conference', null] },
                            { $ne: ['$$si.v.conference', undefined] },
                            {
                              $eq: [
                                { $toLower: '$$si.v.conference' },
                                (conference as string).toLowerCase(),
                              ],
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            },
          },
        },
      },
      {
        $match: {
          matchedSport: { $ne: [] },
          ...stateFilter,
          ...nameFilter,
          ...textFilter,
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          city: 1,
          state: 1,
          'IPEDS/NCES_ID': 1,
          logoUrl: 1,
          // Only include division and conference for the queried sport
          // This matches the old backend format exactly
          [`sportInfo.${capitalizedSport}.division`]: 1,
          [`sportInfo.${capitalizedSport}.conference`]: 1,
        },
      },
    ]);

    const result = { colleges };

    // Cache the result
    await cache.set(cacheKey, result, { ttl: CACHE_TTL });

    return res.json(result);
  } catch (error) {
    logger.error('[Colleges] Filter error:', { error });
    return res.status(500).json({
      message: 'Error fetching colleges',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
