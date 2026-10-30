// Top-level module for the Terasic DE10-Lite board.
// The port names match the board's own signal names, so NanoLogic connects
// them to the right pins automatically.
module {{TOP}} (
    input        MAX10_CLK1_50, // 50 MHz clock
    input  [1:0] KEY,           // push buttons: 0 while pressed
    input  [9:0] SW,            // slide switches: 1 when up
    output [9:0] LEDR,          // red LEDs: lit when 1
    output [7:0] HEX0,          // 7-segment displays: a segment is lit when its bit is 0
    output [7:0] HEX1,          // bit 0 = top, 1 = top-right, 2 = bottom-right, 3 = bottom,
    output [7:0] HEX2,          // 4 = bottom-left, 5 = top-left, 6 = middle, 7 = decimal point
    output [7:0] HEX3,
    output [7:0] HEX4,
    output [7:0] HEX5
);

    // Each LED shows the switch below it.
    assign LEDR = SW;

    // All segments off.
    assign HEX0 = 8'hFF;
    assign HEX1 = 8'hFF;
    assign HEX2 = 8'hFF;
    assign HEX3 = 8'hFF;
    assign HEX4 = 8'hFF;
    assign HEX5 = 8'hFF;

endmodule
