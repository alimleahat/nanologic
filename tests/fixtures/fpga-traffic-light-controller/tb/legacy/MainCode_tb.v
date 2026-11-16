// MainCode TestBench Module
`timescale 1 ns/100 ps

module MainCode_tb;

    reg CLK_50MHz;
    reg rst_n;
    reg pedestrian_btn;
    wire [6:0] HexH, HexL;
    wire Green, Red, Amber, LEDR9;

    // Device Under Test
    MainCode dut (CLK_50MHz, rst_n, pedestrian_btn, HexH, HexL, Green, Red, Amber, LEDR9);

initial begin

    CLK_50MHz = 1'b0;
    rst_n = 1'b0;
    pedestrian_btn = 1'b1;
    #50 rst_n = 1'b1;

    #2000;
    $stop;
end

// Clock generation
always #10 CLK_50MHz = ~CLK_50MHz;

endmodule
