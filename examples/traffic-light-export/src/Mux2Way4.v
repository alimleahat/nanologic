// 4 bit 2 to 1 Mux Module

module Mux2Way4 (

	input [3:0] A,
	input [3:0] B,
	input sel,
	output [3:0] Y

);

// Use 4 Mux primitives, one for each bit position.
Mux m0 (A[0], B[0], sel, Y[0]);
Mux m1 (A[1], B[1], sel, Y[1]);
Mux m2 (A[2], B[2], sel, Y[2]);
Mux m3 (A[3], B[3], sel, Y[3]);


endmodule
