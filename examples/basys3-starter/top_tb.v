`timescale 1ns/1ps

// Testbench for the Basys 3 starter. The scan and auto-count dividers are made
// tiny so a few microseconds of simulation show the digits being scanned.
module top_tb;

    reg         clk = 1'b0;
    reg  [15:0] sw  = 16'd0;
    reg         btnC = 1'b0, btnU = 1'b0, btnL = 1'b0, btnR = 1'b0, btnD = 1'b0;
    wire [15:0] led;
    wire [6:0]  seg;
    wire        dp;
    wire [3:0]  an;

    top #(.REFRESH_BITS(4), .AUTO_BITS(6)) dut (
        .clk(clk), .sw(sw), .btnC(btnC), .btnU(btnU), .btnL(btnL), .btnR(btnR), .btnD(btnD),
        .led(led), .seg(seg), .dp(dp), .an(an)
    );

    always #5 clk = ~clk;           // 100 MHz

    initial begin
        sw = 16'h8001;              // auto-count on, LED 0 and 15 lit
        #2000;
        $display("count = %0d, led = %h, an = %b, seg = %b", dut.count, led, an, seg);
        btnC = 1'b1;
        #50 btnC = 1'b0;
        $display("after reset: count = %0d", dut.count);
        $stop;
    end

endmodule
