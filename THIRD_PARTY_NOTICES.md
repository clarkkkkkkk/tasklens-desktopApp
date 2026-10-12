# Third-party notices

TaskLens source code is MIT licensed (see LICENSE). The components below are owned by their authors and distributed or used under their own licenses. TaskLens does not claim ownership of them, and no endorsement is implied. Model weights and OCR language data are not stored in this repository; users install them locally.

| Component | Use in TaskLens | Owner | License |
| --- | --- | --- | --- |
| Phi-4-mini-instruct (GGUF Q4_K_M conversion by Unsloth) | On-device extraction model | Microsoft Corporation | MIT |
| llama.cpp / ggml (`llama-server`) | Local model runtime, bundled binary | The ggml authors | MIT |
| whisper.cpp | Local voice transcription runtime | The ggml authors | MIT |
| Whisper Small (ggml) | Voice transcription model | OpenAI | MIT |
| Tesseract OCR 5 | Local text recognition | Tesseract contributors (originally HP, later Google) | Apache-2.0 |
| Tesseract trained data (`eng`, `ceb`, `tgl`) | OCR language models | Tesseract contributors / Google | Apache-2.0 |
| Solar Icons | Interface icons | 480 Design | CC BY 4.0 |
| Rust crates (`tauri`, `image`, `serde`, `sha2`, `uuid`, `rfd`, `cpal`, `hound`, `rubato`, `symphonia`, …) | Native layer | Their respective authors | MIT and/or Apache-2.0 (see each crate) |
| npm packages (`react`, `zod`, `@tauri-apps/api`, …) | Frontend | Their respective authors | MIT (see each package) |

## Phi-4-mini-instruct

Model: https://huggingface.co/microsoft/Phi-4-mini-instruct · GGUF used: https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF (revision 78eb92a). Use of the model is also subject to Microsoft’s model card and responsible-AI guidance.

```
Microsoft.
Copyright (c) Microsoft Corporation.

MIT License
```

The full MIT permission notice is reproduced at the end of this file and applies to this component.

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
