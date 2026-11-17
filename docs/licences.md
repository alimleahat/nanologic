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

## RTL Viewer layout (bundled into the app)

| Component | Version | Licence | Closed-source bundling | Notes |
|---|---|---|---|---|
| elkjs (Eclipse Layout Kernel for JavaScript, npm `elkjs`) | 0.11.1 | **EPL-2.0** (offered as "EPL-2.0 OR GPL-3.0-or-later"; NanoLogic uses it under EPL-2.0) | Allowed: EPL-2.0 is file-level ("weak") copyleft. NanoLogic's own code only calls elkjs and is not a modification of it, so it stays closed. Conditions: ship the licence text, say where the elkjs source is, and publish the source of any change we make to elkjs itself (we use it unmodified). **To be confirmed by Ali / university IP office**, like the Icarus Verilog entry. | Positions the RTL Viewer's symbols and routes its wires; runs in a web worker (`elk-worker.min.js`). Licence text shipped as `resources/licences/elkjs-EPL-2.0.md`. Source: https://github.com/kieler/elkjs (tag `0.11.1`) and https://github.com/eclipse/elk |

The RTL Viewer's symbols and drawing are NanoLogic's own code. The netlist comes from the bundled Yosys (above).

### Evaluated and not used: netlistsvg

netlistsvg 1.0.2 (npm `netlistsvg`, https://github.com/nturley/netlistsvg) is **MIT**, so its licence would have been fine. It was not used because:

- it is unmaintained (last release May 2022) and pins elkjs 0.3.0 (2018), json5 0.5, yargs 6 and fs-extra 1, which would pull old, partly vulnerable packages into the app;
- it draws one module to a static SVG string: no click-to-highlight, no double-click into a module or to the source line, no zoom or pan, and styling only through its own "skin" SVG rather than the app's theme tokens;
- the part NanoLogic needs (ELK layered layout with fixed pin positions) is a few dozen lines on top of current elkjs.

NanoLogic therefore uses elkjs directly (the same layout engine netlistsvg uses) with its own React symbols. The comparison was made on the traffic-light reference project.

## Build and test tools only (not shipped)

Vite, esbuild, TypeScript, Vitest, Playwright, electron-builder: all MIT or Apache-2.0. (Unit tests also use elkjs's single-file build, `elk.bundled.js`, from the same package.)

## Board data

`boards/de10-lite.json` contains pin numbers and I/O standards transcribed from the Terasic DE10-Lite User Manual (June 5, 2020). These are facts about the hardware; no Terasic or Intel artwork, text or logos are included.

`boards/basys3.json` contains pin numbers, I/O standards and configuration properties taken from Digilent's `Basys-3-Master.xdc` (https://github.com/Digilent/digilent-xdc, commit `c8644a9fe31cc803789643124545d56b3bef4600`). That repository is under the **MIT licence** (Copyright (c) 2017 Digilent), which allows use in a closed-source app as long as the copyright and licence notice are kept. An unmodified copy of the file and its `License.txt` are in `tests/fixtures/digilent-xdc/` (used by the pin test). The generated `.xdc` files are derived from it and say so in their header. No Digilent or AMD/Xilinx artwork or logos are included.

| Component | Version | Licence | Closed-source bundling | Notes |
|---|---|---|---|---|
| Digilent master XDC (Basys 3 pin data) | commit `c8644a9` | MIT | Allowed; keep the notice | Notice text: `tests/fixtures/digilent-xdc/License.txt`, shipped in the installer as `resources/licences/digilent-xdc-MIT.txt`. |
