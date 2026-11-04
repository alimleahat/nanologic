// This is the test bench for the CounterUnit module
`timescale 1 ns/100 ps

module CounterUnit_tb;

	reg CLK;
	reg [3:0] Setting;
	reg rst_n;
	wire [3:0] Count;

	// Device Under Test
	CounterUnit dut (CLK, Setting, rst_n, Count);

// Simulate for 1050 time units, and hold reset for 50 time units.
// Setting is 9 for 550 time units and is 2 for another 500.
initial begin
	CLK = 1'b0;
	rst_n = 1'b0;
	Setting = 4'b1001;
	#50 rst_n = 1'b1;
	#500 Setting = 4'b0010;
	#500 $stop;
end

// Clock Generation
always #10 CLK = ~CLK;

endmodule
