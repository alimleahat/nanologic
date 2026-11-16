// Standard Primitive Mux Module

module Mux (

	input A,
	input	B,
	input sel,
	output Y

);

wire w1, w2, w3;

assign w1 = ~sel;
assign w2 = w1 & A;
assign w3 = sel & B;
assign Y = w2 | w3;

endmodule
