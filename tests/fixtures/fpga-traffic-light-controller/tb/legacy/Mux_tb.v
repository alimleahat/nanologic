// Mux TestBench Module
`timescale 1 ns/100 ps

module Mux_tb;

	reg A, B, sel;
	wire Y;

	// Device Under Test
	Mux dut (A, B, sel, Y);

initial begin
	// sel=0 cases
	A = 1'b0; B = 1'b0; sel = 1'b0; #10;
	A = 1'b1; B = 1'b0; sel = 1'b0; #10;
	A = 1'b0; B = 1'b1; sel = 1'b0; #10;

	// sel=1 cases
	A = 1'b0; B = 1'b0; sel = 1'b1; #10;
	A = 1'b0; B = 1'b1; sel = 1'b1; #10;
	A = 1'b1; B = 1'b0; sel = 1'b1; #10;
	$stop;

end

endmodule
