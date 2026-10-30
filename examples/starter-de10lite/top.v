// NanoLogic starter example for the Terasic DE10-Lite.
//  - Each slide switch lights the red LED above it.
//  - HEX0 counts 0-F, one step every half second on the real board.
//  - Hold KEY[0] to reset the counter to 0.
// Port names match the board's signal names, so pins are mapped automatically.
module top #(
    parameter DIV = 25_000_000      // 50 MHz / 25,000,000 = 2 steps per second
) (
    input        MAX10_CLK1_50,
    input  [1:0] KEY,
    input  [9:0] SW,
    output [9:0] LEDR,
    output [7:0] HEX0,
    output [7:0] HEX1,
    output [7:0] HEX2,
    output [7:0] HEX3,
    output [7:0] HEX4,
    output [7:0] HEX5
);

    assign LEDR = SW;

    // Clock divider: "tick" is high for one clock cycle every DIV cycles.
    // On the virtual board, bypass "tick" (hold at 1) to step once per board clock.
    reg  [24:0] div_count;
    wire        tick = (div_count == DIV - 1);

    always @(posedge MAX10_CLK1_50 or negedge KEY[0]) begin
        if (!KEY[0])
            div_count <= 25'd0;
        else if (tick)
            div_count <= 25'd0;
        else
            div_count <= div_count + 25'd1;
    end

    // 4-bit counter shown on HEX0.
    reg [3:0] count;

    always @(posedge MAX10_CLK1_50 or negedge KEY[0]) begin
        if (!KEY[0])
            count <= 4'd0;
        else if (tick)
            count <= count + 4'd1;
    end

    hex_to_7seg digit0 (.digit(count), .seg(HEX0[6:0]));
    assign HEX0[7] = 1'b1;          // decimal point off

    // Other displays off (segments are lit when 0).
    assign HEX1 = 8'hFF;
    assign HEX2 = 8'hFF;
    assign HEX3 = 8'hFF;
    assign HEX4 = 8'hFF;
    assign HEX5 = 8'hFF;

endmodule
