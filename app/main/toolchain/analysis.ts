// Analysis: syntax and elaboration (Icarus Verilog), synthesis checks (Yosys)
// and NanoLogic's own synthesisability lint.
import path from 'node:path';
import { lintDesignFile } from '../../shared/lint';
import type { Message } from '../../shared/messages';
import type { NanoLogicProject } from '../../shared/project';
import type { AnalysisResult, TopPort } from '../../shared/toolTypes';
import { buildHierarchy, scanModules } from '../../shared/verilogScan';
import type { YosysDesign } from '../../shared/netsim/yosysJson';
import { iverilogCompileOnly } from './iverilog';
import { parseIverilogOutput, parseYosysLog } from './parseOutput';
import { stageSources, virtToDisplay, type StagedSource } from './sources';
import { runYosysCommands, yosysQuote } from './yosys';

export type YosysRunner = typeof runYosysCommands;

export async function analyseProject(
  projectDir: string,
  project: NanoLogicProject,
  unsaved: Record<string, string> = {},
  runYosys: YosysRunner = runYosysCommands,
): Promise<AnalysisResult> {
  const t0 = Date.now();
  const messages: Message[] = [];
  const top = project.topLevelEntity;
  if (project.designFiles.length === 0) {
    return {
      ok: false,
      messages: [{ severity: 'error', text: 'The project has no design files.', source: 'analysis' }],
      ports: [],
      durationMs: 0,
    };
  }
  const files = project.designFiles.map((f) => path.resolve(projectDir, f));
  let staged: StagedSource[];
  try {
    staged = await stageSources(projectDir, files, unsaved);
  } catch (e) {
    return {
      ok: false,
      messages: [{ severity: 'error', text: `Could not read design files: ${(e as Error).message}`, source: 'analysis' }],
      ports: [],
      durationMs: Date.now() - t0,
    };
  }
  const toDisplay = virtToDisplay(staged);

  // Hierarchy from the forgiving scanner, so it is available even with errors.
  const scanned = staged.flatMap((s) => scanModules(s.text).map((module) => ({ module, file: s.display })));
  const hierarchy = buildHierarchy(top, scanned);
  if (!scanned.some((m) => m.module.name === top)) {
    messages.push({
      severity: 'error',
      text: `Top-level entity "${top}" was not found in the design files.`,
      source: 'analysis',
    });
  }

  // 1. Syntax and elaboration with Icarus Verilog.
  const iv = await iverilogCompileOnly(
    staged.map((s) => ({ path: s.virt, text: s.text })),
    staged.map((s) => s.virt),
    top,
  );
  const ivMessages = parseIverilogOutput(iv.output, toDisplay, 'analysis');
  messages.push(...ivMessages);
  if (!iv.ok && !ivMessages.some((m) => m.severity === 'error')) {
    messages.push({ severity: 'error', text: `Compilation failed (${iv.stage}).`, source: 'analysis' });
  }

  // 2. Synthesis checks with Yosys (only once the code compiles, to avoid duplicate errors).
  let ports: TopPort[] = [];
  if (iv.ok) {
    const fileMap = Object.fromEntries(staged.map((s) => [s.virt, s.text]));
    const y = await runYosys(
      fileMap,
      [
        `read_verilog ${staged.map((s) => yosysQuote(s.virt)).join(' ')}`,
        `hierarchy -check -top ${top}`,
        'proc',
        'check',
        'write_json nl_ports.json',
      ],
      ['nl_ports.json'],
    );
    const yMessages = parseYosysLog(
      y.log,
      staged.map((s) => s.virt),
      toDisplay,
      'analysis',
    );
    messages.push(...yMessages);
    if (!y.ok && !yMessages.some((m) => m.severity === 'error')) {
      messages.push({ severity: 'error', text: 'Synthesis check failed.', source: 'analysis' });
    }
    if (y.ok && y.outputs['nl_ports.json']) {
      ports = portsFromYosys(JSON.parse(y.outputs['nl_ports.json']) as YosysDesign, top);
      // A 1-bit port declared as [0:0] is not a scalar for Quartus ("x[0]" not "x").
      const topScan = scanned.find((m) => m.module.name === top)?.module;
      for (const p of ports) {
        const sp = topScan?.ports.find((x) => x.name === p.name);
        if (p.width === 1 && sp && sp.range !== '') p.scalar = false;
      }
    }
  }

  // 3. Synthesisability lint.
  for (const s of staged) messages.push(...lintDesignFile(s.display, s.text));

  const ok = !messages.some((m) => m.severity === 'error');
  if (ok) {
    messages.push({
      severity: 'info',
      text: `Analysis passed: top-level "${top}" with ${ports.length} port${ports.length === 1 ? '' : 's'} (${ports
        .map((p) => `${p.direction} ${p.width > 1 ? `[${p.msb}:${p.lsb}] ` : ''}${p.name}`)
        .join(', ')}).`,
      source: 'analysis',
    });
  }
  return { ok, messages: dedupe(messages), ports, hierarchy, durationMs: Date.now() - t0 };
}

export function portsFromYosys(design: YosysDesign, top: string): TopPort[] {
  const mod = design.modules[top];
  if (!mod) return [];
  return Object.entries(mod.ports).map(([name, p]) => {
    const width = p.bits.length;
    const offset = p.offset ?? 0;
    const upto = !!p.upto;
    const lsb = upto ? offset + width - 1 : offset;
    const msb = upto ? offset : offset + width - 1;
    // Yosys does not record whether a 1-bit port had a [0:0] range; the netname's
    // "src" cannot tell us either, so treat all 1-bit ports at offset 0 as scalars.
    const scalar = width === 1 && offset === 0;
    return { name, direction: p.direction, width, msb, lsb, scalar };
  });
}

function dedupe(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const key = `${m.severity}|${m.file}|${m.line}|${m.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
