import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { saveDoc, updateDocText } from '../state/actions';
import { useStore, type Doc } from '../state/store';
import { setActiveEditor } from './activeEditor';
import { monaco } from './monacoSetup';

type EditorDoc = Extract<Doc, { kind: 'editor' }>;

export function VerilogEditor({ doc }: { doc: EditorDoc }) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const messages = useStore((s) => s.messages);
  const reveal = useStore((s) => s.reveal);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    setActiveEditor(editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveDoc(doc.id));
    applyMarkers();
    applyReveal();
  };

  useEffect(() => () => setActiveEditor(undefined), []);

  // Keep the model in sync if the document text changes from outside (e.g. reload).
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== doc.text) model.setValue(doc.text);
  }, [doc.id]);

  const applyMarkers = () => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const markers = messages
      .filter((m) => m.file === doc.rel && m.line && m.source !== 'simulation')
      .map((m) => {
        const line = Math.min(m.line!, model.getLineCount());
        return {
          severity:
            m.severity === 'error' ? monaco.MarkerSeverity.Error : m.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
          message: m.text,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
          endColumn: model.getLineMaxColumn(line),
          source: m.source,
        };
      });
    monaco.editor.setModelMarkers(model, 'nanologic', markers);
  };

  const applyReveal = () => {
    const ed = editorRef.current;
    if (!ed || !reveal || reveal.path !== doc.path) return;
    ed.revealLineInCenter(reveal.line);
    ed.setPosition({ lineNumber: reveal.line, column: reveal.column ?? 1 });
    ed.focus();
  };

  useEffect(applyMarkers, [messages, doc.rel]);
  useEffect(applyReveal, [reveal?.nonce]);

  return (
    <div style={{ position: 'absolute', inset: 0 }} data-testid="verilog-editor" data-file={doc.rel}>
      <Editor
        path={doc.path}
        defaultLanguage="verilog"
        defaultValue={doc.text}
        theme="nanologic"
        onMount={onMount}
        onChange={(v) => updateDocText(doc.id, v ?? '')}
        options={{
          fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          glyphMargin: false,
          lineNumbersMinChars: 4,
        }}
      />
    </div>
  );
}
