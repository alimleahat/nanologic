// This is the Binary to BCD Module.
// Converts a 4 bit binary input to two 4 bit BCD digits

module BinaryBCD (
    input [3:0] Count,
    output [3:0] BCD_H, BCD_L

);

wire A, B, C, D;

assign A = Count[3];
assign B = Count[2];
assign C = Count[1];
assign D = Count[0];

// Ones digit
assign BCD_L[0] = D;
assign BCD_L[1] = (~A & C) | (A & B & ~ C);
assign BCD_L[2] = (~A & B) | (B & C);
assign BCD_L[3] = (A & ~B & ~C);

// Tens digit
assign BCD_H[0] = (A & B) | (A & C);
assign BCD_H[1] = 1'b0;
assign BCD_H[2] = 1'b0;
assign BCD_H[3] = 1'b0;

endmodule
