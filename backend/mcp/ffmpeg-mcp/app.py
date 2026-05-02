import json
import mimetypes
import os
import re
import sys
import subprocess
import urllib.request
import uuid
from pathlib import Path

# ── Clone upstream ffmpeg-mcp at startup ────────────────────────────────────
UPSTREAM_DIR = Path("/tmp/ffmpeg-mcp-upstream")
if not UPSTREAM_DIR.exists():
    subprocess.run(
        ["git", "clone", "https://github.com/dubnium0/ffmpeg-mcp.git", str(UPSTREAM_DIR)],
        check=True,
        capture_output=True,
    )

sys.path.insert(0, str(UPSTREAM_DIR))

import uvicorn
from starlette.applications import Starlette
from starlette.background import BackgroundTask
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route

try:
    from server import mcp as upstream_mcp
except ImportError as e:
    print(f"ERROR: Failed to import upstream ffmpeg-mcp server: {e}", file=sys.stderr)
    sys.exit(1)

# ── Config ───────────────────────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
MCP_PATH = os.environ.get("FFMPEG_MCP_PATH", "/mcp")
BEARER_TOKEN = os.environ.get("FFMPEG_MCP_BEARER_TOKEN", "").strip()
STATELESS_HTTP = os.environ.get("FFMPEG_MCP_STATELESS_HTTP", "true").lower() == "true"
FIREBASE_STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "").strip()
FFMPEG_OUTPUT_GCS_PREFIX = os.environ.get("FFMPEG_OUTPUT_GCS_PREFIX", "agent-x/ffmpeg")
FFMPEG_MCP_TOKEN_HEADER = os.environ.get("FFMPEG_MCP_TOKEN_HEADER", "x-ffmpeg-mcp-token").strip().lower()

# Tool argument keys that represent input file paths or arrays of paths
_URL_INPUT_KEYS = {"input_path", "subtitle_path"}
_URL_ARRAY_KEYS = {"input_paths"}
_OUTPUT_KEYS = {"output_path"}


# ── URL / GCS helpers ────────────────────────────────────────────────────────

# Streaming / HLS format extensions that require FFmpeg to download
_STREAMING_EXTENSIONS = {".m3u8", ".m3u", ".mpd"}
# Streaming URL path keywords (for URLs without an obvious extension)
_STREAMING_PATH_KEYWORDS = ("/manifest/", "/playlist.", "/stream.", ".m3u8", ".mpd")


def _is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _is_streaming_url(url: str) -> bool:
    """Return True if the URL points to an HLS/DASH manifest rather than a direct file."""
    clean = url.split("?")[0].split("#")[0].lower()
    if Path(clean).suffix in _STREAMING_EXTENSIONS:
        return True
    return any(kw in clean for kw in _STREAMING_PATH_KEYWORDS)


def _url_extension(url: str) -> str:
    clean = url.split("?")[0].split("#")[0]
    suffix = Path(clean).suffix
    return suffix if suffix in {".mp4", ".mov", ".webm", ".mkv", ".avi", ".mp3", ".aac", ".wav", ".jpg", ".png", ".srt", ".ass", ".vtt"} else ".mp4"


def _sanitize_upload_prefix(prefix: str | None) -> str | None:
    if not prefix:
        return None
    normalized = prefix.strip().replace("\\", "/").strip("/")
    if not normalized:
        return None
    if ".." in normalized:
        return None
    if not re.fullmatch(r"[A-Za-z0-9/_-]+", normalized):
        return None
    return normalized


def _download_url(url: str) -> str:
    """
    Download a remote URL to /tmp and return the local path.

    For HLS/DASH streaming manifests (e.g. Cloudflare Stream .m3u8 URLs),
    uses FFmpeg to demux and remux the stream into an output format.
    For direct file URLs, falls back to urllib for a simple byte-copy.

    Uses _url_extension() to resolve the output format in both cases.
    """
    ext = _url_extension(url)  # Resolves to a safe extension or defaults to .mp4
    local_path = f"/tmp/{uuid.uuid4().hex}{ext}"

    if _is_streaming_url(url):
        # Use FFmpeg to download HLS/DASH — the only reliable method for streaming URLs
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", url, "-c", "copy", local_path],
            capture_output=True,
            timeout=300,
        )
        if result.returncode != 0:
            err = result.stderr.decode(errors="replace")[-600:]
            raise RuntimeError(f"FFmpeg failed to download streaming URL: {err}")
        return local_path

    # Direct file URL — try urllib first
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ffmpeg-mcp/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp, open(local_path, "wb") as f:
            while chunk := resp.read(65536):
                f.write(chunk)
        return local_path
    except Exception as exc:
        raise RuntimeError(f"Failed to download input URL: {exc}") from exc


def _upload_to_gcs(local_path: str, upload_prefix: str | None = None) -> str:
    """
    Upload a local file to Firebase Storage and return a Firebase download URL.

    Uses a Firebase download token (stored in object metadata) instead of
    making the object publicly readable via ACLs — this works even when the
    bucket has Uniform Bucket-Level Access enabled (the default for Firebase
    Storage buckets).
    """
    if not FIREBASE_STORAGE_BUCKET:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is not configured")

    import secrets
    from urllib.parse import quote as url_quote
    from google.cloud import storage  # imported lazily; only needed at runtime

    client = storage.Client()
    bucket = client.bucket(FIREBASE_STORAGE_BUCKET)
    ext = Path(local_path).suffix or ".mp4"
    effective_prefix = _sanitize_upload_prefix(upload_prefix) or FFMPEG_OUTPUT_GCS_PREFIX
    blob_name = f"{effective_prefix}/{uuid.uuid4().hex}{ext}"
    blob = bucket.blob(blob_name)
    content_type = mimetypes.guess_type(local_path)[0] or "video/mp4"

    # Generate a Firebase download token and attach it as object metadata
    # so Firebase Storage returns this token in its download URL format.
    download_token = secrets.token_urlsafe(32)
    blob.metadata = {"firebaseStorageDownloadTokens": download_token}

    blob.upload_from_filename(local_path, content_type=content_type)
    # Persist the custom metadata so the token is readable via the Firebase SDK.
    blob.patch()

    # Build the Firebase Storage REST download URL (works without public ACLs).
    encoded_name = url_quote(blob_name, safe="")
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{FIREBASE_STORAGE_BUCKET}"
        f"/o/{encoded_name}?alt=media&token={download_token}"
    )


# ── Argument pre/post processing ─────────────────────────────────────────────

def _preprocess_args(args: dict) -> tuple[dict, list[str], dict[str, dict[str, str | None]]]:
    """
    Walk tool arguments and:
      - Download any URL values in input path keys to /tmp/
      - Ensure output_path is an absolute /tmp/ path
    Returns (modified_args, temp_input_files, output_path_map).
    """
    modified = dict(args)
    temp_inputs: list[str] = []
    output_map: dict[str, dict[str, str | None]] = {}

    for key in list(modified.keys()):
        val = modified[key]

        if key in _URL_INPUT_KEYS:
            if isinstance(val, str) and _is_url(val):
                local = _download_url(val)
                temp_inputs.append(local)
                modified[key] = local

        elif key in _URL_ARRAY_KEYS:
            # Handle both array input (from bridge) and comma-separated string
            if isinstance(val, str):
                val = [p.strip() for p in val.split(",") if p.strip()]
            if isinstance(val, list):
                new_list = []
                for item in val:
                    if isinstance(item, str) and _is_url(item):
                        local = _download_url(item)
                        temp_inputs.append(local)
                        new_list.append(local)
                    else:
                        new_list.append(item)
                # The upstream MCP tool (dubnium0/ffmpeg-mcp) expects a
                # comma-separated string, so rejoin after URL resolution
                modified[key] = ",".join(new_list)

        elif key in _OUTPUT_KEYS and isinstance(val, str):
            # Always force output into /tmp/ so FFmpeg has write access
            requested_output = val.strip()
            requested_relative = requested_output.lstrip("/")
            requested_parent = str(Path(requested_relative).parent).replace("\\", "/")
            upload_prefix = (
                requested_parent
                if requested_parent and requested_parent != "." and requested_parent.startswith("Users/")
                else None
            )

            if not val.startswith("/"):
                local_out = f"/tmp/{uuid.uuid4().hex}_{Path(val).name}"
            else:
                local_out = val
            output_map[key] = {
                "local_path": local_out,
                "upload_prefix": _sanitize_upload_prefix(upload_prefix),
            }
            modified[key] = local_out

    return modified, temp_inputs, output_map


def _postprocess_response(
    response_body: bytes,
    output_map: dict[str, dict[str, str | None]],
    temp_inputs: list[str],
) -> bytes:
    """
    After the tool runs:
      - Delete downloaded temp input files
      - Upload the output file to Firebase Storage
      - Inject outputUrl into the JSON-RPC result content

    The MCP server responds with either:
      a) Plain JSON:  {"jsonrpc":"2.0","id":1,"result":{...}}
      b) SSE:         event: message\ndata: {"jsonrpc":"2.0",...}\n\n
    """
    # Clean up temp inputs regardless of outcome
    for tmp in temp_inputs:
        try:
            Path(tmp).unlink(missing_ok=True)
        except Exception:
            pass

    if not output_map:
        return response_body

    # Find the first output file that actually exists
    output_url: str | None = None
    for output_meta in output_map.values():
        local_path = str(output_meta.get("local_path") or "")
        upload_prefix = output_meta.get("upload_prefix")
        if not local_path:
            continue
        if Path(local_path).exists():
            try:
                output_url = _upload_to_gcs(local_path, upload_prefix)
                # Only delete after a successful upload — if upload fails, leave
                # the file on disk so the backend can fetch it via /files/.
                try:
                    Path(local_path).unlink(missing_ok=True)
                except Exception:
                    pass
            except Exception as exc:
                print(f"[ffmpeg-mcp] GCS upload failed (file kept for /files/ download): {exc}", file=sys.stderr)
            break

    if not output_url:
        # GCS upload failed or not configured — leave the output files on disk
        # so the backend can download them via the /files/{filename} endpoint.
        return response_body

    # ── Inject outputUrl into the JSON-RPC response ──────────────────────────
    text = response_body.decode(errors="replace")

    # Normalize line endings — FastMCP / Starlette may use \r\n or \n
    text_norm = text.replace("\r\n", "\n").replace("\r", "\n")

    # The payload we want to surface to the bridge
    injected_text = json.dumps({"success": True, "outputUrl": output_url})
    injected_content = [{"type": "text", "text": injected_text}]

    # ── Strategy 1: locate SSE "data: {...}" line and patch it in-place ───────
    sse_match = re.search(r"(^|\n)(data: )(\{[^\n]*\})(\n|$)", text_norm)
    if sse_match:
        json_str = sse_match.group(3)
        sse_prefix = text_norm[: sse_match.start(3)]
        sse_suffix = text_norm[sse_match.end(3):]
        try:
            data = json.loads(json_str)
            # data may be a list (batch) or a single JSON-RPC object
            items = data if isinstance(data, list) else [data]
            patched = False
            for item in items:
                if not isinstance(item, dict):
                    continue
                result = item.get("result")
                # Legacy envelope: result is a JSON string — unwrap it
                if isinstance(result, str):
                    try:
                        result = json.loads(result)
                    except Exception:
                        result = {}
                if not isinstance(result, dict):
                    result = {}
                result["content"] = injected_content
                result.pop("isError", None)
                item["result"] = result
                patched = True
                break
            if patched:
                new_json = json.dumps(data)
                final_text = sse_prefix + new_json + sse_suffix
                print(f"[ffmpeg-mcp] outputUrl injected via SSE patch: {output_url[:80]}", flush=True)
                return final_text.encode()
            else:
                print(f"[ffmpeg-mcp] SSE data line found but no patchable result; will use synthetic", flush=True)
        except Exception as exc:
            print(f"[ffmpeg-mcp] SSE patch failed ({exc}); will use synthetic", flush=True)

    # ── Strategy 2: patch plain JSON-RPC body ────────────────────────────────
    try:
        data = json.loads(text_norm.strip())
        items = data if isinstance(data, list) else [data]
        patched = False
        for item in items:
            if not isinstance(item, dict):
                continue
            result = item.get("result")
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except Exception:
                    result = {}
            if not isinstance(result, dict):
                result = {}
            result["content"] = injected_content
            result.pop("isError", None)
            item["result"] = result
            patched = True
            break
        if patched:
            print(f"[ffmpeg-mcp] outputUrl injected via JSON-RPC patch: {output_url[:80]}", flush=True)
            return json.dumps(data).encode()
    except Exception as exc:
        print(f"[ffmpeg-mcp] JSON-RPC patch failed ({exc}); will use synthetic", flush=True)

    # ── Strategy 3: return a synthetic SSE response ──────────────────────────
    # Neither strategy could parse the original response body, so build a
    # minimal JSON-RPC SSE envelope that the bridge can always parse.
    print(f"[ffmpeg-mcp] Using synthetic SSE response for outputUrl: {output_url[:80]}", flush=True)
    print(f"[ffmpeg-mcp] Original response (first 300): {text_norm[:300]!r}", flush=True)
    synthetic_rpc = json.dumps({
        "jsonrpc": "2.0",
        "id": "1",
        "result": {"content": injected_content},
    })
    # Wrap in SSE if the original response looked like SSE
    if "data: " in text_norm:
        return f"event: message\ndata: {synthetic_rpc}\n\n".encode()
    return synthetic_rpc.encode()


# ── Middleware ────────────────────────────────────────────────────────────────

# ── Middleware ────────────────────────────────────────────────────────────────

class BearerTokenMiddleware:
    """Pure ASGI middleware: validates Bearer token on all non-health paths."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in {"/health", "/"}:
            await self.app(scope, receive, send)
            return

        if not BEARER_TOKEN:
            await self._error(send, 503, "FFMPEG_MCP_BEARER_TOKEN is not configured")
            return

        headers = dict(scope.get("headers", []))

        # Cloud Run may interpret Authorization as an identity token. Prefer a
        # custom application header to avoid platform auth conflicts.
        token_header_key = FFMPEG_MCP_TOKEN_HEADER.encode()
        provided_token = headers.get(token_header_key, b"").decode().strip()

        # Backward compatibility for local/dev callers still using Authorization.
        if not provided_token:
            auth = headers.get(b"authorization", b"").decode()
            if auth.startswith("Bearer "):
                provided_token = auth[7:].strip()

        if provided_token != BEARER_TOKEN:
            await self._error(send, 401, "Unauthorized")
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _error(send, status: int, message: str):
        body = json.dumps({"ok": False, "error": message}).encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body, "more_body": False})


class FfmpegUrlMiddleware:
    """
    Pure ASGI middleware that intercepts MCP tools/call requests to:
      1. Download URL inputs to /tmp/ before FFmpeg runs
      2. Upload the output file to Firebase Storage after FFmpeg runs
      3. Replace local output paths with the public GCS URL in the response
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")

        if method != "POST" or not path.startswith(MCP_PATH):
            await self.app(scope, receive, send)
            return

        # Buffer the full request body
        body_parts: list[bytes] = []
        more_body = True
        while more_body:
            message = await receive()
            body_parts.append(message.get("body", b""))
            more_body = message.get("more_body", False)
        body_bytes = b"".join(body_parts)

        try:
            body = json.loads(body_bytes)
        except Exception:
            await self.app(scope, _make_receive(body_bytes), send)
            return

        # Only intercept tools/call; pass all other MCP messages through unchanged
        if body.get("method") != "tools/call":
            await self.app(scope, _make_receive(body_bytes), send)
            return

        args = body.get("params", {}).get("arguments", {})
        try:
            modified_args, temp_inputs, output_map = _preprocess_args(args)
        except Exception as exc:
            # URL download failed — return structured MCP error instead of HTTP 500
            print(f"[ffmpeg-mcp] Input preprocessing failed: {exc}", flush=True)
            err_payload = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "content": [{"type": "text", "text": f"Error: {exc}"}],
                    "isError": True,
                },
            }
            sse = f"event: message\ndata: {json.dumps(err_payload)}\n\n".encode()
            await send({"type": "http.response.start", "status": 200,
                        "headers": [(b"content-type", b"text/event-stream"),
                                     (b"content-length", str(len(sse)).encode())]})
            await send({"type": "http.response.body", "body": sse, "more_body": False})
            return

        body.setdefault("params", {})["arguments"] = modified_args
        modified_bytes = json.dumps(body).encode()

        # Capture the full response so we can modify it
        response_status = 200
        response_headers: list[tuple[bytes, bytes]] = []
        response_body_parts: list[bytes] = []

        async def capture_send(message):
            nonlocal response_status, response_headers
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = list(message.get("headers", []))
            elif message["type"] == "http.response.body":
                response_body_parts.append(message.get("body", b""))

        await self.app(scope, _make_receive(modified_bytes), capture_send)

        response_body = b"".join(response_body_parts)
        final_body = _postprocess_response(response_body, output_map, temp_inputs)

        # Rebuild headers with updated content-length (drop transfer-encoding)
        new_headers = [
            (k, v)
            for k, v in response_headers
            if k.lower() not in (b"content-length", b"transfer-encoding")
        ]
        new_headers.append((b"content-length", str(len(final_body)).encode()))

        await send({
            "type": "http.response.start",
            "status": response_status,
            "headers": new_headers,
        })
        await send({"type": "http.response.body", "body": final_body, "more_body": False})


def _make_receive(body: bytes):
    """Return a simple ASGI receive callable that yields the given body once."""
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        # Subsequent calls block; callers should only read once
        import asyncio
        await asyncio.sleep(3600)

    return receive


# ── /files/{filename} — backend download endpoint ───────────────────────────
# Serves processed output files from /tmp/ so the backend can download and
# re-host them on Firebase Storage when GCS auto-upload is not configured.
# The file is deleted after it is served (single-use download).

_SAFE_FILENAME_RE = re.compile(r'^[\w.\-]+$')

async def files_handler(request: Request) -> Response:
    filename = request.path_params.get("filename", "")
    # Strict sanitisation — reject path traversal or unusual characters
    if not _SAFE_FILENAME_RE.match(filename) or '..' in filename:
        return Response('Not found', status_code=404)

    local_path = Path(f"/tmp/{filename}")
    if not local_path.exists() or not local_path.is_file():
        return Response('Not found', status_code=404)

    content_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'

    # Delete the file once the response has been fully sent
    def _cleanup():
        try:
            local_path.unlink(missing_ok=True)
        except Exception:
            pass

    return FileResponse(
        str(local_path),
        media_type=content_type,
        background=BackgroundTask(_cleanup),
    )


# ── Health endpoint ───────────────────────────────────────────────────────────

async def health(_: Request):
    return JSONResponse(
        {
            "ok": True,
            "service": "ffmpeg-mcp",
            "mcpPath": MCP_PATH,
            "statelessHttp": STATELESS_HTTP,
            "authConfigured": bool(BEARER_TOKEN),
            "storageConfigured": bool(FIREBASE_STORAGE_BUCKET),
        }
    )


# ── App assembly ──────────────────────────────────────────────────────────────

mcp_app = upstream_mcp.http_app(
    path=MCP_PATH,
    transport="http",
    stateless_http=STATELESS_HTTP,
)

_base_app = Starlette(
    routes=[
        Route("/health", health),
        Route("/files/{filename}", files_handler),
        Mount("/", app=mcp_app),
    ],
    lifespan=mcp_app.lifespan,
)

# Wrap with pure ASGI middleware (innermost to outermost)
# FfmpegUrlMiddleware runs closest to the MCP handler; BearerTokenMiddleware runs first
app = BearerTokenMiddleware(FfmpegUrlMiddleware(_base_app))


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
