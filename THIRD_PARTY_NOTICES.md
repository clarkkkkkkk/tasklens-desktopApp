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

whisper.cpp and llama.cpp are MIT licensed; their exact pinned source revisions and upstream model locations are recorded in `src-tauri/resources/models.json`. The runtime build copies each upstream LICENSE alongside its executable. Whisper model weights are MIT licensed; Qwen3-4B model weights are Apache-2.0 licensed and imported separately by the user. No weights are distributed in this repository.

Native audio dependencies include CPAL (Apache-2.0), Symphonia (MPL-2.0), Rubato (MIT), and Hound (Apache-2.0). Preserve their upstream notices when distributing builds; Symphonia remains an unmodified Cargo dependency. Dependency license details are available in their pinned Cargo registry sources and Cargo.lock.
