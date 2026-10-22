# Local AI evaluation report

- Prompt version: 9
- Model: Qwen3-4B-Q4_K_M.gguf (llama.cpp, CPU)
- Sampling: {"temperature":0,"top_k":1,"top_p":1,"seed":7}
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 6.6s; prewarm: 0.6; peak RSS: 5319 MiB
- Prompt lookup: disabled
- Run: 2026-10-22T00:43:31.468Z on Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz
- Checks passed: 0/1 across 1 cases
- Suite coverage: 1/1 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| graduation-cebuano | cebuano | 0/1 | 176.2 | 2 |

## graduation-cebuano

- ❌ valid output — The explicit clock time in [r6] was omitted. A missing date does not make a directly stated clock time unknown; keep the time and ask for the date.

Validator corrections:
- item 1: date expression “ugma” is not in the source; ignored
- item 2: date expression “bukas” is not in the source; ignored
