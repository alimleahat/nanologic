// Testbench for OneBitFullAdder
// Tests all possible input combinations
`timescale 1 ns/100 ps

module OneBitFullAdder_tb;
    reg a, b, c_in;
    wire sum, c_out;

    // Device Under Test
    OneBitFullAdder dut (a, b, c_in, sum, c_out);

    initial begin
        a = 1'b0; b = 1'b0; c_in = 1'b0; #10;
        a = 1'b0; b = 1'b0; c_in = 1'b1; #10;
        a = 1'b0; b = 1'b1; c_in = 1'b0; #10;
        a = 1'b0; b = 1'b1; c_in = 1'b1; #10;
		  a = 1'b1; b = 1'b0; c_in = 1'b0; #10;
		  a = 1'b1; b = 1'b0; c_in = 1'b1; #10;
        a = 1'b1; b = 1'b1; c_in = 1'b0; #10;
		  a = 1'b1; b = 1'b1; c_in = 1'b1; #10;
        $stop;
    end

endmodule
