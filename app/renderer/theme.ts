// Design tokens: every colour, size and spacing used by the UI. The app is
// expected to be redesigned later; change values here, not in components.
export const tokens = {
  color: {
    bg: '#ffffff',
    bgSubtle: '#f6f6f6',
    bgHover: '#efefef',
    bgSelected: '#e6e6e6',
    text: '#000000',
    textSecondary: '#5c5c5c',
    textDisabled: '#a0a0a0',
    border: '#d4d4d4',
    borderStrong: '#000000',
    focus: '#000000',
    // Colour only where it carries meaning.
    error: '#c62828',
    warning: '#b26a00',
    success: '#2e7d32',
    running: '#000000',
    ledOn: '#e0201b',
    ledOff: '#e9e2e2',
    segOn: '#e0201b',
    segOff: '#efe9e9',
    boardBg: '#fafafa',
    waveLine: '#000000',
    waveBus: '#000000',
    waveX: '#c62828',
    waveZ: '#b26a00',
    waveCursor: '#c62828',
    waveGrid: '#ececec',
  },
  font: {
    ui: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
    sizeXs: '11px',
    sizeSm: '12px',
    sizeMd: '13px',
    sizeLg: '15px',
    sizeXl: '20px',
  },
  space: {
    xxs: '2px',
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
  },
  size: {
    menuBar: '28px',
    toolbar: '40px',
    tabBar: '32px',
    statusBar: '24px',
    panelHeader: '28px',
    borderWidth: '1px',
    radius: '2px',
    rowHeight: '24px',
  },
  shadow: {
    popup: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
} as const;

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** CSS custom properties for the tokens, e.g. --color-text-secondary. */
export function tokensToCss(): string {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(tokens)) {
    for (const [k, v] of Object.entries(values)) lines.push(`--${group}-${kebab(k)}: ${v};`);
  }
  return `:root {\n  ${lines.join('\n  ')}\n}`;
}
