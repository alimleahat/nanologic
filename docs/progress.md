# Progress

Last updated: 30 Oct 2026 (end of the first overnight session).

## Summary for Ali

All seven milestones (M0 to M6) are implemented. Everything in the demo (spec section 1) works in the app, end to end, and is covered by automated tests that click through the real app window. The only steps that cannot be done from the cloud are the ones that need you: opening the export in Quartus 17.1 on a lab PC, running it on a real DE10-Lite, and looking at the app on your Mac.

- Pull request (keep it open, do not merge): https://github.com/alimleahat/nanologic/pull/1 (`dev` → `main`). The macOS and Windows CI jobs run on it.
- Screenshots of every screen: on any CI run's page, under **Artifacts**, download `screenshots-linux` (also `screenshots-macos-latest` and `screenshots-windows-latest` from the PR runs).
- Installers: open the CI run for the commit "Build installers [installers]" on GitHub (Actions tab) and download `installer-macOS` (two `.dmg` files: `arm64` for Apple Silicon, `x64` for Intel) and `installer-Windows` (`.exe`) from Artifacts (kept for 7 days). To make fresh ones: **Actions > CI > Run workflow** on `dev`, or push a commit whose message contains `[installers]`.

## Run the app on your Mac

You need Node.js 22 (https://nodejs.org, the "22 LTS" installer) and Git (macOS offers to install it the first time you type `git`).

1. Open Terminal and get the code (the `dev` branch has all the work):

   ```bash
   git clone -b dev https://github.com/alimleahat/nanologic.git
   ```

2. Go into the folder:

   ```bash
   cd nanologic
   ```

3. Install everything (a few minutes the first time, about 400 MB):

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. In the window that opens, try the demo:
   - **Home > Examples > Starter: counter and switches.** Analysis runs by itself. Click **Run Board** (this builds the design and opens the board). Click the switches, choose **1 Hz** or **10 Hz** and press **Run**: HEX0 counts. Hold KEY0 to reset it.
   - **Home > Examples > Reference: traffic light controller.** This is your coursework, copied into `Documents/NanoLogic/Examples`. Try **Simulate** (pick `tb/legacy/CoreLogic_tb.v`), then **Run Board** with 1 Hz or 10 Hz and **Run**: the lamps on LEDR0-2 and the countdown on HEX1/HEX0 cycle; hold KEY0 for a pedestrian request (LEDR9), hold KEY1 to reset.
   - **File > New Project Wizard** for a fresh DE10-Lite project, **File > Import Existing Folder** for any folder of `.v` files.
   - **Export to Quartus** writes a `<name>_quartus` folder.

To run the tests on your Mac: `npm test` (unit) and `npm run test:e2e` (opens the app and clicks through it). To build the Mac installer yourself: `npm run dist:mac` (files appear in `release/`).

**Unsigned app warning:** the installers are not signed yet. Right-click the app in Applications and choose **Open** the first time. If macOS says it "is damaged", run `xattr -cr /Applications/NanoLogic.app` once.

## Milestones

| Milestone | State | CI (Linux, macOS, Windows) |
|---|---|---|
| M0 Toolchain spike | Done. See `docs/toolchain-decision.md` | Passed on all three |
| M1 App shell and projects | Done | Passed on all three (unit + end-to-end) |
| M2 Editor and analysis | Done | Passed on all three |
| M3 Simulation and waveforms | Done | Passed on all three |
| M4 Virtual DE10-Lite | Done | Passed on all three |
| M5 Pins and export | Done, except the manual Quartus/hardware check, which is yours | Passed on all three |
| M6 Packaging | Done: unsigned `.dmg` (Apple Silicon + Intel) and `.exe` built in CI, and the packaged app smoke-tested on each OS | Passed on all three |

## What works

**Toolchain (M0).** Yosys and Icarus Verilog both run inside the app as WebAssembly; nothing else to install, same on Mac (Apple Silicon and Intel) and Windows. All 14 reference modules analyse with no errors; all 14 reference testbenches run to completion in about 0.2 s each and produce waveforms (no hang on `$stop`). The virtual board runs the reference design with your manual pin mapping.

**App shell and projects (M1).** Quartus-style layout: menu bar (File, Edit, View, Project, Assignments, Processing, Tools, Window, Help; unimplemented items hidden), toolbar, Project Navigator (Hierarchy | Files), Tasks with status (not run / running / passed / failed, double-click to run), tabbed document area, Messages, status bar, Templates panel on the right (collapsed by default, reserved for the assistant). Panels are resizable and collapsible. New Project Wizard, Open, Import Existing Folder (detects testbenches and the top level; never modifies your files, only adds the `.nlproj`), recent projects, close. All colours, fonts and sizes are design tokens in `app/renderer/theme.ts`. Fonts (Inter, JetBrains Mono) are bundled, so it works offline.

**Editor and analysis (M2).** Monaco with Verilog highlighting, tabs, unsaved dot, Cmd+S / Ctrl+S, Find, comment toggle, templates (always block, case, counter, FSM skeleton, 7-segment decoder) inserted at the cursor. Analysis: syntax and elaboration errors from Icarus, synthesis checks from Yosys (e.g. inferred latches), and NanoLogic's own synthesisability warnings (`#` delays, `initial`, `$display`/`$stop`/`$finish`, `forever`, `wait`, ...). Every message has file and line, click jumps to the line, red/amber squiggles in the editor. Messages can be filtered (All/Errors/Warnings/Info) and searched. Top-level ports are listed after analysis.

**Simulation and waveforms (M3).** Pick a testbench and a maximum time; `$display` output goes to Messages; the waveform opens in a tab. Signal tree from the VCD hierarchy, add (double-click), remove, reorder (drag or Up/Down), zoom in/out/fit, pan (drag or Shift+wheel), Ctrl/Cmd+wheel zoom, cursor with time and every value, per-signal radix (binary, hex, unsigned, signed). A 50 MB VCD parses in about 1.2 s (off the UI thread), and drawing collapses dense regions so it stays fast.

**Virtual DE10-Lite (M4).** Six 7-segment displays (HEX5 ... HEX0, HEX0 rightmost, decimal points drawn), ten LEDs above ten switches, KEY1/KEY0 on the right edge. Polarities follow the manual: switches up = 1, keys read 0 while held, LEDs lit at 1, segments lit at 0. Clock speed 1 Hz / 10 Hz / 1 kHz / Max, Run/Pause, Step, Reset, live cycle count and real speed, and the slow-down factor against 50 MHz. Connections table and unmapped-port warnings (unmapped inputs can be tied to 0 or 1). **Divider bypass works**: pick an internal signal and drive it with the board clock (e.g. `clkdiv.CLK_1Hz`) or hold it at 1 (e.g. a clock enable `tick`). The reference project ships with `clkdiv.CLK_1Hz` bypassed, so it runs at a true 1 Hz.

**Pins and export (M5).** Pin Planner table (port, direction, width, board signal, pin, I/O standard, polarity). Auto-map for standard names, manual mapping per bit or a whole bus at once (e.g. a 7-bit `seg_tens` to `HEX1[6:0]`). Validation: direction mismatch, two ports on one pin, out-of-range bits, partially mapped buses, width notes, active-low hints. Mapping is saved in the project file and used by the board and the export. Export levels 1, 2 and 3; level 3 writes `.qpf`, `.qsf` (FAMILY "MAX 10", DEVICE 10M50DAF484C7G, TOP_LEVEL_ENTITY, VERILOG_FILE lines, location + IO_STANDARD for mapped ports only), `.sdc` (`create_clock -period 20.000` on the 50 MHz port) and `src/*.v`, never testbenches. All values come from `boards/de10-lite.json`; a unit test checks every pin in that file against the spec's tables. **`examples/traffic-light-export/` is ready for you to open in Quartus.**

**Packaging (M6).** electron-builder makes unsigned `.dmg` files (Apple Silicon and Intel) and a Windows `.exe` installer. CI also starts the packaged app and checks that analysis, simulation and the board work from the installed files. The Welcome screen opens the starter example and the reference project.

## What does not work yet / limitations

1. **Not checked in Quartus or on hardware** (needs you): open `examples/traffic-light-export/traffic_light.qpf` in Quartus Prime Lite 17.1, compile, program the board. Things to look at:
   - The I/O standard strings. I used `3.3-V LVTTL` and `3.3 V SCHMITT TRIGGER` (from the manual, without the stray quote). I could not find an openly licensed Terasic System Builder `.qsf` to confirm the exact spelling. If Quartus rejects either, tell me the exact string it wants and I change one line in `boards/de10-lite.json`.
   - The reference design drives its logic from a divided clock (`CLK_1Hz`, a ripple clock). The `.sdc` only constrains the 50 MHz input, so TimeQuest will report `CLK_1Hz` as an unconstrained clock. That is a property of the coursework design, not of the export; it should still compile and run.
   - **Decimal points**: the manual lists a DP pin for every digit but its Control Panel chapter says the dots are not enabled. The app draws and exports them (`HEXn[7]`). Please check whether they light on the real board.
2. **Virtual board speed**: about 1.5 million clock cycles per second here (probably 3-5 million on an M-series Mac). Designs with a 50 MHz → 1 Hz divider need the divider bypass, which is built in. Signals wider than 32 bits work but are slower.
3. **Virtual board scope**: two-valued logic (x and z read as 0), no combinational loops, no `$display` on the board, no memories larger than what Yosys maps to flip-flops (fine for coursework). Clocks other than the board clock must be bypassed or generated by logic.
4. **Mac native menu**: the app draws its own menu bar inside the window (as in Quartus on Windows). On macOS the system menu bar only has the app, Edit and Window menus.
5. **Analysis speed**: the first analysis in a session takes 1-2 s while Yosys loads; later runs are faster.
6. **Not yet built**: the AI assistant panel (out of scope), VHDL (out of scope), board resources beyond switches/keys/LEDs/displays (out of scope).

## Blockers hit during the session

1. **Could not start CI runs by hand.** The GitHub integration used in this session is not allowed to trigger workflows (HTTP 403 "Resource not accessible by integration"), so I could not use "Run workflow" to build installers once per milestone. Workaround: the installer jobs also run for a push whose commit message contains `[installers]`; I used that once for M6. You can still use **Actions > CI > Run workflow** yourself.
2. **No openly licensed Terasic System Builder `.qsf` found** to double-check the I/O standard spelling (see limitation 1 below).

## Things I did differently from the spec, and why

1. **Icarus Verilog is WebAssembly, not native binaries.** The spec suggested bundling `iverilog`/`vvp` per platform. A WebAssembly build exists, passes every reference testbench, and removes all per-platform binaries and their macOS/Windows signing problems. Because WebAssembly `vvp` cannot take `-n`, NanoLogic makes `$stop` end the run by replacing the token with `$finish` in the simulated copy (same effect as `-n`; line numbers unchanged). Details and risks in `docs/toolchain-decision.md`.
2. **Virtual board simulator is our own**, not DigitalJS. DigitalJS is far too slow for a 50 MHz design and has no way to override an internal net for the divider bypass. Ours compiles the Yosys netlist to JavaScript and is checked against Icarus on random inputs.
3. **Files without `` `timescale `` use 1 ns**, like ModelSim (Icarus would use 1 s). This only affects simulation.
4. **Branch.** You asked for work on `dev`; the session was also configured to push to `claude/nanologic-spec-implementation-3qqyfc`, which holds the same commits. You can delete that branch.
5. **`asar` packaging is off.** The WebAssembly toolchain is loaded from worker threads, which is simplest and safest with plain files. The installer is the same size either way.

## Open questions for you

1. **Licence (important before any release):** Icarus Verilog is GPL-2.0-or-later. Shipping it as a separate program inside a closed-source app is normally fine (aggregation) if the GPL text and source offer are included; the installer includes both under `resources/licences/`. Please get this confirmed (e.g. Leeds IP office). See `docs/licences.md`.
2. **Quartus version on the lab PCs** (spec section 9): the export targets 17.1 syntax. If the lab has a different version, tell me.
3. **Lab template / course port names:** the starter file uses the DE10-Lite manual names (MAX10_CLK1_50, KEY, SW, LEDR, HEX0-5). If the course uses other names, send me the template and I'll make it the default.
4. **I/O standard spelling** (see limitation 1).
5. **Supply-chain risk:** the Icarus WebAssembly package is new and has one maintainer. It is pinned to an exact version and checked; if you'd rather not depend on it, I can build our own copy from source.

## CI status at the end of the session

All green on commit `de8cf06` ("Build installers [installers]"):

- Linux (push run 15): typecheck, 45 unit tests, 6 end-to-end tests, packaged-app smoke test.
- macOS and Windows (PR run 16): typecheck, unit tests, build, end-to-end tests.
- Installers (push run 15): macOS `.dmg` (arm64 and x64) and Windows `.exe` built; each packaged app was started in CI and ran analysis, simulation and the virtual board on the reference project.

Run pages: https://github.com/alimleahat/nanologic/actions/runs/40990787104 (Linux + installers) and https://github.com/alimleahat/nanologic/actions/runs/40990793724 (macOS/Windows). Download screenshots and installers from their Artifacts section; installers are kept for 7 days.
