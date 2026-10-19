# Adaptive AI routing

TaskLens chooses where and how AI runs for each job. It weighs the input, the device, the network,
the models that are actually available and the user's privacy settings. It is no longer tied to one
model. The capture → extraction → validation → review → confirmation → repository → calendar
workflow is unchanged. Only the model call in the middle is now routed.

Status: the router, local providers (bundled llama.cpp, Ollama), device and network detection,
privacy policy, consent and fallback are implemented and tested. TaskLens ships **no cloud
providers**. The Gemini and OpenAI-compatible adapters and their cloud connector were removed on
2026-10-19, so every model TaskLens can use is open source and runs on this device. The router
keeps provider-agnostic cloud support (privacy modes, consent, the cloud margin), so a cloud
adapter could be added later behind the same `AIProvider` interface. Until one exists, the
settings show only Local Only and Manual Selection.

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
     │  NetworkMonitor ──► online / offline                          │
     │  ProviderRegistry ─► discover providers + models (parallel)   │
     │  Policy (AI mode, priority) ─► cloud permission               │
     │                                                               │
     │  hard filters ─► weighted scoring ─► cloud margin ─► decision │
     │  explain() ─► reasons, privacy, alternatives, exclusions      │
     └─────────────────────────────┬─────────────────────────────────┘
                                   ▼
                 RouteDecision (ready | needs-consent | no-candidate)
                                   │
                ConsentBroker ◄────┤ (Ask Before Cloud, any fallback)
                 (CloudConsentPrompt in the UI)
                                   ▼
                  AIRequest ─► selected AIProvider.generate()
                                   │
          ┌──────────────┬─────────┴─────────┬──────────────────┬──────────────┐
          ▼              ▼                   ▼                  ▼              ▼
   LlamaCppProvider  OllamaProvider   (future cloud     (future cloud      MockProvider
   (bundled, IPC)    (loopback IPC)    adapter: none     adapter: none      (demo/tests)
                                        shipped)          shipped)
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
| `network.ts` | `NetworkMonitor` (OS online state, no probes) |
| `requirements.ts` | `deriveRequirements`: what this job needs and prefers |
| `footprint.ts` | Generic size, quantization and memory estimates, parsed from detected facts |
| `scoring.ts` | Weights, priority presets, task adjustments, hard filters, dimension scores |
| `explain.ts` | Reasons, privacy statement and trade-offs as plain language |
| `policy.ts` | AI mode → cloud permission; what leaves the device (`dataFlow`) |
| `router.ts` | `recommend()` (pure) and `AIRouter` (snapshot, decide, fallback, failure history) |
| `registry.ts` | `ProviderRegistry`: registration and bounded parallel discovery |
| `consent.ts` | `ConsentBroker`: cloud consent and fallback offers. Declines by default |
| `catalog.ts` | Example devices and models for the router simulator (labelled as examples) |
| `providers/*.ts` | `MockProvider`, `LlamaCppProvider`, `OllamaProvider` |
| `testing.ts` | Device, model and snapshot builders for tests |
| `*.test.ts` | Router, scoring, requirements, providers and routed-pipeline tests |

New (TypeScript, other):

- `src/services/extraction/RoutedExtractionService.ts`: the existing pipeline with routing, consent and fallback.
- `src/features/ai/AIRoutingPanel.tsx`, `cloudAvailability.ts`, `RouteDecisionCard.tsx`, `CloudConsentPrompt.tsx`, `RouterSimulator.tsx`, `useAIRouting.ts` (settings hook), `routeLabels.ts`, `ai.css`.
- `tests/routing-harness.html`, `tests/routing-harness.tsx`, `tests/routing.spec.ts`: end-to-end consent and fallback.

Changed:

- `services/extraction/LocalAIExtractionService.ts`: now a thin wrapper, `RoutedExtractionService` with a fixed bundled-model route. The constructor is unchanged.
- `services/extraction/ExtractionService.ts`: optional `onRoute` progress callback, `route` diagnostics, `mode: 'routed'`.
- `services/extraction/prompts/build-prompt.ts`: shared `appendRepair` (identical Qwen output).
- `types/action.ts`: additive `settings.ai` (mode, priority, manual model, provider options). Additive `source.extractionMode: 'cloud'` and `source.extractedBy`. No envelope version change.
- `app/services.ts`: composes registry, router, consent and `RoutedExtractionService`.
- `features/inbox/Inbox.tsx`: route badge, route-aware stage text, "Why this AI?" details. The readiness gate covers OCR only; model readiness is the router's job.
- `features/settings/SettingsView.tsx`: new "TaskLens AI" section. `LocalAISettings.tsx` copy now describes the bundled runtime.
- `features/extraction/DetailsPanel.tsx`: shows which AI produced the draft.
- `App.tsx`: mounts `CloudConsentPrompt`.

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
  privacy: 'local' | 'cloud'; supportsOffline: boolean; cost?: 'free'|'low'|'paid';
  specSource: 'detected' | 'manifest' | 'declared' | 'example';
  accelerators: ('cpu'|'cuda'|'rocm'|'metal'|'vulkan'|'intel')[]; ready?: boolean;
}

interface AIProvider {
  id: string; name: string; kind: 'local' | 'cloud' | 'mock'; runtime: string;
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
  permit   = cloudPermission(policy.mode)          # excluded | ask | allowed
  for provider in snapshot.providers, model in provider.models:
     reasons = hardFilters(model)                   # any reason → excluded (kept for "Not used")
        provider unavailable · mock outside demos · offline and cloud
        Local Only and cloud · missing required capability
        source longer than context window · model larger than 80 % of total RAM
        GPU required but no compatible accelerator
     if reasons: excluded += (model, reasons); continue
     s = { capability, device, quality, speed, privacy, cost, reliability }   # each 0…1
     total = Σ weights[d] × s[d]
  rank real candidates by total (ties: local, then smaller); mock only if nothing real remains
  if mode == manual and the chosen model is eligible: selected = it
  else:
     selected = best
     if selected is cloud and bestLocal exists and selected.total − bestLocal.total < CLOUD_MARGIN (8):
        selected = bestLocal          # data stays local when cloud is only marginally better
  status = none → no-candidate | cloud and permit == ask → needs-consent | ready
  return { selected, alternatives (top 3 with trade-offs), excluded, reasons, privacy, dataFlow }
```

Default weights (heuristics, not benchmarks): capability 30, device 20, quality 20, speed 10,
privacy 10, cost 5, reliability 5. The Privacy, Speed, Quality and Cost priorities shift these
weights. Simple jobs move weight from quality to speed and cost. Complex or visual jobs move it the
other way. Every candidate keeps its per-dimension breakdown for explanations and developer
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
preRoute(estimated requirements) → no candidate? fail fast · local winner? warm it during OCR
OCR / transcript → deriveRequirements → decide()
needs-consent → ConsentBroker: approve | use local alternative | cancel   (no answer = decline)
loop: generate → validate (one repair on the same provider)
  provider error → recordFailure → fallbackFor(decision, failed)
     → ConsentBroker offers the alternative (always asked, never silent) → continue or stop
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

Network: the OS online/offline state (`navigator.onLine` and its events). TaskLens does not probe
any server to decide this. The flag only gates cloud candidates; a failed request still triggers
the normal fallback.

## F. Provider abstraction

Each adapter owns its own discovery, request format, response parsing and error mapping.

- **LlamaCppProvider**: the bundled GGUF from `models.json`, served through the existing managed
  `llama-server` IPC. It applies the manifest's chat template and keeps prompt-prefix prewarming.
  Its readiness comes from the native local-intelligence status.
- **OllamaProvider**: discovers models, sizes, quantization, context length and capabilities
  (`vision`, `thinking`) from a local Ollama server on `127.0.0.1:11434`. Requests go through Rust,
  which reuses the loopback-only HTTP client.
- **Cloud adapters**: none ship. The router, policy, consent dialog and fallback still treat
  `kind: 'cloud'` generically, and tests exercise them with test providers. Gemini and
  OpenAI-compatible adapters existed briefly and were removed at the user's request.
- **MockProvider**: deterministic output for tests and demos, always labelled "Demo / Mock AI".
  Production routing never selects it.

To add a provider, implement `AIProvider` and register it in `app/services.ts`. No UI changes are
needed.

## G. UI

- **Settings → TaskLens AI**: device summary and details, network state, the recommended AI for
  each input kind (screenshot, typed text, voice, long announcement) with "Why this model?",
  privacy, alternatives and excluded models. Also the AI mode, the priority, manual model choice,
  the provider list with live status, and a router simulator that uses example devices and models
  (its cloud model is a labelled example). The AI mode offers Automatic and Ask Before Cloud only
  when a cloud provider is registered. None is today, so it shows Local Only and Manual Selection,
  and the Inbox and sidebar describe the effective mode.
- **Inbox**: the processing badge names where the job runs ("On-device · Qwen3-4B" or
  "Cloud · <model>" for a cloud adapter). Stage text follows the route, and "Why this AI?" expands the reasons.
- **Consent dialog** (App level, shared by screenshots, voice and text): the destination, what
  will be sent, why it was recommended, and the local alternative.
- **Review**: DetailsPanel shows which AI produced the draft.

## H. Privacy and data flow

Source material leaves the device only when all of the following hold:

1. The AI mode is not Local Only. Local Only is the default.
2. A cloud provider is configured, its connector is available and the device is online.
3. One of these applies: Automatic mode and the router chose the cloud model; Ask Before Cloud and
   the user approved this specific request; or Manual mode and the user chose that cloud model.
4. A fallback to a different provider is always offered. It never happens silently.

What can leave: the OCR text or transcript, the source metadata the local model would also see
(current time, timezone, capture time), and the screenshot image. The image is sent only when the
model understands images and "Share screenshots with cloud vision models" is on. OCR and speech
transcription always run locally. The consent dialog lists exactly these items. In Local Only mode
no cloud endpoint is contacted, not even for model discovery.

With no cloud provider shipped, TaskLens makes no remote network requests: the only sockets are
Rust → its own llama-server and Rust → Ollama, both on IPv4 loopback. Routing settings hold no
secrets. Source text and images are never logged; raw output appears only in developer mode, in
memory.

## I. Tests

`src/services/ai/router.test.ts`, `requirements.test.ts`, `providers.test.ts` and
`src/services/extraction/routed-extraction.test.ts` cover: offline routing, online
routing, Local Only, cloud confirmation, low-RAM and high-RAM devices, GPU and no-GPU, image and
text tasks, unavailable providers, provider failure, fallback (offered, never silent;
cloud-to-cloud asks again), the mock provider, malformed AI responses, the cloud margin, manual
mode, and the Ollama and llama.cpp request formats. `tests/routing.spec.ts` runs the real
router, consent dialog, pipeline and review UI against test providers through
`tests/routing-harness.html`, using a generic test-only cloud provider. Rust unit tests cover the
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

## Cloud providers (removed)

Gemini and OpenAI-compatible adapters, with a Rust cloud connector, were prototyped on 2026-10-19
and removed the same day at the user's request, to keep TaskLens fully open source and on-device.
None of that code, and none of its crates, is part of this repository or its history.
