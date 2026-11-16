import { openDialog, openExample, openProjectDialog, openProjectPath } from '../state/actions';
import { useStore } from '../state/store';

export function Welcome() {
  const recent = useStore((s) => s.recent);
  const examples = useStore((s) => s.examples);
  const project = useStore((s) => s.project);
  return (
    <div className="welcome" data-testid="welcome">
      <h1>NanoLogic</h1>
      <div className="secondary">
        Write Verilog, simulate it, try it on a virtual DE10-Lite or Basys 3 (experimental), then export to Quartus Prime Lite 17.1 or Vivado.
      </div>

      {project && (
        <div className="notice" style={{ marginTop: 16 }}>
          Project <strong>{project.project.name}</strong> is open. Double-click a file in the Project Navigator to edit it.
        </div>
      )}

      <h2>Start</h2>
      <div className="card-grid">
        <button className="card" onClick={() => openDialog('newProject')} data-testid="welcome-new">
          <div className="title">New project</div>
          <div className="desc">Create a DE10-Lite or Basys 3 project with a starter top-level file.</div>
        </button>
        <button className="card" onClick={() => void openProjectDialog()}>
          <div className="title">Open project</div>
          <div className="desc">Open an existing .nlproj file.</div>
        </button>
        <button className="card" onClick={() => openDialog('import')} data-testid="welcome-import">
          <div className="title">Import a folder</div>
          <div className="desc">Use an existing folder of Verilog files, such as coursework from ModelSim or Quartus.</div>
        </button>
      </div>

      <h2>Examples</h2>
      <div className="card-grid">
        {examples.map((e) => (
          <button className="card" key={e.id} onClick={() => void openExample(e.id)} data-testid={`example-${e.id}`}>
            <div className="title">{e.title}</div>
            <div className="desc">{e.description}</div>
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <h2>Recent projects</h2>
          <div className="link-list">
            {recent.map((p) => (
              <button key={p} onClick={() => void openProjectPath(p)} title={p}>
                <span>{p.split(/[\\/]/).pop()}</span> <span className="secondary mono">{p}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>The usual flow</h2>
      <ol className="secondary" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
        <li>Write your design. The board&apos;s own port names (SW, KEY, LEDR, HEX0 on the DE10-Lite; sw, btnC, led, seg, an on the Basys 3) are connected automatically.</li>
        <li>Processing &gt; Start Analysis (or the Analyse button). Click a message to jump to the line.</li>
        <li>Simulate a testbench and inspect the waveform.</li>
        <li>Run Board: flip switches, press keys, watch the LEDs and displays.</li>
        <li>Assignments &gt; Pin Planner for any other port names, then export to Quartus or Vivado.</li>
      </ol>
    </div>
  );
}
