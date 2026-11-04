// Testbench for FourBitFullAdder
`timescale 1 ns/100 ps

module FourBitFullAdder_tb;
    reg [3:0] a, b;
    reg c_in;
    wire [3:0] sum;
    wire c_out;

    FourBitFullAdder dut(a, b, c_in, sum, c_out);


    initial begin
        a = 4'b0000; b = 4'b0000; c_in = 1'b0; #10;
        a = 4'b0000; b = 4'b0000; c_in = 1'b1; #10;
        a = 4'b0101; b = 4'b0011; c_in = 1'b1; #10;
        a = 4'b0111; b = 4'b1000; c_in = 1'b0; #10;
		  a = 4'b1111; b = 4'b0001; c_in = 1'b0; #10;
		  a = 4'b1111; b = 4'b1111; c_in = 1'b0; #10;
        $stop;
    end

endmodule
