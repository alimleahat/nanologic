// Decoder TestBench Module
`timescale 1 ns/100 ps

module Decoder_tb;

    reg [5:0] ControlSignal;
    reg extend;
    wire [3:0] Count;
    wire Green, Red, Amber;

    // Device Under Test
    Decoder dut (ControlSignal, extend, Count, Green, Red, Amber);

initial begin

    ControlSignal = 6'b000000; extend = 1'b0; #10;
    ControlSignal = 6'b000101; extend = 1'b0; #10;
    ControlSignal = 6'b000000; extend = 1'b1; #10;
    ControlSignal = 6'b010000; extend = 1'b0; #10;
    ControlSignal = 6'b100000; extend = 1'b0; #10;
    ControlSignal = 6'b110001; extend = 1'b0; #10;
    $stop;

end

endmodule
