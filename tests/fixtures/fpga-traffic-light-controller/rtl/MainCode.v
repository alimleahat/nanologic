// This is the MainCode Module
// Combines and manages the whole system

module MainCode (

	input CLK_50MHz,
	input rst_n,
	input pedestrian_btn,
	output [6:0] HexH,
	output [6:0] HexL,
	output Green,
	output Red,
	output Amber,
	output LEDR9

);

// Internal connectors between submodules
wire CLK_1Hz;
wire extend;
wire [5:0] ControlSignal;
wire [3:0] Count;

ClockDivider clkdiv (CLK_50MHz, rst_n, CLK_1Hz);
CoreLogic core (CLK_1Hz, rst_n, pedestrian_btn, ControlSignal, LEDR9, extend);
Decoder dec (ControlSignal, extend, Count, Green, Red, Amber);
SevenSegDisplay seven_seg (Count, HexH, HexL);


endmodule
