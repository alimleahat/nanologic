# Third-party licences

Everything that ships inside the NanoLogic installer, and its licence. Update this file whenever a runtime dependency is added.

## Bundled toolchain (runs inside the app)

| Component | Version | Licence | Closed-source bundling | Notes |
|---|---|---|---|---|
| Yosys (via YoWASP, npm `@yowasp/yosys`) | 0.70 (0.70.1258) | ISC | Allowed; keep copyright notice | Includes ABC (UC Berkeley, BSD-style licence) inside the WebAssembly. Source: https://github.com/YoWASP/yosys |
| Icarus Verilog (npm `@veriflow/iverilog-wasm`) | 0.1.4, source revision `75c777c993c2bbc6ffe7f9138f25a76e14db5325` of https://github.com/AlexMercer12138/iverilog | **GPL-2.0-or-later** | Allowed as a separate program (aggregation) if the GPL text is shipped and the source is offered. **To be confirmed by Ali / university IP office.** | Licence text: `node_modules/@veriflow/iverilog-wasm/LICENSE`; corresponding source: `dist/SOURCE.md` in the package |

## App framework (bundled into the app)

| Component | Licence |
|---|---|
| Electron | MIT (Chromium and Node.js components under their own permissive licences, listed in `LICENSES.chromium.html` inside the app) |
| React, React DOM | MIT |
| Monaco Editor | MIT |
| @monaco-editor/react | MIT |
| react-resizable-panels | MIT |
| Inter font (@fontsource/inter) | SIL Open Font License 1.1 |
| JetBrains Mono font (@fontsource/jetbrains-mono) | SIL Open Font License 1.1 |

## Build and test tools only (not shipped)

Vite, esbuild, TypeScript, Vitest, Playwright, electron-builder: all MIT or Apache-2.0.

## Board data

`boards/de10-lite.json` contains pin numbers and I/O standards transcribed from the Terasic DE10-Lite User Manual (June 5, 2020). These are facts about the hardware; no Terasic or Intel artwork, text or logos are included.
