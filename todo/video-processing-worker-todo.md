# Video Processing Worker TODO (Cloudflare Stream Pivot)

> **Master CTO Pivot - Day 1 Strategy:** Building a custom FFmpeg worker inside
> Cloud Run right before launch is too risky, complex, and resource-intensive.
> We are ripping out the custom worker idea and using a managed service like
> **Cloudflare Stream** (or Mux). They handle HLS transcoding, storage, and
> adaptive bitrate streaming automatically. We will revisit custom FFmpeg logic
> around Day 90 to cut costs.

## 1. Set Up Cloudflare Stream (Infrastructure)

- Configure a Cloudflare Stream account.
- Generate API tokens with Stream write/read access.
- Add these credentials to the backend `.env` variables and GCP Secret Manager.

## 2. Refactor Video Upload Flow (API/Frontend)

- **Remove Pub/Sub Flow:** Stop publishing to the `video-processing` Pub/Sub
  topic in `upload.routes.ts`.
- **Direct Upload Integration:** Modify the backend to request a **Direct
  Creator Upload URL** from Cloudflare Stream.
- **Frontend Update:** Update the Angular/Ionic frontend to upload the raw
  `.mp4` file directly to the Cloudflare upload URL instead of Firebase Storage.

## 3. Implement Webhook Listener (API)

- Create a new public route (e.g., `POST /api/webhooks/cloudflare`) to listen
  for Cloudflare Stream lifecycle events (specifically `video.ready` and
  `video.failed`).
- Secure the route by verifying the Cloudflare webhook signature.

## 4. Update Firestore State Sync (Database)

- When the `video.ready` webhook is received, update the user's video document
  in Firestore (e.g., `users/{userId}/videos/{videoId}`) setting
  `status: 'ready'`.
- Save the Cloudflare Stream playback URL (HLS/DASH manifest) and the generated
  thumbnail URL to the Firestore document so the frontend can retrieve them.

## 5. Update Frontend Video Player (UI)

- Ensure the frontend video player components in `@nxt1/ui` are configured to
  play the Cloudflare Stream standard HLS URL.
- Update UI states to rely on the new Firestore status flags.

## 6. Deprecate the Custom Worker (Cleanup)

- Delete or archive `backend/src/workers/video-processing-worker.ts`.
- Remove the unused Pub/Sub topics related to video processing from
  infrastructure terraform/scripts.
- Completely ignore any need for custom FFmpeg Dockerfiles.
