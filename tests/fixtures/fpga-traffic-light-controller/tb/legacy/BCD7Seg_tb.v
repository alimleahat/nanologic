// BCD7Seg TestBench Module
`timescale 1 ns/100 ps

module BCD7Seg_tb;

    reg [3:0] BCD;
    wire [6:0] out;

    // Device Under Test
    BCD7Seg dut (BCD, out);

initial begin

    BCD = 4'd0;  #10;
    BCD = 4'd5;  #10;
    BCD = 4'd9;  #10;
    BCD = 4'd10; #10;
    BCD = 4'd13; #10;
    BCD = 4'd15; #10;
    $stop;

end

endmodule
