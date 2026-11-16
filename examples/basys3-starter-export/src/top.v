// NanoLogic starter example for the Digilent Basys 3 (experimental board support).
//  - Each slide switch lights the LED above it.
//  - The four-digit display shows a 16-bit counter in hex.
//    Press btnU to add one, press btnC to reset it to 0000.
//    With sw[15] up it also counts by itself (about 6 times a second on the real board).
//
// The four digits share one set of segment lines (seg, dp). Only one digit is
// enabled at a time (an is active-low), and the design switches between them
// fast enough that all four look lit: about every 0.66 ms on the real board.
// Port names match Digilent's master XDC, so pins are mapped automatically.
module top #(
    parameter REFRESH_BITS = 18,    // digit changes every 2^(REFRESH_BITS-2) clocks
    parameter AUTO_BITS    = 24     // auto-count every 2^AUTO_BITS clocks
) (
    input         clk,
    input  [15:0] sw,
    input         btnC,
    input         btnU,
    input         btnL,
    input         btnR,
    input         btnD,
    output [15:0] led,
    output [6:0]  seg,
    output        dp,
    output [3:0]  an
);

    assign led = sw;

    // Scan counter: its top two bits choose the digit being shown.
    reg [REFRESH_BITS-1:0] refresh = 0;
    always @(posedge clk)
        refresh <= refresh + 1'b1;

    wire [1:0] digit = refresh[REFRESH_BITS-1:REFRESH_BITS-2];

    // Button sampling once per scan period (about every 2.6 ms on the real
    // board): this also ignores short contact bounce.
    wire sample = (refresh == 0);
    reg  up_now = 1'b0, up_before = 1'b0;
    always @(posedge clk)
        if (sample) begin
            up_now    <= btnU;
            up_before <= up_now;
        end
    wire up_pressed = sample & up_now & ~up_before;

    // Auto-count divider.
    reg [AUTO_BITS-1:0] auto_div = 0;
    always @(posedge clk)
        auto_div <= auto_div + 1'b1;
    wire auto_tick = sw[15] & (auto_div == 0);

    // The counter.
    reg [15:0] count = 16'd0;
    always @(posedge clk)
        if (btnC)
            count <= 16'd0;
        else if (up_pressed | auto_tick)
            count <= count + 16'd1;

    // Pick the 4-bit digit for the enabled position and drive the shared segments.
    reg [3:0] nibble;
    always @(*)
        case (digit)
            2'd0:    nibble = count[3:0];
            2'd1:    nibble = count[7:4];
            2'd2:    nibble = count[11:8];
            default: nibble = count[15:12];
        endcase

    hex_to_7seg decoder (.digit(nibble), .seg(seg));
    assign dp = 1'b1;                       // decimal points off
    assign an = ~(4'b0001 << digit);        // enable one digit (active-low)

endmodule
