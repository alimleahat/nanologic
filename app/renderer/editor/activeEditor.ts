import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';

let active: editor.IStandaloneCodeEditor | undefined;

export function setActiveEditor(e: editor.IStandaloneCodeEditor | undefined) {
  active = e;
}

export function getActiveEditor(): editor.IStandaloneCodeEditor | undefined {
  return active;
}

export function runEditorAction(id: string) {
  if (!active) return;
  active.focus();
  if (id === 'undo' || id === 'redo') active.trigger('menu', id, null);
  else void active.getAction(id)?.run();
}

/** Insert text at the cursor of the active editor (used by the Templates panel). */
export function insertAtCursor(text: string): boolean {
  if (!active) return false;
  const sel = active.getSelection();
  if (!sel) return false;
  active.executeEdits('template', [{ range: sel, text, forceMoveMarkers: true }]);
  active.focus();
  return true;
}
