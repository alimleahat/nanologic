// The board itself, laid out like the real hardware (no vendor artwork).
import type { BoardState } from '@shared/api';
import type { BoardOutputLevels } from '@shared/netsim/boardEngine';
import { setBoardInputs } from '../state/actions';
import { boardFrameStyle, Led, PushButton, SevenSegDigit, Switch } from './parts';

interface PanelProps {
  started: boolean;
  state?: BoardState;
  inputs: Record<string, number>;
}

const levelsOf = (out: BoardOutputLevels, name: string, n: number) => out[name] ?? Array<null>(n).fill(null);
const bit = (v: number | undefined, i: number) => ((v ?? 0) >> i) & 1;
const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, k) => from - k);

/** Terasic DE10-Lite: six HEX displays left, LEDs above switches, KEY1/KEY0 on the right edge. */
export function De10LitePanel({ started, state, inputs }: PanelProps) {
  const out = state?.outputs ?? {};
  const SW = inputs.SW ?? 0;
  const KEY = inputs.KEY ?? 0b11;
  return (
    <div style={boardFrameStyle(started)} data-testid="board">
      <div className="row" style={{ gap: 6 }}>
        {range(5, 0).map((i) => {
          const levels = levelsOf(out, `HEX${i}`, 8);
          // Common anode: a segment is lit when its bit is 0.
          return (
            <SevenSegDigit
              key={i}
              label={`HEX${i}`}
              testId={`board-HEX${i}`}
              brightness={levels.map((l) => (l === 0 ? 1 : 0))}
              data={{ levels: levels.map((l) => (l === null ? '-' : l)).join('') }}
            />
          );
        })}
      </div>
      <div style={{ flex: 1 }}>
        <div className="row" style={{ gap: 4, marginBottom: 16 }}>
          {range(9, 0).map((i) => (
            <Led key={i} label={String(i)} testId={`board-LEDR${i}`} lit={levelsOf(out, 'LEDR', 10)[i] === 1} />
          ))}
        </div>
        <div className="row" style={{ gap: 4 }}>
          {range(9, 0).map((i) => (
            <Switch key={i} label={`SW${i}`} testId={`board-SW${i}`} up={bit(SW, i) === 1} onToggle={() => setBoardInputs({ SW: SW ^ (1 << i) })} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 0].map((i) => (
          <PushButton
            key={i}
            label={`KEY${i}`}
            testId={`board-KEY${i}`}
            hint="reads 0 while pressed"
            pressed={bit(KEY, i) === 0}
            onPress={(down) => setBoardInputs({ KEY: down ? KEY & ~(1 << i) : KEY | (1 << i) })}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Digilent Basys 3: four-digit multiplexed display on the left, 16 LEDs above
 * 16 switches, five buttons in a cross on the right.
 */
export function Basys3Panel({ started, state, inputs }: PanelProps) {
  const out = state?.outputs ?? {};
  const sw = inputs.sw ?? 0;
  const display = state?.display;
  const button = (name: string) => (
    <PushButton
      label={name}
      testId={`board-${name}`}
      hint="reads 1 while pressed"
      pressed={bit(inputs[name], 0) === 1}
      onPress={(down) => setBoardInputs({ [name]: down ? 1 : 0 })}
    />
  );
  return (
    <div style={boardFrameStyle(started)} data-testid="board">
      <div>
        <div className="row" style={{ gap: 6 }} data-testid="board-display" data-mode={display?.mode ?? 'off'}>
          {range(3, 0).map((d) => {
            const b = display?.digits[d] ?? Array<number>(8).fill(0);
            return <SevenSegDigit key={d} label={`AN${d}`} testId={`board-digit${d}`} brightness={b} data={{ brightness: b.join(',') }} />;
          })}
        </div>
        <div className="secondary" style={{ fontSize: 11, marginTop: 6, maxWidth: 240, lineHeight: 1.4 }}>
          {display?.mode === 'persistence'
            ? 'Shared segments: what your eye would see over 10 ms of board time.'
            : 'Slow clock: showing the digit that is enabled right now. Use Max to see the scanned display.'}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div className="row" style={{ gap: 2, marginBottom: 16 }}>
          {range(15, 0).map((i) => (
            <Led key={i} label={String(i)} testId={`board-led${i}`} lit={levelsOf(out, 'led', 16)[i] === 1} />
          ))}
        </div>
        <div className="row" style={{ gap: 2 }}>
          {range(15, 0).map((i) => (
            <Switch key={i} label={`SW${i}`} testId={`board-sw${i}`} up={bit(sw, i) === 1} onToggle={() => setBoardInputs({ sw: sw ^ (1 << i) })} />
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 48px)', gridTemplateRows: 'repeat(3, auto)', gap: 4, justifyItems: 'center' }}>
        <div />
        {button('btnU')}
        <div />
        {button('btnL')}
        {button('btnC')}
        {button('btnR')}
        <div />
        {button('btnD')}
        <div />
      </div>
    </div>
  );
}
