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
