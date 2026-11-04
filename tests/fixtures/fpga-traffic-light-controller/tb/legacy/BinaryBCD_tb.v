// BinaryBCD TestBench Module
`timescale 1 ns/100 ps

module BinaryBCD_tb;

    reg [3:0] Count;
    wire [3:0] BCD_H, BCD_L;

    // Device Under Test
    BinaryBCD dut (Count, BCD_H, BCD_L);

initial begin

    Count = 4'd0;  #10;
    Count = 4'd5;  #10;
    Count = 4'd9;  #10;
    Count = 4'd10; #10;
    Count = 4'd13; #10;
    Count = 4'd15; #10;
    $stop;

end

endmodule
