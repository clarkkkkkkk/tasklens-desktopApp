# Local intelligence

Voice: CPAL → native decoding/resampling → whisper.cpp → TranscriptDocument → shared LocalExtractionService → llama.cpp/Qwen → schema validation → review → explicit repository save.

Text capture uses the same extraction service, prompt, model and review bundle. Screenshot input and onboarding retain the deterministic, visibly marked mock; OCR is not part of the voice release.

See [VOICE_CAPTURE.md](VOICE_CAPTURE.md) for exact pinned models, setup, supported formats, retention, cancellation, resource limits and verification boundaries. CPU inference is the baseline for 16 GB development machines. Runtime binaries are built for each platform; model weights are imported separately and never committed.

No cloud APIs, localhost HTTP server, remote fallback, translation, wake word or background microphone listener is used. Model outputs are untrusted: structured output is schema validated, evidence references/quotes are checked, ambiguous fields require review and nothing is saved automatically.
