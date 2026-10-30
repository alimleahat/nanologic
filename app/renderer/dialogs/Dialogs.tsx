import { useEffect, useState, type ReactNode } from 'react';
import type { ExportResult, ImportScan } from '@shared/api';
import { getBoard } from '@shared/board';
import { isValidName, type ExportLevel } from '@shared/project';
import {
  createNewFile,
  exportToQuartus,
  importFolder,
  newProject,
  openDialog,
  reportError,
  runSimulation,
} from '../state/actions';
import { useStore } from '../state/store';

function Dialog({ title, children, footer, wide, testId }: { title: string; children: ReactNode; footer: ReactNode; wide?: boolean; testId: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && openDialog(undefined);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && openDialog(undefined)}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} data-testid={testId}>
        <div className="dialog-title">{title}</div>
        {children}
        <div className="dialog-footer">{footer}</div>
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error?: string }) {
  return error ? <div className="notice error">{error}</div> : null;
}

const cleanError = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------------------------------------------------------------------------

function NewProjectWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('my_project');
  const [folder, setFolder] = useState('');
  const [top, setTop] = useState('top');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const board = getBoard('de10-lite');

  useEffect(() => {
    void window.nanologic.defaultProjectsFolder().then((f) => setFolder((cur) => cur || f));
  }, []);

  const steps = ['Name and location', 'Board', 'Top-level entity', 'Summary'];
  const valid = [isValidName(name) && !!folder, true, isValidName(top), true][step];

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await newProject({ name, folder, topLevelEntity: top, boardId: board.id });
      openDialog(undefined);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="New Project Wizard"
      testId="dialog-new-project"
      footer={
        <>
          <button className="btn" onClick={() => openDialog(undefined)}>
            Cancel
          </button>
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < steps.length - 1 ? (
            <button className="btn primary" disabled={!valid} onClick={() => setStep(step + 1)} data-testid="wizard-next">
              Next
            </button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => void create()} data-testid="wizard-finish">
              Finish
            </button>
          )}
        </>
      }
    >
      <div className="steps">
        {steps.map((s, i) => (
          <span key={s} className={i === step ? 'current' : ''}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <div className="dialog-body">
        <ErrorNote error={error} />
        {step === 0 && (
          <>
            <div className="field">
              <label htmlFor="np-name">Project name</label>
              <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="wizard-name" autoFocus />
              {!isValidName(name) && <span className="error-text">Use letters, digits and _ only, starting with a letter.</span>}
            </div>
            <div className="field">
              <label>Location (a folder named after the project is created here)</label>
              <div className="row">
                <input className="input mono" style={{ flex: 1 }} value={folder} onChange={(e) => setFolder(e.target.value)} data-testid="wizard-folder" />
                <button
                  className="btn"
                  onClick={async () => {
                    const f = await window.nanologic.chooseFolder('Choose a folder for the project', folder);
                    if (f) setFolder(f);
                  }}
                >
                  Browse...
                </button>
              </div>
            </div>
          </>
        )}
        {step === 1 && (
          <div className="field">
            <label>Board</label>
            <select className="select" value={board.id} disabled>
              <option value={board.id}>{board.name}</option>
            </select>
            <span className="secondary">
              {board.family} device {board.device}. Pin locations come from the {board.name} User Manual.
            </span>
          </div>
        )}
        {step === 2 && (
          <div className="field">
            <label htmlFor="np-top">Top-level entity (module name)</label>
            <input id="np-top" className="input mono" value={top} onChange={(e) => setTop(e.target.value)} data-testid="wizard-top" />
            <span className="secondary">
              NanoLogic creates <span className="mono">{top}.v</span> with the standard DE10-Lite port names (MAX10_CLK1_50, KEY, SW, LEDR, HEX0-HEX5), so the
              pins are mapped automatically.
            </span>
          </div>
        )}
        {step === 3 && (
          <table className="data-table">
            <tbody>
              <tr>
                <td>Project</td>
                <td className="mono">{name}</td>
              </tr>
              <tr>
                <td>Folder</td>
                <td className="mono">
                  {folder}
                  {folder.includes('\\') ? '\\' : '/'}
                  {name}
                </td>
              </tr>
              <tr>
                <td>Board</td>
                <td>
                  {board.name} ({board.device})
                </td>
              </tr>
              <tr>
                <td>Top-level entity</td>
                <td className="mono">{top}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ImportDialog() {
  const [scan, setScan] = useState<ImportScan>();
  const [kinds, setKinds] = useState<Record<string, 'design' | 'testbench' | 'skip'>>({});
  const [top, setTop] = useState('');
  const [name, setName] = useState('');
  const [projectFolder, setProjectFolder] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    setError(undefined);
    const folder = await window.nanologic.chooseFolder('Choose a folder of Verilog files');
    if (!folder) return;
    try {
      const s = await window.nanologic.scanImportFolder(folder);
      setScan(s);
      const k: Record<string, 'design' | 'testbench'> = {};
      s.designFiles.forEach((f) => (k[f] = 'design'));
      s.testbenchFiles.forEach((f) => (k[f] = 'testbench'));
      setKinds(k);
      setTop(s.topCandidates[0] ?? '');
      setName((folder.split(/[\\/]/).pop() ?? 'project').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1'));
      setProjectFolder(folder);
      if (s.designFiles.length + s.testbenchFiles.length === 0) setError('No Verilog (.v) files were found in that folder.');
    } catch (e) {
      setError(cleanError(e));
    }
  };

  const files = Object.keys(kinds).sort();
  const designModules = scan?.modules.filter((m) => kinds[m.file] === 'design').map((m) => m.name) ?? [];
  const topOptions = [...new Set([...(scan?.topCandidates ?? []).filter((m) => designModules.includes(m)), ...designModules])];

  const doImport = async () => {
    if (!scan) return;
    setBusy(true);
    setError(undefined);
    try {
      await importFolder({
        folder: scan.folder,
        name,
        topLevelEntity: top,
        designFiles: files.filter((f) => kinds[f] === 'design'),
        testbenchFiles: files.filter((f) => kinds[f] === 'testbench'),
        projectFolder,
      });
      openDialog(undefined);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Import Existing Folder"
      wide
      testId="dialog-import"
      footer={
        <>
          <button className="btn" onClick={() => openDialog(undefined)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!scan || !top || !isValidName(name) || busy} onClick={() => void doImport()} data-testid="import-confirm">
            Import
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <ErrorNote error={error} />
        <div className="field">
          <label>Folder</label>
          <div className="row">
            <input className="input mono" style={{ flex: 1 }} readOnly value={scan?.folder ?? ''} placeholder="Choose a folder containing .v files" />
            <button className="btn" onClick={() => void choose()} data-testid="import-choose">
              Choose...
            </button>
          </div>
          <span className="secondary">Your files are not changed or moved. NanoLogic only adds a project file.</span>
        </div>
        {scan && (
          <>
            <div className="field">
              <label>Files ({files.length}). Testbenches were detected from names ending in _tb.v, or modules with no ports and an initial block.</label>
              <div className="file-list" data-testid="import-files">
                {files.map((f) => (
                  <div className="tree-row" key={f}>
                    <span className="mono" style={{ flex: 1 }}>
                      {f}
                    </span>
                    <select
                      className="select small"
                      value={kinds[f]}
                      onChange={(e) => setKinds({ ...kinds, [f]: e.target.value as 'design' | 'testbench' | 'skip' })}
                    >
                      <option value="design">Design</option>
                      <option value="testbench">Testbench</option>
                      <option value="skip">Skip</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Top-level module</label>
                <select className="select mono" value={top} onChange={(e) => setTop(e.target.value)} data-testid="import-top">
                  {topOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                      {scan.topCandidates[0] === m ? ' (detected)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Project name</label>
                <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} data-testid="import-name" />
              </div>
            </div>
            <div className="field">
              <label>Save the project file in</label>
              <div className="row">
                <input className="input mono" style={{ flex: 1 }} value={projectFolder} onChange={(e) => setProjectFolder(e.target.value)} />
                <button
                  className="btn"
                  onClick={async () => {
                    const f = await window.nanologic.chooseFolder('Where to save the project file', projectFolder);
                    if (f) setProjectFolder(f);
                  }}
                >
                  Browse...
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function SimulateDialog() {
  const project = useStore((s) => s.project);
  const tbs = project?.project.testbenchFiles ?? [];
  const [tb, setTb] = useState(project?.project.simulation.lastTestbench ?? tbs[0] ?? '');
  const [maxUs, setMaxUs] = useState(String((project?.project.simulation.maxTimeNs ?? 1_000_000) / 1000));
  const max = Number(maxUs);
  return (
    <Dialog
      title="Start Simulation"
      testId="dialog-simulate"
      footer={
        <>
          <button className="btn" onClick={() => openDialog(undefined)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!tb || !(max > 0)}
            data-testid="simulate-run"
            onClick={() => {
              openDialog(undefined);
              void runSimulation(tb, Math.round(max * 1000));
            }}
          >
            Run
          </button>
        </>
      }
    >
      <div className="dialog-body">
        {tbs.length === 0 ? (
          <div className="notice">This project has no testbench files. Use Project &gt; Add Testbench Files, or File &gt; New Verilog File.</div>
        ) : (
          <>
            <div className="field">
              <label>Testbench</label>
              <select className="select mono" value={tb} onChange={(e) => setTb(e.target.value)} data-testid="simulate-tb">
                {tbs.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Maximum simulation time (microseconds)</label>
              <input className="input mono" value={maxUs} onChange={(e) => setMaxUs(e.target.value)} data-testid="simulate-max" />
              <span className="secondary">
                The run stops here if the testbench has not called $stop or $finish. $stop ends the simulation (it does not pause).
              </span>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ExportDialog() {
  const project = useStore((s) => s.project);
  const [level, setLevel] = useState<ExportLevel>(project?.project.exportLevel ?? 3);
  const [dest, setDest] = useState(project?.dir ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult>();
  const levels: [ExportLevel, string, string][] = [
    [1, 'Sources only', 'Your design files (testbenches are left out).'],
    [2, 'Sources and pin reference', 'Design files plus a pin table (Markdown and CSV) to enter in the Pin Planner by hand.'],
    [3, 'Full Quartus project', '.qpf, .qsf (device, top level, files, pins, I/O standards), .sdc and sources. Ready to compile.'],
  ];
  return (
    <Dialog
      title="Export to Quartus"
      testId="dialog-export"
      footer={
        <>
          <button className="btn" onClick={() => openDialog(undefined)}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {result?.ok && (
            <button className="btn" onClick={() => window.nanologic.showInFolder(result.folder)}>
              Show in folder
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy || !dest}
            data-testid="export-run"
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await exportToQuartus(level, dest));
              } catch (e) {
                reportError('export', e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Exporting...' : 'Export'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        {levels.map(([l, title, desc]) => (
          <label key={l} className="row" style={{ alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
            <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} data-testid={`export-level-${l}`} />
            <span>
              <strong>
                {l}. {title}
              </strong>
              <div className="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {desc}
              </div>
            </span>
          </label>
        ))}
        <div className="field" style={{ marginTop: 8 }}>
          <label>Export into (a folder named {project?.project.name}_quartus is created here)</label>
          <div className="row">
            <input className="input mono" style={{ flex: 1 }} value={dest} onChange={(e) => setDest(e.target.value)} data-testid="export-dest" />
            <button
              className="btn"
              onClick={async () => {
                const f = await window.nanologic.chooseFolder('Export destination', dest);
                if (f) setDest(f);
              }}
            >
              Browse...
            </button>
          </div>
        </div>
        {result && (
          <div className={`notice ${result.ok ? '' : 'error'}`} data-testid="export-result">
            {result.ok ? (
              <>
                <strong className="success-text">Exported.</strong> In Quartus Prime Lite 17.1 use File &gt; Open Project and choose{' '}
                <span className="mono">{project?.project.name}.qpf</span> in <span className="mono">{result.folder}</span>.
                <div className="secondary mono" style={{ marginTop: 6 }}>
                  {result.files.join('  ')}
                </div>
              </>
            ) : (
              <>Export failed. See Messages.</>
            )}
            {result.messages.filter((m) => m.severity !== 'info').length > 0 && (
              <div style={{ marginTop: 6 }}>
                {result.messages
                  .filter((m) => m.severity !== 'info')
                  .map((m, i) => (
                    <div key={i} className={`sev ${m.severity}`} style={{ fontWeight: 400 }}>
                      {m.text}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function NewFileDialog() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'design' | 'testbench'>('design');
  const [error, setError] = useState<string>();
  const base = name.replace(/\.s?v$/i, '');
  const valid = isValidName(base);
  return (
    <Dialog
      title="New Verilog File"
      testId="dialog-new-file"
      footer={
        <>
          <button className="btn" onClick={() => openDialog(undefined)}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={async () => {
              try {
                await createNewFile(`${base}.v`, kind);
                openDialog(undefined);
              } catch (e) {
                setError(cleanError(e));
              }
            }}
          >
            Create
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <ErrorNote error={error} />
        <div className="field">
          <label>Module / file name</label>
          <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="counter" />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'design' | 'testbench')}>
            <option value="design">Design file</option>
            <option value="testbench">Testbench</option>
          </select>
        </div>
      </div>
    </Dialog>
  );
}

function AboutDialog() {
  const v = window.nanologic.versions;
  return (
    <Dialog
      title="About NanoLogic"
      testId="dialog-about"
      footer={
        <button className="btn primary" onClick={() => openDialog(undefined)}>
          OK
        </button>
      }
    >
      <div className="dialog-body" style={{ lineHeight: 1.6 }}>
        <div>NanoLogic {v.app}</div>
        <div className="secondary">Electron {v.electron}</div>
        <p>
          Includes Yosys (ISC licence) and Icarus Verilog (GNU GPL v2 or later), both compiled to WebAssembly and run as separate programs. Source code
          for Icarus Verilog is available from the location given in the licence notes shipped with the app.
        </p>
        <p className="secondary">Not affiliated with Intel or Terasic. Quartus is a trademark of Intel Corporation.</p>
      </div>
    </Dialog>
  );
}

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  switch (dialog) {
    case 'newProject':
      return <NewProjectWizard />;
    case 'import':
      return <ImportDialog />;
    case 'simulate':
      return <SimulateDialog />;
    case 'export':
      return <ExportDialog />;
    case 'newFile':
      return <NewFileDialog />;
    case 'about':
      return <AboutDialog />;
    default:
      return null;
  }
}
