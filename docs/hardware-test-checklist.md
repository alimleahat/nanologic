# Hardware test checklist (lab)

Tick each step. If a step fails, stop that section, fill in a row of the failure log at the bottom, and carry on with the next section.

## Before the lab (on your Mac)

1. Get the `dev` branch (or download it as a ZIP from GitHub) and copy these folders to a USB stick:
   - `examples/traffic-light-export/` (DE10-Lite, Quartus)
   - `examples/basys3-starter-export/` (Basys 3, Vivado)
2. In NanoLogic, open **Home > Starter: counter and switches**, then **Export to Quartus**, level 3. Copy the `starter_quartus` folder to the stick.
3. Same starter, decimal-point test: in `top.v` change `assign HEX0[7] = 1'b1;` to `1'b0;`, save, export level 3 into a different folder, and copy it as `starter_dp_quartus`. Undo the change afterwards.

## DE10-Lite with Quartus Prime Lite 17.1

| # | Step | Pass if |
|---|---|---|
| D1 | **Help > About Quartus Prime**: write down the exact version. | (record it) |
| D2 | **File > Open Project**: `traffic_light.qpf`. **Assignments > Device**. | Family MAX 10, device `10M50DAF484C7G`. |
| D3 | **Processing > Start Compilation**. | 0 errors. No errors about pins or I/O standards. (A timing warning that `CLK_1Hz` is an unconstrained clock is expected: note it, not a failure.) |
| D4 | **Assignments > Pin Planner**: check `pedestrian_btn`, `rst_n`, `CLK_50MHz`. | `PIN_B8` and `PIN_A7` with I/O standard **3.3 V Schmitt Trigger**; `PIN_P11` with **3.3-V LVTTL**. |
| D5 | **Tools > Programmer**, USB-Blaster, add `output_files/traffic_light.sof`, **Start**. | Progress 100% (Successful). |
| D6 | Watch the board. | LEDR0 (red) lights first; phases red ~10 s → amber ~3 s (LEDR1) → green ~10 s (LEDR2) → amber → red; HEX1/HEX0 count down. |
| D7 | Press KEY0 (pedestrian) during green. | LEDR9 lights; the next red lasts ~15 s; LEDR9 goes off. |
| D8 | Hold KEY1 (reset). | Lamps and countdown restart from red. |
| D9 | Open, compile and program `starter_quartus/starter.qpf`. | Each switch lights the LED above it; HEX0 counts 0-F about twice a second; holding KEY0 shows 0. Segments look right (a "1" lights the two right-hand segments). |
| D10 | Open, compile and program `starter_dp_quartus`. | Record whether HEX0's **decimal point lights** (yes/no). The manual is unclear on this. |

## Basys 3 with Vivado (support is experimental)

| # | Step | Pass if |
|---|---|---|
| B1 | **Help > About Vivado**: write down the exact version. | (record it) |
| B2 | **Tools > Run Tcl Script**: choose `basys3-starter-export/create_project.tcl`. | Tcl Console ends with "NanoLogic: project created". Part `xc7a35tcpg236-1`; `top` shown in bold as top module; `basys3_starter.xdc` under Constraints. |
| B3 | **Generate Bitstream** (accept running synthesis and implementation). | Completes. 0 critical warnings about ports, I/O standards or `PACKAGE_PIN`. **Report Timing Summary**: WNS ≥ 0 ns, clock `sys_clk_pin` 10.000 ns. |
| B4 | **Open Hardware Manager > Open Target > Auto Connect > Program Device** (`top.bit`). | Programs without error. |
| B5 | Switches. | Each switch lights the LED above it; sw0 lights LD0 (rightmost). |
| B6 | Display. | Shows `0000`, steady: no flicker, no faint "ghost" segments. |
| B7 | Press btnU 10 times, slowly. | Shows `000A`: exactly one step per press (no bounce double-counts). |
| B8 | Press btnC. | Back to `0000`. |
| B9 | Flip sw15 up for ~5 s, then down. | Counts by itself about 6 times a second, stops when down. The rightmost digit changes fastest (`an[0]` = rightmost). |
| B10 | Look at the decimal points. | All off. |

## Failure log

For each failure, record:

| Field | What to write |
|---|---|
| Step | e.g. D3 |
| Tool version | from D1 / B1 |
| What happened | the exact message text (copy and paste it, or photograph the screen), or what the board did instead |
| Which pins/signals | e.g. "LEDR1 stays off", "digit 2 flickers" |
| Files | attach the `.qsf`/`.xdc` used and, for compile failures, the report: Quartus `output_files/*.fit.rpt`, Vivado `vivado/*.runs/impl_1/*_utilization_placed.rpt` and the Messages tab |
| Photo/video | for display problems, a short phone video helps (flicker is hard to describe) |
