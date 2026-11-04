# Progress

Last updated: 4 Nov 2026. **Feature freeze**: from now on only fixes from the lab tests (see `docs/hardware-test-checklist.md`). The DE10-Lite notes from 30 Oct follow after the Basys 3 section.

## Simulator cross-check (permanent CI test)

`tests/unit/differential.test.ts` runs every design below in both the virtual-board simulator and Icarus Verilog with the same seeded random inputs, cycle by cycle, and fails on any difference. It runs on every CI job (Linux, macOS, Windows). Resets are asserted for the first cycles and then rarely, so counters get to run; the starter examples use small divider parameters so their counters and display scanning actually move within the test. Where outputs change too rarely (behind the 50 MHz → 1 Hz divider), internal registers are compared too (`ClockDivider.count`, and in `MainCode` the divider count, `ControlSignal` and `Count`). Samples that are still x/z in Icarus (4 samples of the `BCD7Seg` latch output before its first valid input) are skipped, and the test requires at least 90% of samples to be compared.

Coverage on 4 Nov 2026 (also written to `test-results/differential-summary.md` in each CI run's artifacts):

| Design | Cycles | Signals compared | Samples compared | Skipped (x/z in Icarus) | Result |
|---|---|---|---|---|---|
| DE10-Lite starter (DIV = 5) | 4000 | 7 | 28000 | 0 | match |
| Basys 3 starter (REFRESH_BITS = 6, AUTO_BITS = 7) | 4000 | 4 | 16000 | 0 | match |
| traffic light: MainCode | 4000 | 9 | 36000 | 0 | match |
| traffic light: ClockDivider | 4000 | 2 | 8000 | 0 | match |
| traffic light: CoreLogic | 4000 | 3 | 12000 | 0 | match |
| traffic light: CounterUnit | 4000 | 1 | 4000 | 0 | match |
| traffic light: Decoder | 1000 | 4 | 4000 | 0 | match |
| traffic light: SevenSegDisplay | 1000 | 2 | 2000 | 0 | match |
| traffic light: BinaryBCD | 1000 | 2 | 2000 | 0 | match |
| traffic light: BCD7Seg | 1000 | 1 | 996 | 4 | match |
| traffic light: Subtractor | 1000 | 1 | 1000 | 0 | match |
| traffic light: FourBitFullAdder | 1000 | 2 | 2000 | 0 | match |
| traffic light: OneBitFullAdder | 1000 | 2 | 2000 | 0 | match |
| traffic light: Comparator4 | 1000 | 1 | 1000 | 0 | match |
| traffic light: Mux2Way4 | 1000 | 1 | 1000 | 0 | match |
| traffic light: Mux | 1000 | 1 | 1000 | 0 | match |
| **Total (16 designs)** | **34000** | | **120996** | | |

The test was checked by deliberately breaking the simulator's adder: it then failed for the DE10-Lite starter, the Basys 3 starter, `CoreLogic`, `ClockDivider` and `MainCode`.


## Basys 3 support (experimental)

Developed on the `basys3` branch and merged into `dev` through PR #2. Nothing changed for the DE10-Lite: all its tests still pass.

### What works

- **Board data**: `boards/basys3.json` is built from Digilent's `Basys-3-Master.xdc` (github.com/Digilent/digilent-xdc, commit `c8644a9fe31cc803789643124545d56b3bef4600`; the file last changed in `69d3501`). Device `xc7a35tcpg236-1`, 100 MHz clock on `clk` (W5), standard names `clk`, `sw[15:0]`, `led[15:0]`, `btnC/btnU/btnL/btnR/btnD`, `seg[6:0]`, `dp`, `an[3:0]`, all `LVCMOS33`. A unit test (`tests/unit/basys3.test.ts`) reads the vendored master XDC and checks every pin and I/O standard against the JSON. The XDC's configuration lines (`CONFIG_VOLTAGE 3.3`, `CFGBVS VCCO`, the SPI x4 boot settings) are carried over.
- **Labelled experimental** everywhere it is chosen or produced: board picker ("Digilent Basys 3 (Experimental - not yet verified on hardware)"), board view, Pin Planner, and every exported file (`.xdc`, `create_project.tcl` and `pins.md` headers, plus a warning in Messages).
- **Board picker** in the New Project Wizard and in **Project > Project Settings (Board)**. Changing the board clears the pin assignments (with a confirmation) and maps the standard names again after the analysis. New Basys 3 projects get a starter `top.v` with the master XDC's port names.
- **Auto-mapping** uses the Basys 3 names (50 pins for a design that uses them all).
- **Virtual Basys 3**: four-digit display on the left, 16 LEDs above 16 switches, five buttons in a cross. Buttons read 1 while held; switches 1 when up; LEDs lit at 1.
- **Multiplexed display with persistence of vision**: at Max speed the display shows what an eye would see, averaged over the last 10 ms of *board* time (1,000,000 clock cycles), so it looks the same however fast or slow the simulator runs. A correctly scanned design shows four steady digits; segments that change late show a faint ghost on the neighbouring digit; a scan slower than ~10 ms per digit makes the digits flicker one at a time. At 1 Hz/10 Hz/1 kHz or when stepping there is no persistence to show, so the display shows the digit enabled at that instant (the board says so). Unit tests cover all four cases.
- **Shared-segment explanation**: when a design has a separate segment output per digit (like the traffic light's `HexH`/`HexL`), the Pin Planner shows a box explaining that the Basys 3's digits share `seg`/`dp`, that each digit has its own active-low `an` enable, and what a multiplexer has to do. NanoLogic does not generate one. Validation also adds a warning.
- **Export to Vivado** (the toolbar, menus and Tasks say "Vivado" for Basys 3 projects):
  - Level 1: `src/*.v`. Level 2: plus `pins.md` and `pins.csv`.
  - Level 3: plus `<project>.xdc` (only the mapped ports, `create_clock -period 10.000` on the 100 MHz clock when it is used, the configuration properties) and `create_project.tcl`, which creates the project for `xc7a35tcpg236-1` in a `vivado/` folder next to it, adds the sources and the `.xdc` and sets the top module. Tcl rather than `.xpr`, so it works across Vivado versions. Testbenches are left out.
  - Unit tests compare the generated `.xdc` and `.tcl` with expected text.
- **Starter example** (`examples/basys3-starter`, on the Home screen as "Basys 3 starter (experimental)"): switches to LEDs, and a 16-bit counter scanned across all four digits (btnU adds one, btnC resets, `sw[15]` up makes it count by itself). Unit and end-to-end tests run it on the virtual board and read 0000 → 0001 → 0002 → 0000 off the scanned display.
- **Level 3 export of the starter** is in `examples/basys3-starter-export/` (regenerate with `npm run examples:export`).

### What does not work / limitations

1. **Nothing has been checked on a Basys 3 or in Vivado.** See the checklist below.
2. **Polarities: resolved (4 Nov 2026).** Ali confirmed from Digilent's Basys 3 reference manual: push buttons are low at rest and high only while pressed; slide switches give a constant high or low; the seven-segment segments and anodes are active-low. This matches `boards/basys3.json` and the virtual board.
3. **Speed**: the virtual board runs about 1.5-2 million cycles per second here, about 50× slower than the real 100 MHz. The display stays correct because persistence is measured in board time, but at Max it takes about half a second of real time to fill the 10 ms window, so the display reacts to button presses with a short lag. Designs that count at human speed from the 100 MHz clock (e.g. once a second) need the divider bypass, as on the DE10-Lite.
4. **Only on-board I/O**: Pmod headers, VGA, USB-UART, PS/2 and the Quad SPI flash pins are in the master XDC but not in NanoLogic yet.
5. **Button bounce**: the starter example samples `btnU` once per scan period (~2.6 ms), which should ignore normal contact bounce. Please check in the lab that one press adds exactly one.
6. **No "Build bitstream"**: parked for phase 2 (see below). Bitstreams come from Vivado via the export.

### What to check on real hardware and in Vivado

1. In Vivado (any recent version), **Tools > Run Tcl Script** on `examples/basys3-starter-export/create_project.tcl`. Check that the project opens with part `xc7a35tcpg236-1`, that `top` is the top module, and that the `.xdc` is under Constraints.
2. Run **Generate Bitstream**. Check for no critical warnings about unplaced ports, I/O standards or the clock, and that timing is met at 100 MHz.
3. Program the board (Hardware Manager) and check:
   - each switch lights the LED above it (sw0 → LD0, rightmost);
   - the display shows `0000` steadily, with no flicker or ghosting;
   - each press of **btnU** adds exactly one (so bounce is filtered), **btnC** resets to `0000`, `sw[15]` up makes it count by itself about 6 times a second;
   - `an[0]` is the **rightmost** digit, and the segment order matches (a "1" lights the two right-hand segments);
   - the decimal points stay off.
4. Tell me anything that differs, especially polarities.

### CI status and merge

- Final checks on `basys3` at commit `35b6f9b` (including the new simulator cross-check): all green. Linux: https://github.com/alimleahat/nanologic/actions/runs/41752799637. macOS and Windows (PR #2): https://github.com/alimleahat/nanologic/actions/runs/41752805544.
- Merged into `dev` on 4 Nov 2026 (merge commit, PR #2). PR #1 (`dev` → `main`) stays open as a draft.
- Fresh installers were requested from `dev` by the commit "Progress notes: Basys 3 merged into dev [installers]". Download them from that commit's CI run under Artifacts (`installer-macOS`: `.dmg` for Apple Silicon and Intel; `installer-Windows`: `.exe`), kept for 7 days.

### Blockers

- ~~digilent.com is blocked in the cloud session, so the reference manual could not be read.~~ **Resolved**: Ali confirmed the polarities from the manual (limitation 2).

### Phase 2 (parked): openXC7 "Build bitstream"

Decision (4 Nov 2026): parked for phase 2. No download-on-first-use feature is to be added in the MVP. What was found:
  - The network *can* fetch it. The only prebuilt openXC7 builds I found are Apio's (`fpgawars/tools-openxc7`, release `2026-09-24`): Linux x86-64, macOS Apple Silicon and Windows x64. There is **no build for Intel Macs**. Each package is about 109 MB to download (739 MB unpacked), plus a 25 MB chipdb for the xc7a35t (its SHA-256 matched the published index).
  - The package has no Yosys, but NanoLogic's bundled WebAssembly Yosys ran `synth_xilinx -arch xc7` on the Basys 3 starter in about 24 s, so synthesis would need nothing extra.
  - **Blocker:** running the downloaded native `nextpnr-xilinx` (and then `fasm2frames` / `xc7frames2bit`) was refused by this session's permission policy ("code from external"). I did not work around it, so place-and-route and bitstream generation are untested and I added no Build bitstream feature.
  - Design questions for you before anyone builds this: (1) the toolchain is far too big to put in the installer (739 MB per platform), so it would have to be downloaded on first use, which breaks the "works offline" rule for this one feature; (2) Intel Macs would not be supported; (3) licences of the bundled pieces (nextpnr and prjxray are ISC, prjxray-db is CC0; the rest of the package would need checking).
  - What phase 2 would need: permission to run the native tools (in CI or on a developer machine) to test place-and-route and bitstream generation, a decision on download-on-first-use versus a separate add-on installer, and a licence review of the whole package.

---

# DE10-Lite MVP notes (30 Oct 2026)

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
