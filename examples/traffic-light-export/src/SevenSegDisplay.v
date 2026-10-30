// This is the Seven Segment Display Module
// Converts a 4-bit binary count into two 7 seg displays via BCD

module SevenSegDisplay(

	input [3:0] Count,
	output [6:0] SevenSegH,
	output [6:0] SevenSegL

);

wire [3:0] BCD_H, BCD_L;

BinaryBCD bcd (Count, BCD_H, BCD_L);

BCD7Seg H (BCD_H, SevenSegH);

BCD7Seg L (BCD_L, SevenSegL);




endmodule
