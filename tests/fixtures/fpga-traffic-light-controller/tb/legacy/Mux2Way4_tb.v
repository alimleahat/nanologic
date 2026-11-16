// Mux2Way4 TestBench Module
`timescale 1 ns/100 ps

module Mux2Way4_tb;

	reg [3:0] A, B;
	reg sel;
	wire [3:0] Y;

	// Device Under Test
	Mux2Way4 dut (A, B, sel, Y);

initial begin
	// sel=0 cases
	A = 4'b0100; B = 4'b1001; sel = 1'b0; #10;
	A = 4'b0000; B = 4'b1111; sel = 1'b0; #10;
	A = 4'b1111; B = 4'b0000; sel = 1'b0; #10;

	// sel=1 cases
	A = 4'b0100; B = 4'b1001; sel = 1'b1; #10;
	A = 4'b0000; B = 4'b1111; sel = 1'b1; #10;
	A = 4'b1111; B = 4'b0000; sel = 1'b1; #10;
	$stop;

end

endmodule
