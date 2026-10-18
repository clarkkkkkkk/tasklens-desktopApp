# Local AI performance optimization (2026-10-18)

Host: Intel Core i5-8265U (4 cores / 8 threads, AVX2, no usable GPU offload: Intel UHD 620),
7.4 GiB RAM with ~2 GiB free during runs (browser/editor open), Fedora 44. Runtime: pinned
llama.cpp b11505 AVX2 sidecar, CPU only, `--parallel 1`, `--ctx-size 8192`, greedy decoding
(temperature 0, top_k 1), JSON-schema grammar, prompt lookup disabled. The native compile was
paused (SIGSTOP) during every measurement. Raw reports: `perf-*.json|md`, `full-1.7b-v7.*`.

## Before / after (Qwen3-4B Q4_K_M, three targeted fixtures)

| Metric | Before (prompt v6) | After (prompt v7 + prefix cache) |
| --- | --- | --- |
| Model | Qwen3-4B Q4_K_M | Qwen3-4B Q4_K_M (unchanged) |
| OCR (Tesseract CLI, eng+ceb+tgl) | 1.4–1.7 s | 1.4–1.7 s (unchanged) |
| Model load (process start → healthy) | 15.1 s | 16.6–18.2 s (same work; noise) |
| Fixed prompt prefix (1,538 tokens) | re-evaluated after every start: 97–132 s | evaluated once, saved to disk (227 MB); restore **0.29 s** |
| Prompt tokens evaluated, pictorial | 1,739 (cold) | 198 (prefix restored) |
| Output tokens, pictorial / midterm / bundle | 230 / 235 / 205 | **160 / 221 / 120** |
| Prompt eval speed | 13–16 tok/s | 11–16 tok/s |
| Generation speed (≈1.8k-token context) | 3.0–3.2 tok/s | 3.0–3.2 tok/s |
| Pictorial, first extraction after app start | 204.6 s (+15 s load) | **68.7 s** (+16.6 s load, +0.3 s restore) |
| Midterm, warm | 90.5 s | 90.2 s |
| Bundle (multi-action), warm | 72.3 s | **44.8 s** |
| Peak RSS (llama-server) | 3,830 MiB | 3,822 MiB |
| Fixture accuracy | 28/31 (bundle merged) | 28/31 (bundle merged) |

The first-ever extraction after install still pays the one-time prefix evaluation (~100 s on
this host) and then writes the cache file; later starts restore it.

## Throughput sweeps (fixed synthetic prompt, no user data)

| Config | Load | Prompt tok/s | Gen tok/s | Peak RSS |
| --- | --- | --- | --- | --- |
| 4B, default threads (4) | 15.6 s | **16.6** | **5.13** | 3,817 MiB |
| 4B, `--threads 4 --threads-batch 8` | 16.0 s | 12.7 | 4.67 | 4,132 MiB |
| 4B, `--threads 3` | 11.1 s | 13.8 | 4.76 | 3,713 MiB |
| 1.7B Q4_K_M, default | 3.7 s | **50.8** | **12.5** | 2,251 MiB |
| 1.7B Q4_K_M, `--threads-batch 8` | 3.5 s | 37.1 | 10.7 | 2,253 MiB |
| 1.7B Q8_0 (official), default | 3.5 s | 28.0 | 7.5 | 2,302 MiB |

At a ~2k-token context (the real extraction size), 1.7B generation drops from 12.5 to 6.9
tok/s with or without the JSON grammar, so context length rather than grammar sampling is the
cost. `--flash-attn on` was slower (6.5 tok/s). `--cache-type-k q8_0` gave +12% generation but
−36% prompt speed; not adopted (small net gain, changes numerics). Defaults (llama.cpp picks 4
threads) were fastest; no thread flags are passed.

## Qwen3-1.7B comparison (not adopted)

Candidate: `unsloth/Qwen3-1.7B-GGUF` @ `d7f544eead698dbd1f15126ef60b45a1e1933222`,
`Qwen3-1.7B-Q4_K_M.gguf`, 1,107,409,472 bytes, SHA-256
`b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897`, Apache-2.0. The official
`Qwen/Qwen3-1.7B-GGUF` (@ `90862c4b…`) ships only Q8_0 (slower here).

| Fixture (v7) | 4B | 1.7B |
| --- | --- | --- |
| pictorial | 15/15, 68 s | 15/15 cold (74 s) but **14/15 (duplicate action) when the prefix is pre-warmed** |
| midterm | 11/11, 90 s | 11/11, 43–45 s |
| bundle-english | 2/5 | 2/5 |
| Full 10-case suite | not re-run (v6: 64/77 on i5-10210U) | 51/67 (run with the since-removed follow-up active) |

1.7B is 1.5–2× faster warm and needs ~1.1 GiB less RAM, but its greedy output flips on tiny
numeric differences (pre-warmed vs single-pass prefill) and it regressed on cebuano-mixed and
mixed-moved-to. Per the acceptance rule (no faster model that merges/duplicates actions), the
bundled model stays Qwen3-4B. Swapping requires only `models.json` (rollback = revert it).

## Prompt experiments (1.7B, greedy)

- v7 compact (adopted): absent date/time/end_time/arrival_time/location generated as `null`
  and expanded before validation. Same accuracy, 12–45% fewer output tokens.
- Two-item example: models copied the item count (2 items everywhere). Rejected.
- `(message timestamp)` unit labels: broke pictorial (which has no timestamp). Rejected.
- Follow-up attempt for requirements that state their own time: did not separate the bundle
  case, worsened cebuano-mixed, cost ~27 s. Removed.

## Known limitations

- Warm 4B extraction is 45–90 s on this CPU, above the 20–30 s target; generation at ~3 tok/s
  is the floor without a smaller model or shorter prompt context.
- Both models merge the bundle-english case (chat title + timestamp treated as the event).
- The safety notice appears after 60 s; there is no manual-create-from-OCR flow yet.
