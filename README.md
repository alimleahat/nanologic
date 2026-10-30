# NanoLogic

A desktop app (macOS and Windows) for students learning digital design on the Terasic DE10-Lite FPGA board. Write Verilog, check it, simulate it, look at waveforms, try it on a virtual DE10-Lite, then export a project that opens in Intel Quartus Prime Lite 17.1 on the lab PCs.

Everything runs inside the app. Students do not need to install a compiler, Icarus Verilog, Yosys or Quartus to use it.

Status and open questions: [docs/progress.md](docs/progress.md). How the simulator was chosen: [docs/toolchain-decision.md](docs/toolchain-decision.md). Licences: [docs/licences.md](docs/licences.md).

## What you need (developers only)

- **Node.js 22** (LTS). On a Mac, the easiest way is the installer from https://nodejs.org (choose "22 LTS"), or `brew install node@22` if you use Homebrew.
- **Git**.

Students who only use the finished app need none of this; they install the `.dmg` or `.exe`.

## First-time setup

Open Terminal, then:

```bash
git clone https://github.com/alimleahat/nanologic.git
```

```bash
cd nanologic
```

```bash
npm install
```

`npm install` downloads everything, including Electron and the WebAssembly toolchain (about 400 MB). It takes a few minutes the first time.

## Run the app while developing

```bash
npm run dev
```

The NanoLogic window opens. Changes to the user interface (files in `app/renderer`) reload automatically. If you change files in `app/main` or `app/shared`, close the window and run `npm run dev` again.

To run the built app exactly as it will ship (without the dev server):

```bash
npm run build
```

```bash
npm start
```

## Run the tests

Unit tests (board pin table, export files, simulator, the reference project's 14 modules and 14 testbenches):

```bash
npm test
```

End-to-end tests (they open the real app window and click through it; screenshots are saved in `test-results/screenshots/`):

```bash
npm run test:e2e
```

Type checking:

```bash
npm run typecheck
```

## Build installers

On a Mac, this makes `.dmg` files for Apple Silicon and Intel in the `release/` folder:

```bash
npm run dist:mac
```

On Windows, this makes a `.exe` installer:

```bash
npm run dist:win
```

The installers are not signed yet. On a Mac, the first time you open an unsigned app, right-click it in Applications and choose **Open**. If macOS says the app "is damaged", run `xattr -cr /Applications/NanoLogic.app` once in Terminal.

CI (GitHub Actions) also builds both installers when you start the workflow by hand (on GitHub: **Actions > CI > Run workflow**), on every push to `main`, and for any push whose commit message contains `[installers]`. The installers appear under "Artifacts" on the run's page.

## Regenerate the example Quartus export

`examples/traffic-light-export/` is the reference project exported for Quartus. After changing the exporter or the example's pin mapping, regenerate it with:

```bash
npm run examples:export
```

## Where things are

| Folder | What is in it |
|---|---|
| `app/main` | Electron main process: files, projects, the toolchain runner, export |
| `app/preload` | The bridge between the window and the main process |
| `app/renderer` | The user interface (React): layout, editor, waveform viewer, virtual board, pin planner. Colours and sizes are in `theme.ts` |
| `app/shared` | Code used by both sides: board data helpers, Verilog scanner, virtual-board simulator, Quartus export, VCD reader |
| `boards/de10-lite.json` | DE10-Lite pins and I/O standards from the User Manual |
| `templates` | Verilog templates and the starter top-level file |
| `examples` | The starter example, the reference project's NanoLogic project file and its Quartus export |
| `tests` | Unit tests, end-to-end tests and the reference project (read-only copy) |
| `docs` | Progress notes, toolchain decision, licences |

## CI

- Every push: Linux typecheck, unit tests, end-to-end tests, a packaged-app smoke test and screenshots (download them from the run's "Artifacts").
- The open pull request from `dev` to `main`, pushes to `main`, and manual runs: the same checks on macOS and Windows.
- Manual runs, pushes to `main` and commits with `[installers]` in the message: unsigned macOS and Windows installers.
