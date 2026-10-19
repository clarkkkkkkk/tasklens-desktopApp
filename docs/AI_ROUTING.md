# Adaptive AI routing

TaskLens chooses which on-device model runs each job. It weighs the input, the device and the
local models that are actually available. It is no longer tied to one model. The capture →
extraction → validation → review → confirmation → repository → calendar workflow is unchanged.
Only the model call in the middle is now routed.

Status: the router, local providers (bundled llama.cpp, Ollama), device detection and fallback are
implemented and tested. TaskLens is **local-only**: every provider runs on this device, and the
router has no cloud provider kind, cloud modes, upload consent or network gating. Proprietary and
cloud AI was removed on 2026-10-19 (see the last section).

## A. Architecture

```
 Screenshot / voice / text
          │
          ▼
 Capture ─► Preprocessing ─► OCR (Tesseract, always local) / Speech-to-text (whisper.cpp, always local)
                                   │
                                   ▼
                       TaskRequirements (deriveRequirements)
                         input kind, visual signal, length,
                         language mix, complexity, capabilities
                                   │
     ┌─────────────────────────────┼─────────────────────────────────┐
     │ AIRouter                    ▼                                 │
     │  DeviceProfiler ──► DeviceAssessment (RAM/VRAM budget, class) │
     │  ProviderRegistry ─► discover providers + models (parallel)   │
     │  Policy (AI mode, priority)                                   │
     │                                                               │
     │  hard filters ─► weighted scoring ─► decision                 │
     │  explain() ─► reasons, alternatives, exclusions               │
     └─────────────────────────────┬─────────────────────────────────┘
                                   ▼
                     RouteDecision (ready | no-candidate)
                                   ▼
                  AIRequest ─► selected AIProvider.generate()
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
   LlamaCppProvider         OllamaProvider             MockProvider
   (bundled, IPC)           (loopback IPC)             (demo/tests)
                                   │
                                   ▼
                  AIResponse (raw text) ─► validateExtraction (unchanged)
                                   │           └─ one repair attempt on the same provider
                                   ▼
                     Human review ─► Confirm ─► Repository ─► Agenda
```

The router and providers live in `src/services/ai`. `RoutedExtractionService` replaces the
hard-wired model call inside the existing pipeline. UI, validation, review and storage do not know
which provider ran.

## B. File-by-file plan

New (TypeScript, `src/services/ai/`):

| File | Purpose |
| --- | --- |
| `types.ts` | `AICapability`, `AIModel`, `AIProvider`, `AIRequest`, `AIResponse`, `AIProviderError` |
| `device.ts` | `DeviceProfile`, native and browser profilers, `assessDevice` (memory budget, performance class) |
| `requirements.ts` | `deriveRequirements`: what this job needs and prefers |
| `footprint.ts` | Generic size, quantization and memory estimates, parsed from detected facts |
| `scoring.ts` | Weights, priority presets, task adjustments, hard filters, dimension scores |
| `explain.ts` | Reasons, privacy statement and trade-offs as plain language |
| `policy.ts` | AI modes (Automatic, Manual) and priorities |
| `router.ts` | `recommend()` (pure) and `AIRouter` (snapshot, decide, fallback, failure history) |
| `registry.ts` | `ProviderRegistry`: registration and bounded parallel discovery |
| `catalog.ts` | Example devices and models for the router simulator (labelled as examples) |
| `providers/*.ts` | `MockProvider`, `LlamaCppProvider`, `OllamaProvider` |
| `testing.ts` | Device, model and snapshot builders for tests |
| `*.test.ts` | Router, scoring, requirements, providers and routed-pipeline tests |

New (TypeScript, other):

- `src/services/extraction/RoutedExtractionService.ts`: the existing pipeline with routing and fallback.
- `src/features/ai/AIRoutingPanel.tsx`, `RouteDecisionCard.tsx`, `RouterSimulator.tsx`, `useAIRouting.ts` (settings hook), `routeLabels.ts`, `ai.css`.
- `tests/routing-harness.html`, `tests/routing-harness.tsx`, `tests/routing.spec.ts`: end-to-end routing and fallback.

Changed:

- `services/extraction/LocalAIExtractionService.ts`: now a thin wrapper, `RoutedExtractionService` with a fixed bundled-model route. The constructor is unchanged.
- `services/extraction/ExtractionService.ts`: optional `onRoute` progress callback, `route` diagnostics, `mode: 'routed'`.
- `services/extraction/prompts/build-prompt.ts`: shared `appendRepair` (identical Qwen output).
- `types/action.ts`: additive `settings.ai` (mode, priority, manual model, provider options) and `source.extractedBy`. Values from the removed cloud prototype (cloud modes, privacy/cost priorities, `'cloud'` provenance) fall back on read. No envelope version change.
- `app/services.ts`: composes registry, router and `RoutedExtractionService`.
- `features/inbox/Inbox.tsx`: route badge, route-aware stage text, "Why this AI?" details. The readiness gate covers OCR only; model readiness is the router's job.
- `features/settings/SettingsView.tsx`: new "TaskLens AI" section. `LocalAISettings.tsx` copy now describes the bundled runtime.
- `features/extraction/DetailsPanel.tsx`: shows which AI produced the draft.

New (Rust, `src-tauri/src/ai/`):

- `device.rs`: `ai_device_profile`, covering CPU, RAM, GPU and VRAM on Windows, Linux and macOS.
- `ollama.rs`: `ai_ollama_discover` and `ai_ollama_chat`, loopback port 11434 only, cancellable and bounded.
- `local_ai/http.rs`: the bearer key is now optional, so the same loopback client can reach Ollama.

## C. Data models

The authoritative definitions are in `src/services/ai/types.ts`, `device.ts`, `requirements.ts` and
`router.ts`. In short:

```ts
type AICapability = 'text-generation' | 'structured-extraction' | 'image-understanding' | 'ocr'
  | 'summarization' | 'classification' | 'translation' | 'multilingual'
  | 'voice-transcription' | 'reasoning' | 'long-context' | 'json-output';

interface AIModel {
  id: string; providerId: string; name: string;
  capabilities: AICapability[];
  footprint?: { parameterBillions?; quantization?; fileBytes?; contextLength? }; // detected facts
  requirements?: { minRamGB?; recommendedRamGB?; minVramGB?; recommendedVramGB?; requiresGPU? };
  estimatedPerformance?: { speedClass?: 'slow'|'moderate'|'fast'; qualityClass?: 'basic'|'good'|'excellent' };
  specSource: 'detected' | 'manifest' | 'declared' | 'example';
  accelerators: ('cpu'|'cuda'|'rocm'|'metal'|'vulkan'|'intel')[]; ready?: boolean;
}

interface AIProvider {
  id: string; name: string; kind: 'local' | 'mock'; runtime: string;
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  getModels(): Promise<AIModel[]>;
  generate(request: AIRequest): Promise<AIResponse>;
  prepare?(modelId: string, system: string, signal: AbortSignal): Promise<void>;
}

interface AIRequest { jobId; modelId; system; user; repair?; schema; maxOutputTokens; images?; signal }
interface AIResponse { content: string; truncated: boolean; elapsedMs: number }
```

When a model's size can be detected (GGUF file size, Ollama `parameter_size` and
`quantization_level`, context length), `footprint.ts` derives its RAM and VRAM needs from those
facts. Requirements entered by hand are used only when nothing can be detected.

## D. Routing algorithm

```
recommend(requirements, snapshot, policy, history):
  device   = assessDevice(snapshot.device)          # RAM/VRAM budget, accelerators, class
  weights  = adjustForTask(preset(policy.priority), requirements)   # normalised to 100
  for provider in snapshot.providers, model in provider.models:
     reasons = hardFilters(model)                   # any reason → excluded (kept for "Not used")
        provider unavailable · mock outside demos · missing required capability
        source longer than context window · model larger than 80 % of total RAM
        GPU required but no compatible accelerator
     if reasons: excluded += (model, reasons); continue
     s = { capability, device, quality, speed, reliability }   # each 0…1
     total = Σ weights[d] × s[d]
  rank real candidates by total (ties: smaller); mock only if nothing real remains
  selected = mode == manual and the chosen model is eligible ? it : best
  status = selected ? ready : no-candidate
  return { selected, alternatives (top 3 with trade-offs), excluded, reasons, privacy }
```

Default weights (heuristics, not benchmarks, normalised to 100): capability 30, device 20,
quality 20, speed 10, reliability 5. The Speed and Quality priorities shift these weights. Simple
jobs move weight from quality to speed. Complex or visual jobs move it the other way. Every candidate keeps its per-dimension breakdown for explanations and developer
diagnostics.

Two multipliers keep paper strength from beating reality:

- **Fit factor.** A local model that doesn't fit in free memory keeps 60% of its score, or 45%
  when it needs more than 1.4× the free memory. On an 8 GB laptop a small model that fits
  therefore beats a 7B vision model that doesn't. The model is not excluded, so a device whose
  only model is too big right now can still try it, with a caution.
- **Session factor.** Each failure this session removes 15% of a model's score, down to 55%. A
  provider that keeps failing stops being recommended.

Simple jobs also penalise large local models in device fit, so short text does not occupy a 14B
model even on a workstation. On GPU-capable runtimes, models over 6 GB count as moderate speed
rather than fast.

Execution (`RoutedExtractionService`):

```
preRoute(estimated requirements) → no candidate? fail fast · otherwise warm the winner during OCR
OCR / transcript → deriveRequirements → decide()
loop: generate → validate (one repair on the same provider)
  provider error → recordFailure → fallbackFor(decision, failed) → next best local model
     → the route notice names the failed model ("Why this AI?"), so a fallback is never silent
```

## E. Device detection

| Signal | Windows | Linux | macOS | Browser preview |
| --- | --- | --- | --- | --- |
| CPU vendor/model | CPUID | `/proc/cpuinfo` | `sysctl machdep.cpu.brand_string` | — |
| Cores / threads | threads (physical unknown) | `/proc/cpuinfo` | `hw.physicalcpu`, `hw.logicalcpu` | `hardwareConcurrency` |
| SIMD features | CPUID (AVX2 etc.) | CPUID | CPUID (x86) | — |
| Total / available RAM | `GlobalMemoryStatusEx` | `/proc/meminfo` | `hw.memsize`, `vm_stat` | `deviceMemory` (capped, coarse) |
| GPU name / VRAM | display-adapter registry keys; `nvidia-smi` for free VRAM | `/sys/class/drm`, amdgpu VRAM files, `nvidia-smi` | Apple Silicon = Metal, unified memory | — |
| Backend | CUDA (NVIDIA), ROCm (AMD on Linux), Vulkan/Intel | same | Metal | — |

The profile excludes serial numbers, MAC or IP addresses, host names, user names and storage
contents. Storage is not collected because TaskLens never downloads models at run time. Each
runtime declares the accelerators it can use. The bundled llama.cpp build is CPU-only, so a
detected GPU raises scores only for runtimes that can use it, such as Ollama.

## F. Provider abstraction

Each adapter owns its own discovery, request format, response parsing and error mapping.

- **LlamaCppProvider**: the bundled GGUF from `models.json`, served through the existing managed
  `llama-server` IPC. It applies the manifest's chat template and keeps prompt-prefix prewarming.
  Its readiness comes from the native local-intelligence status.
- **OllamaProvider**: discovers models, sizes, quantization, context length and capabilities
  (`vision`, `thinking`) from a local Ollama server on `127.0.0.1:11434`. Requests go through Rust,
  which reuses the loopback-only HTTP client.
- **MockProvider**: deterministic output for tests and demos, always labelled "Demo / Mock AI".
  Production routing never selects it.

To add a provider, implement `AIProvider` and register it in `app/services.ts`. No UI changes are
needed. Providers must run on this device: `ProviderKind` is `'local' | 'mock'`.

## G. UI

- **Settings → TaskLens AI**: device summary and details, the recommended AI for each input kind
  (screenshot, typed text, voice, long announcement) with "Why this model?", alternatives and
  excluded models. Also the AI mode (Automatic, the default, or Manual Selection), the priority,
  manual model choice, the provider list with live status, and a router simulator that uses
  example devices and local models.
- **Inbox**: the processing badge names the model ("On-device · Qwen3-4B"). Stage text follows the
  route, and "Why this AI?" expands the reasons, including any fallback.
- **Review**: DetailsPanel shows which AI produced the draft.

## H. Privacy and data flow

Source material never leaves the device. OCR, speech transcription and extraction all run
locally; a screenshot is given to a model only when that local model understands images.

TaskLens makes no remote network requests: the only sockets are Rust → its own llama-server and
Rust → Ollama, both on IPv4 loopback. Routing settings hold no secrets. Source text and images are
never logged; raw output appears only in developer mode, in memory.

## I. Tests

`src/services/ai/router.test.ts`, `requirements.test.ts`, `providers.test.ts` and
`src/services/extraction/routed-extraction.test.ts` cover: on-device routing, low-RAM and
high-RAM devices, GPU and no-GPU, image and text tasks, image hand-off to local vision models,
unavailable providers, provider failure and automatic local fallback (reported, never silent),
cancellation, the mock provider, malformed AI responses, manual mode, and the Ollama and
llama.cpp request formats. `tests/routing.spec.ts` runs the real router, pipeline and review UI
against local test providers through `tests/routing-harness.html`. Rust unit tests cover the
parsers in `ai/device.rs` and `ai/ollama.rs`. `cargo test prints_this_device -- --ignored
--nocapture` prints the profile detected on the current machine. The existing pipeline tests still
pass, unchanged, through the
`LocalAIExtractionService` wrapper.

## Known limitations

- Speed and quality classes are heuristics from size, quantization and accelerator fit. No model
  is benchmarked at run time.
- Voice and typed-text capture still wait for the bundled model to be ready before enabling, even
  when Ollama is available. Screenshots are gated only on OCR readiness.
- Ollama is reached only on `127.0.0.1:11434`. `OLLAMA_HOST` overrides are ignored by design.
- Physical core count is unavailable in the browser preview. VRAM on Apple Silicon is unified
  memory, so the RAM budget is used for it.

## Cloud and proprietary AI (removed)

Gemini and OpenAI-compatible adapters, with a Rust cloud connector, were prototyped on 2026-10-19
and removed the same day at the user's request, to keep TaskLens fully open source and on-device.
None of that code, and none of its crates, is part of this repository or its history. The
provider-agnostic cloud plumbing that remained (the `cloud` provider kind, the Ask Before Cloud
and Local Only modes, the upload consent dialog, the "share screenshots" setting, network gating,
privacy/cost scoring and the simulator's cloud example) was removed afterwards, also at the user's
request. Automatic mode now always means the best model on this device.
