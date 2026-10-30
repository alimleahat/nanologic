// Worker thread that runs the virtual board: the compiled design, its clock and
// the switch/key inputs. Posts output levels to the main process ~30 times a second.
import { parentPort } from 'node:worker_threads';
import type { BoardState, ClockSpeed } from '../../shared/api';
import { getBoard } from '../../shared/board';
import { BoardEngine } from '../../shared/netsim/boardEngine';
import { compileNetlist, NetlistError } from '../../shared/netsim/compile';
import type { YosysDesign } from '../../shared/netsim/yosysJson';
import type { BypassSetting, PinAssignment } from '../../shared/project';
import type { TopPort } from '../../shared/toolTypes';

export type BoardWorkerRequest =
  | {
      type: 'load';
      design: YosysDesign;
      top: string;
      boardId: string;
      ports: TopPort[];
      assignments: PinAssignment[];
      tieOffs: Record<string, number>;
      bypass: BypassSetting[];
    }
  | { type: 'inputs'; SW?: number; KEY?: number }
  | { type: 'clock'; speed?: ClockSpeed; running?: boolean }
  | { type: 'step'; cycles: number }
  | { type: 'reset' }
  | { type: 'stop' };

export type BoardWorkerMessage =
  | { type: 'loaded'; ok: true; nets: ReturnType<typeof compileNetlist>['nets']; report: BoardEngine['report'] }
  | { type: 'loaded'; ok: false; error: string; file?: string; line?: number }
  | { type: 'state'; state: BoardState };

let engine: BoardEngine | undefined;
let running = false;
let speed: ClockSpeed = 1;
let last = performance.now();
let owed = 0;
let lastPost = 0;
let rateWindowStart = performance.now();
let rateWindowCycles = 0;
let actualHz = 0;
let error: string | undefined;
let timer: NodeJS.Timeout | undefined;

const post = (m: BoardWorkerMessage) => parentPort!.postMessage(m);

function postState(force = false) {
  const now = performance.now();
  if (!engine || (!force && now - lastPost < 33)) return;
  lastPost = now;
  post({ type: 'state', state: { outputs: engine.outputs(), cycles: engine.cycles, running, speed, actualHz, error } });
}

function runSafely(n: number) {
  try {
    engine!.run(n);
    rateWindowCycles += n;
  } catch (e) {
    running = false;
    error = (e as Error).message;
  }
}

function loop() {
  timer = undefined;
  if (!engine) return;
  const now = performance.now();
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  if (running) {
    if (speed === 'max') {
      const end = now + 25;
      while (running && performance.now() < end) runSafely(2000);
    } else {
      owed += dt * speed;
      const n = Math.floor(owed);
      owed -= n;
      if (n > 0) runSafely(n);
    }
  }
  if (now - rateWindowStart >= 500) {
    actualHz = (rateWindowCycles * 1000) / (now - rateWindowStart);
    rateWindowStart = now;
    rateWindowCycles = 0;
  }
  postState();
  schedule();
}

function schedule() {
  if (timer || !engine) return;
  timer = running && speed === 'max' ? setTimeout(loop, 0) : setTimeout(loop, 16);
}

parentPort?.on('message', (m: BoardWorkerRequest) => {
  switch (m.type) {
    case 'load': {
      running = false;
      error = undefined;
      try {
        const sim = compileNetlist(m.design, m.top, m.bypass);
        engine = new BoardEngine(sim, getBoard(m.boardId), m.ports, m.assignments, m.tieOffs);
        post({ type: 'loaded', ok: true, nets: sim.nets, report: engine.report });
        last = performance.now();
        postState(true);
        schedule();
      } catch (e) {
        engine = undefined;
        const ne = e instanceof NetlistError ? e : undefined;
        post({ type: 'loaded', ok: false, error: (e as Error).message, file: ne?.file, line: ne?.line });
      }
      break;
    }
    case 'inputs':
      engine?.setInputs({ ...(m.SW !== undefined ? { SW: m.SW } : {}), ...(m.KEY !== undefined ? { KEY: m.KEY } : {}) });
      postState(true);
      break;
    case 'clock':
      if (m.speed !== undefined) speed = m.speed;
      if (m.running !== undefined) running = m.running && !!engine?.hasClock;
      owed = 0;
      last = performance.now();
      postState(true);
      schedule();
      break;
    case 'step':
      if (engine) {
        running = false;
        runSafely(Math.max(1, m.cycles));
        postState(true);
      }
      break;
    case 'reset':
      if (engine) {
        engine.reset();
        error = undefined;
        postState(true);
      }
      break;
    case 'stop':
      running = false;
      engine = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
      break;
  }
});
