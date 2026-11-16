// This is the One Bit Full Adder Module

module OneBitFullAdder(
	input a,
	input b,
	input c_in,
	output sum,
	output c_out
);

	wire [2:0] w;

	assign w[0] = a ^ b;
	assign sum = w[0] ^ c_in;
	assign w[1] = c_in & w[0];
	assign w[2] = a & b;
	assign c_out = w[1] | w[2];

endmodule
