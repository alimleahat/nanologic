// Turn Icarus Verilog and Yosys output into Messages.
import type { Message, MessageSource } from '../../shared/messages';
import { stripAnsi } from '../../shared/messages';

export function parseIverilogOutput(
  output: string,
  toDisplay: (virt: string) => string,
  source: MessageSource,
  opts: { runtime?: boolean; hidden?: (line: string) => boolean } = {},
): Message[] {
  const messages: Message[] = [];
  // Join continuation lines (": -Wtimescale to find ...") onto the previous line.
  const lines: string[] = [];
  for (const raw of stripAnsi(output).split(/\r?\n/)) {
    if (/^\s*: /.test(raw) && lines.length && !/^.+?:\d+:/.test(raw)) lines[lines.length - 1] += ' ' + raw.replace(/^\s*:\s*/, '');
    else lines.push(raw);
  }
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (opts.hidden?.(line)) continue;
    if (/^I give up\.?$/.test(line) || /^\d+ error\(s\) during elaboration\.$/.test(line)) continue;
    if (/^VCD info: dumpfile/.test(line)) continue;
    let m = /^(.+?):(\d+): (error|warning|sorry): (.*)$/i.exec(line);
    if (m) {
      messages.push({
        severity: m[3].toLowerCase() === 'warning' ? 'warning' : 'error',
        text: m[3].toLowerCase() === 'sorry' ? `Not supported: ${m[4]}` : m[4],
        file: toDisplay(m[1]),
        line: Number(m[2]),
        source,
      });
      continue;
    }
    m = /^(.+?):(\d+): (syntax error|Syntax in assignment statement l-value\.|.*error.*)$/i.exec(line);
    if (m && !/\$finish|\$stop/.test(line)) {
      messages.push({ severity: 'error', text: m[3], file: toDisplay(m[1]), line: Number(m[2]), source });
      continue;
    }
    m = /^(.+?):(\d+):\s*:?\s*(.*)$/.exec(line);
    if (m && /\.s?v$/i.test(m[1])) {
      const text = m[3] || line;
      messages.push({
        severity: opts.runtime ? 'info' : /warning/i.test(text) ? 'warning' : 'info',
        text,
        file: toDisplay(m[1]),
        line: Number(m[2]),
        source,
      });
      continue;
    }
    if (/^VCD warning/i.test(line) || /^WARNING:/i.test(line)) {
      messages.push({ severity: 'warning', text: line.replace(/^warning:\s*/i, ''), source });
      continue;
    }
    if (/^ERROR:/.test(line)) {
      messages.push({ severity: 'error', text: line.replace(/^ERROR:\s*/, ''), source });
      continue;
    }
    messages.push({ severity: 'info', text: line.trim(), source });
  }
  return messages;
}

/** Find "file.v:12" or "$proc$file.v:12$" references to staged files inside Yosys text. */
function findLocation(text: string, virts: string[], toDisplay: (v: string) => string): { file?: string; line?: number } {
  for (const v of virts) {
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|[\\s\`'$/])${esc}:(\\d+)`).exec(text);
    if (m) return { file: toDisplay(v), line: Number(m[1]) };
  }
  return {};
}

export function parseYosysLog(log: string, virts: string[], toDisplay: (v: string) => string, source: MessageSource): Message[] {
  const messages: Message[] = [];
  const lines = stripAnsi(log).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    let m = /^(.+?):(\d+)(?:\.\d+(?:-\d+\.\d+)?)?: (ERROR|Warning): (.*)$/.exec(line);
    if (m) {
      messages.push({
        severity: m[3] === 'ERROR' ? 'error' : 'warning',
        text: tidyYosys(m[4]),
        file: toDisplay(m[1]),
        line: Number(m[2]),
        source,
      });
      continue;
    }
    m = /^(ERROR|Warning): (.*)$/.exec(line);
    if (m) {
      let text = m[2];
      // Some messages continue on indented lines.
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
      const loc = findLocation(text, virts, toDisplay);
      messages.push({ severity: m[1] === 'ERROR' ? 'error' : 'warning', text: tidyYosys(text), ...loc, source });
    }
  }
  return messages;
}

/** Make Yosys internal names more readable: `\foo' -> 'foo', drop $proc$ ids. */
export function tidyYosys(text: string): string {
  return text
    .replace(/`\\?([^']*)'/g, (_, s: string) => `'${s.replace(/\\/g, '')}'`)
    .replace(/\$proc\$[^']*?\$\d+/g, 'always block')
    .replace(/: \$auto\$[^\s]*$/, '')
    .replace(/\$auto\$[^\s']*/g, '(internal)');
}
