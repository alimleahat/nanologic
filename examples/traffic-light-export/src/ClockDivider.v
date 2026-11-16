// In this module, we are dividing a 50MHz Clock to a 1Hz Clock


module ClockDivider(

	input CLK_50MHz,
	input rst_n,
	output reg CLK_1Hz

);

// Counter that ticks every input cycle, 25 bits to count up to 24.9 million

reg [24:0] count;


// This block will execute on each rising edge.
// It forces count and output to zero if reset is active.
// It wraps count to zero and toggles the output when count reaches a threshold.

always @ (posedge CLK_50MHz) begin

	if (!rst_n) begin

		count <= 4'b0000; CLK_1Hz <= 1'b0;

	end

	else if (count == 25'd24999999) begin

		count <= 25'd0; CLK_1Hz <= ~CLK_1Hz;

	end

	else count <= count + 25'd1;

end

endmodule
