// This is the Decoder Module
// Splits the 6-bit ControlSignal into LED outputs and a countdown value for the display

module Decoder (

	input [5:0] ControlSignal,
	input extend,
	output [3:0] Count,			//in binary format!
	output Green,
	output Red,
	output Amber

);

// Phase Bits [5:4] for LEDs

wire notBit5, notBit4;
wire [3:0] val;

assign notBit5 = ~ControlSignal[5];
assign notBit4 = ~ControlSignal[4];

assign Red = notBit5 & notBit4;
assign Green = ControlSignal[5] & notBit4;
assign Amber = ControlSignal[4];

wire [3:0] extOrnot;


// Count Bits [3:0] swtich to count down.
Mux2Way4 mux1 (4'b1010, 4'b1111, extend, extOrnot);
Mux2Way4 mux2 (extOrnot, 4'b0011, ControlSignal[4], val);
Subtractor countdown (val, ControlSignal [3:0], Count);

endmodule
