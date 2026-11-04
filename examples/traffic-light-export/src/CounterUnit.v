//Note: You MUST Build the CoreLogic Module using this submodule
//Note: This CounterUnit MUST count upwards!
// Counter that counts up from 0 to Setting, then wraps back to 0

module CounterUnit (

	input CLK,
	input [3:0] Setting,
	input rst_n,
	output reg [3:0] Count

);

wire match;
wire [3:0] countp1;
wire [3:0] next;
wire carry;

//Decide next count value
Comparator4 cmp (Count, Setting, match);

FourBitFullAdder inc (Count, 4'b0001, 1'b0, countp1, carry);

Mux2Way4 mux (countp1, 4'b0000, match, next);

// This block will execute on each rising edge.
// Async reset returns Count to 0
always @(posedge CLK or negedge rst_n) begin

    if (!rst_n) Count <= 4'b0000;
    else Count <= next;

end

endmodule
