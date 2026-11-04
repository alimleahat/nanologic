export type Severity = 'error' | 'warning' | 'info';

export type MessageSource = 'analysis' | 'simulation' | 'board' | 'export' | 'project' | 'pins';

export interface Message {
  severity: Severity;
  text: string;
  /** Path relative to the project folder, with forward slashes. */
  file?: string;
  line?: number;
  column?: number;
  source: MessageSource;
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

export function countBySeverity(messages: Message[]): Record<Severity, number> {
  const c = { error: 0, warning: 0, info: 0 };
  for (const m of messages) c[m.severity]++;
  return c;
}
