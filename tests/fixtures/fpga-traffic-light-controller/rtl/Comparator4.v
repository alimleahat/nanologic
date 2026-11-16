// Standard Primitive Comparator Module

module Comparator4 (

	input [3:0] A, B,
	output Y

);

wire w1, w2, w3, w4;

assign w1 = A[0] ~^ B[0];
assign w2 = A[1] ~^ B[1];
assign w3 = A[2] ~^ B[2];
assign w4 = A[3] ~^ B[3];

assign Y = w1 & w2 & w3 & w4;


endmodule
