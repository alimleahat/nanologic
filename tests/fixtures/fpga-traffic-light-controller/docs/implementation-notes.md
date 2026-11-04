# Implementation notes

## Signals and phase behavior

`rst_n` and `pedestrian_btn` are active low. `HexH` and `HexL` use active-low segment patterns; the lamp outputs and `LEDR9` are active high.

The phase encoding is `00` red, `01` amber, `10` green, and `11` amber. The counter includes zero, so terminal counts 9, 2, and 14 yield 10, 3, and 15 ticks. `ControlSignal[5:4]` carries the phase and `[3:0]` carries the elapsed count.

The pedestrian request is sampled on the divided clock's rising edge. It stays latched through other phases and extends red while active. It clears at the **end** of red when the button is released, despite the original comment saying it clears when entering red. A held button has priority over clearing. A request arriving exactly on the normal red transition edge can be deferred to the next red phase because the phase transition uses the pre-edge terminal comparison.

## Reproduction limits and improvements

- **Input handling:** no button synchronizer or debounce circuit is included. Short presses between 1 Hz sampling edges can be missed. A practical improvement is to synchronize and debounce at 50 MHz, then latch events.
- **Clocking:** control logic uses a fabric-divided clock. A single 50 MHz clock with a one-cycle enable would simplify clock routing and timing constraints.
- **Reset:** the divider uses synchronous reset; control and count registers use asynchronous reset. Reset release synchronization should be considered in a board implementation.
- **Display decoding:** `BCD7Seg` has no default branch for values 10–15. Its normal upstream BCD converter produces decimal digits, but standalone invalid inputs retain the previous pattern.
- **Timing and pins:** no explicit board pin locations, I/O standards, or SDC constraints were supplied. Archived timing includes negative setup and pulse-width slack. A successful fitter result is not evidence of timing closure.
- **Validation scope:** the author tested the design in ModelSim using the original Verilog stimulus testbenches. Results are inspected manually in waveforms. Full divider duration, physical button behavior, and timing closure require additional validation; no ModelSim rerun was performed during packaging.

## Build evidence

[Fitter summary](reports/fit.summary) and [timing summary](reports/sta.summary) are copied from the original `Final_Working/ELEC2665S2Project/output_files` directory. They describe the historical May 20, 2026 build, not a fresh build of this reorganized repository. Device utilization is 67 logic elements, 33 registers, and 21 pins.

## Packaging changes

The 14 RTL modules and 14 original testbenches are preserved apart from line-ending normalization, trailing whitespace cleanup, and final newlines. Quartus paths now reference `rtl/` and `tb/legacy/`; testbenches were removed from the synthesis source list and a duplicate malformed comparator testbench entry was removed. Generated databases, programmer images, editor backups, and local workspace files are excluded. The external report, student-number filenames, and large video are not part of this repository.
