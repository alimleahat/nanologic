// Picks the exporter for the project's board: Quartus for Intel boards,
// Vivado for Xilinx boards.
import { generateExport, type ExportInput, type ExportOutput } from './quartusExport';
import { generateVivadoExport } from './vivadoExport';

export function generateBoardExport(input: ExportInput): ExportOutput {
  return input.board.toolchain === 'vivado' ? generateVivadoExport(input) : generateExport(input);
}

/** Name of the vendor tool, for buttons and messages. */
export function exportToolName(toolchain: 'quartus' | 'vivado'): string {
  return toolchain === 'vivado' ? 'Vivado' : 'Quartus';
}
