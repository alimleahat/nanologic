// Combinational case statement (the default avoids an unwanted latch)
always @(*) begin
    case (sel)
        2'd0:    y = a;
        2'd1:    y = b;
        2'd2:    y = c;
        default: y = d;
    endcase
end
