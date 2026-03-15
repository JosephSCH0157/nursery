# Hammer Media Backbone

This slice adds the pre-install groundwork for a future FFmpeg-backed media pipeline without installing or invoking FFmpeg today.

Current state:

- `recording_audio` / `export_audio` WAV sources can still use the existing built-in baseline audio polish path.
- Video containers and non-WAV audio now resolve through a media-plan seam that explicitly marks them as future FFmpeg-backed working-audio cases.
- No FFmpeg binary is bundled, installed, or executed in this slice.

Dormant runtime hooks:

- `HAMMER_MEDIA_BACKEND=auto|builtin|ffmpeg`
- `HAMMER_FFMPEG_BIN=/absolute/path/to/ffmpeg`
- `HAMMER_FFPROBE_BIN=/absolute/path/to/ffprobe`

These variables are detected only to populate runtime capability metadata and future planning state. They do not enable FFmpeg processing yet.

Future milestone intent:

1. `ensure_working_audio`
   Extract / normalize audio from video and non-WAV sources into canonical working audio.
2. `generate_waveform_proxy`
   Produce waveform/proxy artifacts for review and prep.
3. `render_clip_export`
   Render clip/export artifacts once Hammer owns release rendering.

Canonical rule:

- Hammer remains orchestration-only.
- Media processing flows through a contract seam.
- Tongs remains canonical artifact authority.
