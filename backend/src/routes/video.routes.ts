/**
 * @fileoverview Video Routes
 * @module @nxt1/backend
 *
 * Video/highlight management routes.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ApiResponse, VideoMetadata, VideoUploadRequest } from '@nxt1/core';

import { db, storage } from '../utils/firebase.js';
import { appGuard } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth guard to all routes
router.use(appGuard);

/**
 * GET /videos
 * Get current user's videos
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;
    const { type, limit = 20, offset = 0 } = req.query;

    let query = db
      .collection('Videos')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc');

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query
      .limit(Number(limit))
      .offset(Number(offset))
      .get();

    const videos: VideoMetadata[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        title: data.title,
        description: data.description,
        url: data.url,
        thumbnailUrl: data.thumbnailUrl,
        type: data.type || 'highlight',
        duration: data.duration,
        views: data.views || 0,
        likes: data.likes || 0,
        sport: data.sport,
        tags: data.tags || [],
        isPublic: data.isPublic ?? true,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    res.json({
      success: true,
      data: { videos },
    });
  } catch (error) {
    console.error('[Videos] get videos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch videos',
    });
  }
});

/**
 * POST /videos
 * Create video metadata (after upload to storage)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;
    const videoData: VideoUploadRequest = req.body;

    // Validation
    if (!videoData.title?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Video title is required',
      });
    }

    if (!videoData.url) {
      return res.status(400).json({
        success: false,
        error: 'Video URL is required',
      });
    }

    const newVideo: Omit<VideoMetadata, 'id'> = {
      userId: uid,
      title: videoData.title.trim(),
      description: videoData.description?.trim() || '',
      url: videoData.url,
      thumbnailUrl: videoData.thumbnailUrl,
      type: videoData.type || 'highlight',
      duration: videoData.duration,
      views: 0,
      likes: 0,
      sport: videoData.sport,
      tags: videoData.tags || [],
      isPublic: videoData.isPublic ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('Videos').add(newVideo);

    res.status(201).json({
      success: true,
      data: {
        video: {
          id: docRef.id,
          ...newVideo,
        },
      },
    });
  } catch (error) {
    console.error('[Videos] create video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create video',
    });
  }
});

/**
 * GET /videos/:id
 * Get a specific video
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;

    const doc = await db.collection('Videos').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
      });
    }

    const data = doc.data()!;

    // Check visibility
    if (!data.isPublic && data.userId !== uid) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Increment view count (fire and forget)
    db.collection('Videos')
      .doc(id)
      .update({
        views: (data.views || 0) + 1,
      })
      .catch(() => {}); // Ignore errors

    const video: VideoMetadata = {
      id: doc.id,
      userId: data.userId,
      title: data.title,
      description: data.description,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl,
      type: data.type || 'highlight',
      duration: data.duration,
      views: (data.views || 0) + 1,
      likes: data.likes || 0,
      sport: data.sport,
      tags: data.tags || [],
      isPublic: data.isPublic ?? true,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    res.json({
      success: true,
      data: { video },
    });
  } catch (error) {
    console.error('[Videos] get video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch video',
    });
  }
});

/**
 * PUT /videos/:id
 * Update video metadata
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;
    const updates = req.body;

    const doc = await db.collection('Videos').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
      });
    }

    // Check ownership
    if (doc.data()!.userId !== uid) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this video',
      });
    }

    // Only allow specific fields
    const allowedFields = ['title', 'description', 'thumbnailUrl', 'tags', 'isPublic', 'sport'];
    const sanitizedUpdates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    await db.collection('Videos').doc(id).update(sanitizedUpdates);

    res.json({
      success: true,
      message: 'Video updated successfully',
    });
  } catch (error) {
    console.error('[Videos] update video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update video',
    });
  }
});

/**
 * DELETE /videos/:id
 * Delete a video
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;

    const doc = await db.collection('Videos').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
      });
    }

    // Check ownership
    if (doc.data()!.userId !== uid) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this video',
      });
    }

    // Delete from Firestore
    await db.collection('Videos').doc(id).delete();

    // Optionally delete from storage (would need storage path)
    // const storagePath = doc.data()!.storagePath;
    // if (storagePath) {
    //   await storage.bucket().file(storagePath).delete();
    // }

    res.json({
      success: true,
      message: 'Video deleted successfully',
    });
  } catch (error) {
    console.error('[Videos] delete video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete video',
    });
  }
});

/**
 * POST /videos/:id/like
 * Like/unlike a video
 */
router.post('/:id/like', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;

    const videoDoc = await db.collection('Videos').doc(id).get();

    if (!videoDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
      });
    }

    // Check if already liked
    const likeRef = db.collection('VideoLikes').doc(`${uid}_${id}`);
    const likeDoc = await likeRef.get();

    if (likeDoc.exists) {
      // Unlike
      await likeRef.delete();
      await db
        .collection('Videos')
        .doc(id)
        .update({
          likes: Math.max((videoDoc.data()!.likes || 0) - 1, 0),
        });

      res.json({
        success: true,
        data: { liked: false },
      });
    } else {
      // Like
      await likeRef.set({
        userId: uid,
        videoId: id,
        createdAt: new Date().toISOString(),
      });
      await db
        .collection('Videos')
        .doc(id)
        .update({
          likes: (videoDoc.data()!.likes || 0) + 1,
        });

      res.json({
        success: true,
        data: { liked: true },
      });
    }
  } catch (error) {
    console.error('[Videos] like video error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update like',
    });
  }
});

export default router;
