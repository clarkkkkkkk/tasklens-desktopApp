# Local AI evaluation report

- Prompt version: 10
- Model: Qwen3-4B-Q4_K_M.gguf (llama.cpp, CPU)
- Sampling: {"temperature":0,"top_k":1,"top_p":1,"seed":7}
- Runtime: tasklens-llama-server-avx2-x86_64-unknown-linux-gnu
- Server load: 4.1s; prewarm: 84.9; peak RSS: 5377 MiB
- Prompt lookup: disabled
- Run: 2026-10-22T00:50:39.331Z on Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz
- Checks passed: 17/17 across 1 cases
- Suite coverage: 1/1 requested cases

A small fixture suite is a regression signal, not a measure of production accuracy.

| Case | Languages | Checks | Seconds | Attempts |
| --- | --- | --- | --- | --- |
| graduation-cebuano | cebuano | 17/17 | 215.3 | 2 |

## graduation-cebuano

- ✅ action count — 2 (expected 2)
- ✅ holy mass|misa: found — Holy Mass
- ✅ holy mass|misa: type — "event" (expected "event")
- ✅ holy mass|misa: date — empty (expected empty)
- ✅ holy mass|misa: time — "10:00" (expected "10:00")
- ✅ holy mass|misa: end time — "11:00" (expected "11:00")
- ✅ holy mass|misa: location — "San Narciso Parish"
- ✅ holy mass|misa: requirement uniform — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ holy mass|misa: requirement trousers|slacks — ["OJT/Pinning uniform","black trousers or slacks"]
- ✅ lunch|paniudto|tanghalian: found — Lunch
- ✅ lunch|paniudto|tanghalian: type — "event" (expected "event")
- ✅ lunch|paniudto|tanghalian: date — empty (expected empty)
- ✅ lunch|paniudto|tanghalian: time — "12:00" (expected "12:00")
- ✅ lunch|paniudto|tanghalian: location — "RTC Gym"
- ✅ ambiguity on date — ["date: Which date does this activity refer to?","date: Which date does this activity refer to?"]
- ✅ no invented date
- ✅ no lost source evidence
