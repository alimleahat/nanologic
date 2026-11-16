// Top-level module for the Digilent Basys 3 board.
// The port names match Digilent's master XDC, so NanoLogic connects them to
// the right pins automatically.
module {{TOP}} (
    input         clk,      // 100 MHz clock
    input  [15:0] sw,       // slide switches: 1 when up
    input         btnC,     // push buttons: 1 while pressed
    input         btnU,
    input         btnL,
    input         btnR,
    input         btnD,
    output [15:0] led,      // LEDs: lit when 1
    output [6:0]  seg,      // segments, shared by all four digits: lit when 0
                            // bit 0 = top, 1 = top-right, 2 = bottom-right, 3 = bottom,
                            // 4 = bottom-left, 5 = top-left, 6 = middle
    output        dp,       // decimal point: lit when 0
    output [3:0]  an        // digit enables: a digit is on when its bit is 0 (an[0] = rightmost)
);

    // Each LED shows the switch below it.
    assign led = sw;

    // Display off: all digits disabled, all segments off.
    // To show several digits, enable one digit at a time and switch quickly
    // between them (see the Basys 3 starter example).
    assign an  = 4'b1111;
    assign seg = 7'b1111111;
    assign dp  = 1'b1;

endmodule
