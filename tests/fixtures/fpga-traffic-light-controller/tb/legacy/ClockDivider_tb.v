// This is the test bench for the ClockDivider module
`timescale 1 ns/100 ps

module ClockDivider_tb;
	//Input
	reg CLK_50MHz;
	reg rst_n;
	//Output
	wire CLK_1Hz;

	// Device Under Test
	ClockDivider dut (CLK_50MHz, rst_n, CLK_1Hz);

// Simulate for 1000 time units, and hold reset for 50 time units.
initial begin
	CLK_50MHz = 1'b0;
	rst_n = 1'b0;
	#50 rst_n = 1'b1;
	#1000 $stop;
end

// Clock Generation
always #10 CLK_50MHz = ~CLK_50MHz;

endmodule
