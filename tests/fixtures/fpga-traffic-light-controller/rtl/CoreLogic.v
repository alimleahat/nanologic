// Core Logic Module
// Tracks Phase, Setting and concatenates Count and Phase for the Decoder Module.

module CoreLogic (

	input CLK,
	input rst_n,
	input pedestrian_btn,
	output [5:0] ControlSignal,	//Do NOT modify this signal!
	output LEDR9,
	output extend

);

// Internal signals
reg [1:0] phase;
wire [3:0] Setting;
wire [3:0] Count;
wire count_match;

// pedestrian feature internal signals
reg ped;
wire phase_red;
wire mux_sel;
wire [3:0] red_setting;


//Pedestrian latch effect to Red phase only
assign phase_red = ~(phase[1] | phase[0]);
assign mux_sel = ped & phase_red;
assign extend = mux_sel;


// Selects 14 when extending red
Mux2Way4 ped_mux (4'd9, 4'd14, mux_sel, red_setting);
assign LEDR9 = ped;

// Counts up to Setting
CounterUnit Counter1 (CLK, Setting, rst_n, Count);

Comparator4 match_check (Count, Setting, count_match);

// Selects between Amber Setting or Red/Green Setting.
Mux2Way4 setting_mux (red_setting, 4'd2,phase[0], Setting);

// Concatenates phase (in top bits) and Count (in bottom bits).
assign ControlSignal = {phase, Count};

// Manages reset behaviour, shifts phase when Count matches Setting.
always @(posedge CLK or negedge rst_n) begin

	if (!rst_n) begin

		phase <= 2'b00;
		ped <= 1'b0;

	end

	else begin

		if (count_match) phase <= phase + 2'b01;

		// Sets ped when button is pressed, then clears when entering red.
		if (!pedestrian_btn) ped <= 1'b1;

		else if (count_match && phase == 2'b00) ped <= 1'b0;

	end

end

endmodule
