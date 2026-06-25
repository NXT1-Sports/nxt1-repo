# H.264 Level 6.2 Issue: Root Cause Analysis & Fix

## Executive Summary

The staged video pipeline is producing H.264 Level 6.2 instead of Level 4.0
despite:

- FFmpeg bridge correctly calling `convertVideo` with proper parameters
- Fail-closed behavior preventing raw video bypass
- MCP server including `-level:v 4.0` in the FFmpeg command

## Root Cause: Validation Gap in MCP Server

The validation code exists but has a **critical flaw**: it only validates when
`video_codec == "libx264"` at line 1162 in `app.py`. However:

1. **Missing validation in postprocess step**: The `_postprocess_response()`
   function calls `_assert_valid_output_file()` which performs validation, BUT
   this happens AFTER the file is already returned to the caller.

2. **FFmpeg level constraint ineffective**: The `-level:v 4.0` flag alone does
   NOT re-encode an H.264 video to a lower level if the source video's
   resolution/framerate constraints allow the higher level. FFmpeg respects the
   flag but may preserve higher levels if constraints permit.

3. **SPS not being re-encoded**: When encoding with libx264, the `-level:v` flag
   sets the encoding profile, but if the actual encoded bitstream doesn't
   violate the constraints, ffmpeg may report the higher level that the source
   used.

## Proof of Issue

**Current code at line 1140-1142:**

```python
if video_codec == "libx264":
    cmd.extend(_mobile_h264_args())
    cmd.extend(_mobile_cfr_args())
```

**The command includes:**

```
-profile:v high
-level:v 4.0
-pix_fmt yuv420p
-bf 0
-tag:v avc1
-r 30
-fps_mode cfr
```

**But for H.264 Level 4.0 to be enforced at 1280x720 30fps, we need explicit
constraints:**

- Level 4.0 at 1280x720 supports max ~100 Mbps bitrate
- Default libx264 CRF 23 may exceed this implicitly
- Need explicit `-b:v` (bitrate cap) or `-maxrate`/`-bufsize` to force
  re-encoding

## The Real Problem

**At line 1104-1108**, the video codec is forced to libx264 for MP4:

```python
is_mp4_output = Path(output_path).suffix.lower() in {"", ".mp4", ".m4v", ".mov"}
video_codec = "libx264" if is_mp4_output else requested_video_codec
```

**But there's no check that the input video is already compatible.** If the
input is Level 6.2 H.264, it gets passed through with minimal re-encoding
constraints, and the output preserves the higher level.

## Solution: Add Explicit H.264 Level Enforcement

### Step 1: Enhance `_mobile_h264_args()`

Add VBV (Video Buffering Verifier) buffer size constraints that force libx264 to
respect Level 4.0 limits:

```python
def _mobile_h264_args() -> list[str]:
    return [
        "-profile:v", MOBILE_H264_PROFILE,
        "-level:v", MOBILE_H264_LEVEL,
        "-pix_fmt", "yuv420p",
        "-bf", "0",
        "-tag:v", "avc1",
        # Force Level 4.0 constraint: 62.5 Mbps bitrate for 1280x720@30fps
        "-maxrate", "62500k",
        "-bufsize", "62500k",
        "-refs", "4",
    ]
```

### Step 2: Ensure Input Video Probe Happens Early

Before encoding, probe the input to detect if it already requires normalization:

```python
def _video_requires_h264_normalization(local_path: str) -> bool:
    stream = _probe_video_stream(local_path)
    level = int(stream.get("level") or 0)
    if level > 40:
        return True
    # Also check other constraints
    codec = stream.get("codec_name")
    return codec != "h264"
```

### Step 3: Validate BEFORE returning from convert_video

Move validation to happen immediately after FFmpeg completes, before any upload:

```python
_run_ffmpeg_command(cmd, input_path=input_path, output_path=output_path, ...)
# CRITICAL: Validate before returning
_assert_valid_video_output(output_path, strict_ios_mp4=True)
```

### Step 4: Enhance SPS-level validation

The validation at line 498-500 checks ffprobe's reported level, but we should
also verify the actual SPS:

```python
# Add debug validation using trace_headers
def _validate_h264_sps(local_path: str) -> dict:
    result = subprocess.run([
        "ffmpeg", "-i", local_path,
        "-map", "0:v:0", "-c:v", "copy",
        "-bsf:v", "trace_headers",
        "-an", "-f", "null", "-"
    ], capture_output=True, text=True, timeout=30)

    stderr = result.stderr
    # Extract: profile_idc = 100, level_idc = 40
    profile_match = re.search(r"profile_idc\s*=\s*(\d+)", stderr)
    level_match = re.search(r"level_idc\s*=\s*(\d+)", stderr)

    return {
        "profile_idc": int(profile_match.group(1)) if profile_match else None,
        "level_idc": int(level_match.group(1)) if level_match else None,
    }
```

## Implementation Plan

### File: `backend/mcp/ffmpeg-mcp/app.py`

1. **Lines 76-88**: Update `_mobile_h264_args()` to include bitrate constraints
2. **After line 1152**: Add immediate post-encode validation
3. **New function**: Add `_video_requires_h264_normalization()` check
4. **Lines 1162**: Ensure `_assert_valid_video_output()` is ALWAYS called

### File: `backend/src/modules/agent/tools/media/stage-media.tool.ts`

No changes needed — the bridge already calls convertVideo correctly.

### File: `backend/src/modules/agent/tools/integrations/runway/runway-check-task.tool.ts`

No changes needed — the bridge is already wired correctly.

## Verification Steps

After fix:

1. **Stage a Level 6.2 video:**

   ```bash
   ffprobe output.mp4 -select_streams v:0 -show_entries stream=level
   # Expected: level=40
   ```

2. **Check SPS directly:**

   ```bash
   ffmpeg -i output.mp4 -map 0:v:0 -c:v copy -bsf:v trace_headers -an -f null - 2>&1 | grep level_idc
   # Expected: level_idc = 40
   ```

3. **Verify file was encoded, not copied:**
   - Output file size should be different from input (due to re-encode)
   - ffprobe should show `crf` or bitrate applied

## Risk Assessment

- **Low Risk**: Adding bitrate constraints to libx264
- **Low Risk**: Adding post-encode validation
- **Test Coverage**: Existing tests in `stage-media.tool.spec.ts` +
  `runway-check-task.tool.spec.ts` should still pass

## Timeline

1. Add bitrate constraints to `_mobile_h264_args()`
2. Add validation immediately after encode
3. Test with Level 6.2 fixture video
4. Deploy and verify in staging
