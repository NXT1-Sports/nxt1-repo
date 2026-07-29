## What's Changed

### Bug fixes

- **`write_core_identity` empty-payload validation** — The tool now marks
  empty-payload rejections as `isValidationError: true` so the ToolRegistry does
  not fire the critical "Agent Tool Execution Failed" Slack alert for expected
  caller mistakes. A structured `warn` log is emitted instead so the error
  remains observable without creating noise. Unit tests were added for the
  empty-payload rejection path and for the successful single-section path.

**Full Changelog**:
https://github.com/NXT1-Sports/nxt1-repo/compare/v1.84.13...v1.84.13
