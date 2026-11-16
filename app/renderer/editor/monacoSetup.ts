// Monaco is bundled with the app (no CDN), with only the editor core and
// Verilog highlighting, so it works offline.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { tokens } from '../theme';

export function setupMonaco() {
  (self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
  loader.config({ monaco });
  monaco.editor.defineTheme('nanologic', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6f6f6f', fontStyle: 'italic' },
      { token: 'keyword', foreground: '000000', fontStyle: 'bold' },
      { token: 'number', foreground: '1f4e9c' },
      { token: 'string', foreground: '5a3e00' },
    ],
    colors: {
      'editor.background': tokens.color.bg,
      'editor.lineHighlightBackground': '#f4f4f4',
      'editorLineNumber.foreground': '#a0a0a0',
      'editorLineNumber.activeForeground': '#000000',
      'editorError.foreground': tokens.color.error,
      'editorWarning.foreground': tokens.color.warning,
    },
  });
}

export { monaco };
