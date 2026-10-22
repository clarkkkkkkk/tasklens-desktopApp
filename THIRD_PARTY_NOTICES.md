# Third-party notices

TaskLens source code is MIT licensed (see LICENSE). The components below are owned by their authors and distributed or used under their own licenses. TaskLens does not claim ownership of them, and no endorsement is implied. Model weights and OCR language data are not stored in Git; release preparation includes verified copies and their full license texts.

| Component | Use in TaskLens | Owner | License |
| --- | --- | --- | --- |
| Qwen3-4B (official GGUF Q4_K_M) | Bundled on-device extraction model | Qwen / Alibaba Cloud | Apache-2.0 |
| llama.cpp / ggml (`llama-server`) | Local model runtime, bundled binary | The ggml authors | MIT |
| whisper.cpp | Local voice transcription runtime | The ggml authors | MIT |
| Whisper Small (ggml) | Voice transcription model | OpenAI | MIT |
| Tesseract OCR 5 | Local text recognition | Tesseract contributors (originally HP, later Google) | Apache-2.0 |
| Tesseract trained data (`eng`, `ceb`, `tgl`) | OCR language models | Tesseract contributors / Google | Apache-2.0 |
| Solar Icons | Interface icons | 480 Design | CC BY 4.0 |
| Rust crates (`tauri`, `image`, `serde`, `sha2`, `uuid`, `rfd`, `cpal`, `hound`, `rubato`, `symphonia`, …) | Native layer | Their respective authors | MIT and/or Apache-2.0 (see each crate) |
| npm packages (`react`, `zod`, `@tauri-apps/api`, …) | Frontend | Their respective authors | MIT (see each package) |

## Qwen3-4B

Official weights: https://huggingface.co/Qwen/Qwen3-4B-GGUF at revision `bc640142c66e1fdd12af0bd68f40445458f3869b`, Apache-2.0. The full pinned upstream license is bundled as `resources/notices/Qwen3-LICENSE.txt`. TaskLens source remains MIT; this does not relicense model weights. Existing user-imported Phi weights are not redistributed by this release.

## llama.cpp and whisper.cpp

https://github.com/ggml-org/llama.cpp (release b11505) · https://github.com/ggml-org/whisper.cpp

```
MIT License

Copyright (c) 2023-2026 The ggml authors
```

The full MIT permission notice is reproduced at the end of this file and applies to both components.

## Tesseract OCR and trained data

https://github.com/tesseract-ocr/tesseract · https://github.com/tesseract-ocr/tessdata (commit ced78752)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. TaskLens runs Tesseract as an unmodified separate program and does not modify the trained data files.

## MIT permission notice

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

# Third-party icon attribution

TaskLens uses [Solar Icons](https://solar-icons.vercel.app/) by [480 Design](https://www.figma.com/community/file/1166831539721848736), licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The Bold Duotone artwork is displayed with application-specific sizes and inherited colors; its paths are unchanged. No endorsement is implied.

The @solar-icons/react package is MIT licensed. Its notice follows:

MIT License

Copyright (c) 2024 Hakim Saoudi

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

The Software may include icons that are licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). Commercial use is allowed, but attribution is required for the use of these icons. See LICENSE-THIRD-PARTY for more details.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Local processing components

whisper.cpp and llama.cpp are MIT licensed; their exact pinned source revisions and upstream model locations are recorded in `src-tauri/resources/models.json`. The runtime build copies each upstream LICENSE alongside its executable. Whisper model weights are MIT licensed; Qwen3-4B model weights are Apache-2.0 licensed and included in installed offline releases. No weights are distributed in this repository.

Native audio dependencies include CPAL (Apache-2.0), Symphonia (MPL-2.0), Rubato (MIT), and Hound (Apache-2.0). Preserve their upstream notices when distributing builds; Symphonia remains an unmodified Cargo dependency. Dependency license details are available in their pinned Cargo registry sources and Cargo.lock.

## Bundled OCR and complete release notices

Tesseract 5.5.1 and tessdata are Apache-2.0. Leptonica 1.85.0 uses its BSD-style two-clause license; its full upstream text is bundled. OCR source/dependency revisions and all distributed model/data license hashes are recorded in the manifest. `prepare:models` includes full model, inference runtime, Tesseract, tessdata and Leptonica license texts. `prepare:notices` additionally copies available Cargo/npm dependency license/copyright/notice files and runtime vendor license directories into `resources/notices/dependencies`, with a version/license inventory. Preserve this entire directory in every installer. Windows WebView2 retains Microsoft's redistribution terms and installer notices.

## AppImage packaging

The optional Linux AppImage includes AppImageKit AppRun and the type-2 runtime. Their MIT texts are prepared from pinned upstream revisions into the bundled notices directory; exact files and hashes are in `scripts/linux-packaging-tools.json`. The type-2 runtime reports upstream commit `8f39b89e2ac31e1640b3d3f7e9a5108e6ce805fa`. Build-tool binaries are size/SHA-256 pinned separately from application inference runtimes. The Fedora system license corpus accompanies bundled desktop libraries. Verify static launcher dependency notices and corresponding-source provenance for the final AppImage before public distribution; the RPM does not embed that launcher. TaskLens source licensing remains MIT.

## Native reliability dependencies (Milestone A)

Pinned direct dependencies: rusqlite 0.40.2 (MIT) with bundled SQLite (public domain), notify-rust 4.18.1 (MIT/Apache-2.0), chrono 0.4.45, chrono-tz 0.10.4 and iana-time-zone 0.1.65 (MIT/Apache-2.0), objc2 0.6.4 / objc2-foundation 0.3.2 / objc2-user-notifications 0.3.2 / block2 0.6.2 (MIT), and windows 0.62.2 (MIT/Apache-2.0). Tokio uses the version locked in Cargo.lock (MIT). Full upstream license texts are retained in `docs/third-party/native-reliability/` and mapped into packaged resources. These licenses do not change TaskLens's MIT licensing. Native platform acceptance remains separate from dependency inclusion.

## Native browser link opening

The Groq setup guide uses tauri-plugin-opener (Apache-2.0 OR MIT) and its locked native dependencies. `prepare:notices` includes their upstream license texts and version inventory in the existing bundled dependency-notices directory. Only fixed Groq setup/policy links are exposed through TaskLens's native command; generic opener JavaScript interception is disabled.
