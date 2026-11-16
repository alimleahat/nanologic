// Testbench for Subtractor
`timescale 1 ns/100 ps

module Subtractor_tb;
    reg [3:0] a, b;
    wire [3:0] y;


    Subtractor dut(a, b, y);


    initial begin
        a = 4'b1010; b = 4'b0000; #10;
        a = 4'b1010; b = 4'b1001; #10;
        a = 4'b0011; b = 4'b0000; #10;
        a = 4'b0011; b = 4'b0010; #10;
        $stop;
    end

endmodule
