// This is the Subtractor Module

module Subtractor (

	input [3:0] A,
	input [3:0] B,
	output [3:0] Y


);

wire [3:0] notB;
wire out;

// Subtracts 4 bit B from 4 bit A

assign notB[0] = ~B[0];
assign notB[1] = ~B[1];
assign notB[2] = ~B[2];
assign notB[3] = ~B[3];


FourBitFullAdder sub (A, notB, 1'b1, Y, out);


endmodule
