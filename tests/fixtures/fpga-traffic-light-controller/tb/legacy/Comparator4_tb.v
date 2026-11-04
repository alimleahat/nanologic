// Comparator4 TestBench Module
`timescale 1 ns/100 ps

module Comparator4_tb;

	reg [3:0] A, B;
	wire Y;

	// Device Under Test
	Comparator4 dut (A, B, Y);

initial begin
    A = 4'b0000; B = 4'b0000; #10;
    A = 4'b1010; B = 4'b1010; #10;
    A = 4'b1111; B = 4'b1111; #10;
    A = 4'b0000; B = 4'b0001; #10;
	 A = 4'b1010; B = 4'b1011; #10;
    A = 4'b1111; B = 4'b0000; #10;
	 A = 4'b0101; B = 4'b1010; #10;
    $stop;
end

endmodule
