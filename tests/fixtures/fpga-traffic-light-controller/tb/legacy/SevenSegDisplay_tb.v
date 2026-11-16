// SevenSegDisplay TestBench Module
`timescale 1 ns/100 ps

module SevenSegDisplay_tb;

    reg [3:0] Count;
    wire [6:0] SevenSegH, SevenSegL;

    // Device Under Test
    SevenSegDisplay dut (Count, SevenSegH, SevenSegL);

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
