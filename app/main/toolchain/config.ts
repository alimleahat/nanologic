// Single place that decides which toolchain runs and how. Everything here runs
// inside the app as WebAssembly, so students never need a compiler installed.
// See docs/toolchain-decision.md.

export const TOOLCHAIN = {
  yosys: {
    /** npm package providing Yosys compiled to WebAssembly (YoWASP). */
    packageName: '@yowasp/yosys',
    /** Yosys frontend flags. Plain Verilog-2005 (a superset of the course's Verilog-2001). */
    readVerilogFlags: [] as string[],
  },
  iverilog: {
    /** npm package providing Icarus Verilog (ivlpp, ivl, vvp) compiled to WebAssembly. */
    packageName: '@veriflow/iverilog-wasm',
    /** Language generation passed to iverilog (-g). */
    generation: '2005' as const,
  },
  simulation: {
    /** Default maximum simulated time in nanoseconds, after which the run is stopped. */
    defaultMaxTimeNs: 1_000_000,
    /** Wall-clock limit for one simulation run. */
    timeoutMs: 60_000,
    /** Name of the VCD file produced inside the virtual workspace. */
    vcdName: 'nanologic_wave.vcd',
  },
  analysis: {
    timeoutMs: 60_000,
  },
} as const;
