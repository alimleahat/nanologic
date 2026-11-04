// Synthesisability checks for design files: constructs that simulate fine but
// that Quartus ignores or rejects when building hardware.
import type { Message } from './messages';
import { tokenize, type Token } from './verilogScan';

const SIM_ONLY_TASKS = new Set([
  '$display',
  '$write',
  '$strobe',
  '$monitor',
  '$stop',
  '$finish',
  '$dumpfile',
  '$dumpvars',
  '$dumpon',
  '$dumpoff',
  '$random',
  '$urandom',
  '$time',
  '$realtime',
  '$stime',
  '$fopen',
  '$fclose',
  '$fdisplay',
  '$fwrite',
]);

const SIM_ONLY_KEYWORDS: Record<string, string> = {
  forever: '"forever" loops only work in simulation',
  wait: '"wait" statements only work in simulation',
  fork: '"fork ... join" only works in simulation',
  force: '"force" only works in simulation',
  release: '"release" only works in simulation',
};

function matchParen(tokens: Token[], i: number): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    if (tokens[j].text === '(') depth++;
    else if (tokens[j].text === ')' && --depth === 0) return j;
  }
  return tokens.length - 1;
}

/** Find the token index that ends the statement or block starting at `i`. */
function statementEnd(tokens: Token[], i: number): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j].text;
    if (t === 'begin' || t === 'fork' || t === 'case' || t === 'casex' || t === 'casez') depth++;
    else if (t === 'end' || t === 'join' || t === 'endcase') {
      depth--;
      if (depth <= 0) return j;
    } else if (t === ';' && depth === 0) return j;
  }
  return tokens.length - 1;
}

export function lintDesignFile(file: string, src: string): Message[] {
  const tokens = tokenize(src);
  const out: Message[] = [];
  const warn = (line: number, text: string, severity: Message['severity'] = 'warning') =>
    out.push({ severity, text, file, line, source: 'analysis' });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === '#') {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      // Parameter lists: "module name #(" and "ModName #(...) inst (" are fine.
      const isModuleHeader = tokens[i - 2]?.text === 'module';
      let isParamOverride = false;
      if (next?.text === '(' && prev?.kind === 'id') {
        const close = matchParen(tokens, i + 1);
        const after = tokens[close + 1];
        const after2 = tokens[close + 2];
        isParamOverride = after?.kind === 'id' && (after2?.text === '(' || after2?.text === '[');
      }
      if (!isModuleHeader && !isParamOverride && next && (next.kind === 'num' || next.kind === 'id' || next.text === '(')) {
        warn(t.line, `Delay "#${next.text}${next.text === '(' ? '...)' : ''}" is ignored by Quartus synthesis; delays only exist in simulation.`);
      }
    } else if (t.kind === 'sys' && SIM_ONLY_TASKS.has(t.text)) {
      warn(t.line, `${t.text} only works in simulation; Quartus ignores it in a design file.`);
    } else if (t.text === 'initial') {
      const end = statementEnd(tokens, i + 1);
      const body = tokens.slice(i + 1, end + 1);
      const timed = body.some((b) => b.text === '#' || b.text === '@' || b.text === 'forever' || b.text === 'wait' || b.text === 'repeat');
      if (timed) {
        warn(t.line, 'This initial block uses timing (#, @, wait or loops) and will not be synthesised. Use it only in testbenches.');
      } else {
        warn(
          t.line,
          'initial block in a design file: Quartus only uses it to set power-up values of registers. Do not rely on it for logic or reset.',
          'info',
        );
      }
    } else if (t.kind === 'id' && SIM_ONLY_KEYWORDS[t.text]) {
      warn(t.line, `${SIM_ONLY_KEYWORDS[t.text]}; Quartus cannot synthesise it.`);
    }
  }
  return out;
}
