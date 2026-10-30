`timescale 1ns/1ps

// Testbench for the starter example. DIV is overridden to 4 so the counter
// steps every 4 clock cycles instead of every 25 million.
module top_tb;

    reg        clk = 1'b0;
    reg  [1:0] key = 2'b11;
    reg  [9:0] sw  = 10'd0;
    wire [9:0] ledr;
    wire [7:0] hex0, hex1, hex2, hex3, hex4, hex5;

    top #(.DIV(4)) dut (
        .MAX10_CLK1_50(clk), .KEY(key), .SW(sw), .LEDR(ledr),
        .HEX0(hex0), .HEX1(hex1), .HEX2(hex2), .HEX3(hex3), .HEX4(hex4), .HEX5(hex5)
    );

    always #10 clk = ~clk;          // 50 MHz

    initial begin
        key[0] = 1'b0;              // press reset
        #45 key[0] = 1'b1;          // release
        sw = 10'b1010101010;
        #400;
        $display("count = %0d, HEX0 = %b, LEDR = %b", dut.count, hex0, ledr);
        $stop;
    end

endmodule
