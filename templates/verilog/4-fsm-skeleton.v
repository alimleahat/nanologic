// Finite state machine skeleton (Moore)
localparam [1:0] S_IDLE = 2'd0,
                 S_RUN  = 2'd1,
                 S_DONE = 2'd2;

reg [1:0] state, next_state;

// State register
always @(posedge clk or negedge rst_n) begin
    if (!rst_n)
        state <= S_IDLE;
    else
        state <= next_state;
end

// Next-state logic
always @(*) begin
    next_state = state;
    case (state)
        S_IDLE: if (start)  next_state = S_RUN;
        S_RUN:  if (finish) next_state = S_DONE;
        S_DONE:             next_state = S_IDLE;
        default:            next_state = S_IDLE;
    endcase
end

// Outputs
assign busy = (state == S_RUN);
