// CoreLogic TestBench Module
`timescale 1 ns/100 ps

module CoreLogic_tb;

    reg CLK;
    reg rst_n;
    reg pedestrian_btn;
    wire [5:0] ControlSignal;
    wire LEDR9;
    wire extend;

    // Device Under Test
    CoreLogic dut (CLK, rst_n, pedestrian_btn, ControlSignal, LEDR9, extend);

initial begin

    CLK = 1'b0;
    rst_n = 1'b0;
    pedestrian_btn = 1'b1;
    #50 rst_n = 1'b1;

	 // Press pedestrian button mid Red
	 #50 pedestrian_btn = 1'b0;
	 #20 pedestrian_btn = 1'b1;

    #350;

    // Press pedestrian button mid Green
    pedestrian_btn = 1'b0; #20
	 pedestrian_btn = 1'b1;

    // Run for another full cycle
    #600;

    $stop;
end

// Clock generation
always #10 CLK = ~CLK;

endmodule
