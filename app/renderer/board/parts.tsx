// Building blocks for virtual boards: 7-segment digits, LEDs, switches, buttons.
import { tokens } from '../theme';

/** Segment polygons for a 7-segment digit in a 64x100 box; index = bit (0 = top ... 6 = middle). */
const SEGMENTS: string[] = [
  '12,6 48,6 42,12 18,12', // 0 top
  '50,8 50,47 44,43 44,14', // 1 top-right
  '50,53 50,92 44,86 44,57', // 2 bottom-right
  '12,94 48,94 42,88 18,88', // 3 bottom
  '10,53 16,57 16,86 10,92', // 4 bottom-left
  '10,8 16,14 16,43 10,47', // 5 top-left
  '12,50 18,46 42,46 48,50 42,54 18,54', // 6 middle
];

/**
 * One 7-segment digit. `brightness` has 8 values (segments 0-6, then the
 * decimal point) from 0 (off) to 1 (fully lit); in-between values show the
 * dimmer glow of a segment that is only on part of the time.
 */
export function SevenSegDigit({
  label,
  brightness,
  testId,
  data,
}: {
  label: string;
  brightness: number[];
  testId: string;
  data?: Record<string, string>;
}) {
  const c = tokens.color;
  const seg = (i: number, shape: React.ReactNode) => (
    <g key={i} data-seg={i} data-lit={brightness[i] >= 0.5 ? 1 : 0} data-brightness={brightness[i]}>
      {shape}
    </g>
  );
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]));
  return (
    <div style={{ textAlign: 'center' }} data-testid={testId} {...dataAttrs}>
      <svg width="54" height="86" viewBox="0 0 64 100" style={{ background: '#fff', border: `1px solid ${c.border}` }}>
        {SEGMENTS.map((pts, i) =>
          seg(
            i,
            <>
              <polygon points={pts} fill={c.segOff} />
              {brightness[i] > 0 && <polygon points={pts} fill={c.segOn} fillOpacity={brightness[i]} />}
            </>,
          ),
        )}
        {seg(
          7,
          <>
            <circle cx="57" cy="92" r="4" fill={c.segOff} />
            {brightness[7] > 0 && <circle cx="57" cy="92" r="4" fill={c.segOn} fillOpacity={brightness[7]} />}
          </>,
        )}
      </svg>
      <div className="mono secondary" style={{ fontSize: 11 }}>
        {label}
      </div>
    </div>
  );
}

export function Led({ label, lit, testId }: { label: string; lit: boolean; testId: string }) {
  return (
    <div style={{ textAlign: 'center', width: 30 }}>
      <div
        data-testid={testId}
        data-lit={lit ? 1 : 0}
        style={{
          width: 14,
          height: 22,
          margin: '0 auto',
          borderRadius: 2,
          border: `1px solid ${tokens.color.border}`,
          background: lit ? tokens.color.ledOn : tokens.color.ledOff,
        }}
      />
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export function Switch({ label, up, onToggle, testId }: { label: string; up: boolean; onToggle: () => void; testId: string }) {
  return (
    <div style={{ textAlign: 'center', width: 30 }}>
      <button
        data-testid={testId}
        data-up={up ? 1 : 0}
        onClick={onToggle}
        title={`${label}: ${up ? 'up (1)' : 'down (0)'} - click to toggle`}
        style={{
          width: 18,
          height: 40,
          padding: 0,
          border: `1px solid ${tokens.color.borderStrong}`,
          borderRadius: 2,
          background: '#fff',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            height: 16,
            top: up ? 2 : 20,
            background: tokens.color.text,
            borderRadius: 1,
          }}
        />
      </button>
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export function PushButton({
  label,
  pressed,
  onPress,
  testId,
  hint,
}: {
  label: string;
  pressed: boolean;
  onPress: (down: boolean) => void;
  testId: string;
  hint: string;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <button
        data-testid={testId}
        data-pressed={pressed ? 1 : 0}
        onMouseDown={() => onPress(true)}
        onMouseUp={() => onPress(false)}
        onMouseLeave={() => pressed && onPress(false)}
        title={`${label}: hold to press (${hint})`}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1px solid ${tokens.color.borderStrong}`,
          background: pressed ? tokens.color.bgSelected : '#fff',
          boxShadow: pressed ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : 'none',
          cursor: 'pointer',
        }}
      />
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export const boardFrameStyle = (started: boolean): React.CSSProperties => ({
  margin: 16,
  padding: 20,
  border: `1px solid ${tokens.color.borderStrong}`,
  background: tokens.color.boardBg,
  display: 'flex',
  alignItems: 'flex-end',
  gap: 32,
  minWidth: 900,
  opacity: started ? 1 : 0.55,
});
