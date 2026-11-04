# Pin assignments for basys3_starter

Board: Digilent Basys 3 (Artix-7 xc7a35tcpg236-1). Top-level entity: `top`.

**Experimental - not yet verified on hardware.**

Add these to an .xdc constraints file in Vivado, or use the full project export (level 3), which writes the .xdc for you.

| Port | Direction | Board signal | Pin | I/O standard | Level |
| --- | --- | --- | --- | --- | --- |
| clk | input | clk | W5 | LVCMOS33 | 100 MHz clock |
| sw[0] | input | sw[0] | V17 | LVCMOS33 | 1 when up |
| sw[1] | input | sw[1] | V16 | LVCMOS33 | 1 when up |
| sw[2] | input | sw[2] | W16 | LVCMOS33 | 1 when up |
| sw[3] | input | sw[3] | W17 | LVCMOS33 | 1 when up |
| sw[4] | input | sw[4] | W15 | LVCMOS33 | 1 when up |
| sw[5] | input | sw[5] | V15 | LVCMOS33 | 1 when up |
| sw[6] | input | sw[6] | W14 | LVCMOS33 | 1 when up |
| sw[7] | input | sw[7] | W13 | LVCMOS33 | 1 when up |
| sw[8] | input | sw[8] | V2 | LVCMOS33 | 1 when up |
| sw[9] | input | sw[9] | T3 | LVCMOS33 | 1 when up |
| sw[10] | input | sw[10] | T2 | LVCMOS33 | 1 when up |
| sw[11] | input | sw[11] | R3 | LVCMOS33 | 1 when up |
| sw[12] | input | sw[12] | W2 | LVCMOS33 | 1 when up |
| sw[13] | input | sw[13] | U1 | LVCMOS33 | 1 when up |
| sw[14] | input | sw[14] | T1 | LVCMOS33 | 1 when up |
| sw[15] | input | sw[15] | R2 | LVCMOS33 | 1 when up |
| btnC | input | btnC | U18 | LVCMOS33 | 1 while pressed |
| btnU | input | btnU | T18 | LVCMOS33 | 1 while pressed |
| btnL | input | btnL | W19 | LVCMOS33 | 1 while pressed |
| btnR | input | btnR | T17 | LVCMOS33 | 1 while pressed |
| btnD | input | btnD | U17 | LVCMOS33 | 1 while pressed |
| led[0] | output | led[0] | U16 | LVCMOS33 | lit when 1 |
| led[1] | output | led[1] | E19 | LVCMOS33 | lit when 1 |
| led[2] | output | led[2] | U19 | LVCMOS33 | lit when 1 |
| led[3] | output | led[3] | V19 | LVCMOS33 | lit when 1 |
| led[4] | output | led[4] | W18 | LVCMOS33 | lit when 1 |
| led[5] | output | led[5] | U15 | LVCMOS33 | lit when 1 |
| led[6] | output | led[6] | U14 | LVCMOS33 | lit when 1 |
| led[7] | output | led[7] | V14 | LVCMOS33 | lit when 1 |
| led[8] | output | led[8] | V13 | LVCMOS33 | lit when 1 |
| led[9] | output | led[9] | V3 | LVCMOS33 | lit when 1 |
| led[10] | output | led[10] | W3 | LVCMOS33 | lit when 1 |
| led[11] | output | led[11] | U3 | LVCMOS33 | lit when 1 |
| led[12] | output | led[12] | P3 | LVCMOS33 | lit when 1 |
| led[13] | output | led[13] | N3 | LVCMOS33 | lit when 1 |
| led[14] | output | led[14] | P1 | LVCMOS33 | lit when 1 |
| led[15] | output | led[15] | L1 | LVCMOS33 | lit when 1 |
| seg[0] | output | seg[0] | W7 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[1] | output | seg[1] | W6 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[2] | output | seg[2] | U8 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[3] | output | seg[3] | V8 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[4] | output | seg[4] | U5 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[5] | output | seg[5] | V5 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| seg[6] | output | seg[6] | U7 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| dp | output | dp | V7 | LVCMOS33 | segment lit when 0 (active-low, shared by all digits) |
| an[0] | output | an[0] | U2 | LVCMOS33 | digit enabled when 0 (active-low) |
| an[1] | output | an[1] | U4 | LVCMOS33 | digit enabled when 0 (active-low) |
| an[2] | output | an[2] | V4 | LVCMOS33 | digit enabled when 0 (active-low) |
| an[3] | output | an[3] | W4 | LVCMOS33 | digit enabled when 0 (active-low) |
