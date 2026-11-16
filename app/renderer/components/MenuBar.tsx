import { useEffect, useRef, useState } from 'react';
import { togglePanel, type PanelRefs } from '../App';
import { runEditorAction } from '../editor/activeEditor';
import {
  activate,
  addExistingFiles,
  closeProject,
  openDialog,
  openExample,
  openProjectDialog,
  openProjectPath,
  openSingleton,
  removeFromProject,
  runAnalysis,
  saveAll,
  saveDoc,
  setTopLevel,
  startBoard,
} from '../state/actions';
import { useExportTool } from '../state/boardHooks';
import { store, useStore } from '../state/store';
import { scanModules } from '@shared/verilogScan';

interface Entry {
  label: string;
  shortcut?: string;
  action?: () => void;
  enabled?: boolean;
  separator?: boolean;
  testId?: string;
}

const isMac = () => window.nanologic?.platform === 'darwin';
const mod = (k: string) => (isMac() ? `⌘${k}` : `Ctrl+${k}`);

export function MenuBar({ refs }: { refs: PanelRefs }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const project = useStore((s) => s.project);
  const docs = useStore((s) => s.docs);
  const active = useStore((s) => s.active);
  const recent = useStore((s) => s.recent);
  const activeDoc = docs.find((d) => d.id === active);
  const tool = useExportTool();
  const hasProject = !!project;
  const editorActive = activeDoc?.kind === 'editor';

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  const currentModule = () => {
    if (activeDoc?.kind !== 'editor') return undefined;
    return scanModules(activeDoc.text)[0]?.name;
  };

  const menus: [string, Entry[]][] = [
    [
      'File',
      [
        { label: 'New Project Wizard...', shortcut: mod('Shift+N'), action: () => openDialog('newProject'), testId: 'menu-new-project' },
        { label: 'Open Project...', shortcut: mod('O'), action: () => void openProjectDialog() },
        { label: 'Import Existing Folder...', action: () => openDialog('import'), testId: 'menu-import' },
        { label: 'Close Project', action: () => void closeProject(), enabled: hasProject },
        { separator: true, label: '' },
        { label: 'New Verilog File...', action: () => openDialog('newFile'), enabled: hasProject },
        { label: 'Add Existing Files...', action: () => void addExistingFiles('design'), enabled: hasProject },
        { label: 'Save', shortcut: mod('S'), action: () => void saveDoc(), enabled: editorActive },
        { label: 'Save All', shortcut: mod('Shift+S'), action: () => void saveAll(), enabled: hasProject },
        { separator: true, label: '' },
        { label: `Export to ${tool}...`, action: () => openDialog('export'), enabled: hasProject },
        ...(recent.length ? [{ separator: true, label: '' } as Entry] : []),
        ...recent.slice(0, 6).map((p, i) => ({ label: `${i + 1}  ${p.split(/[\\/]/).slice(-2).join('/')}`, action: () => void openProjectPath(p) })),
      ],
    ],
    [
      'Edit',
      [
        { label: 'Undo', shortcut: mod('Z'), action: () => runEditorAction('undo'), enabled: editorActive },
        { label: 'Redo', shortcut: mod('Shift+Z'), action: () => runEditorAction('redo'), enabled: editorActive },
        { separator: true, label: '' },
        { label: 'Find...', shortcut: mod('F'), action: () => runEditorAction('actions.find'), enabled: editorActive },
        { label: 'Replace...', action: () => runEditorAction('editor.action.startFindReplaceAction'), enabled: editorActive },
        { label: 'Go to Line...', action: () => runEditorAction('editor.action.gotoLine'), enabled: editorActive },
        { label: 'Toggle Comment', shortcut: mod('/'), action: () => runEditorAction('editor.action.commentLine'), enabled: editorActive },
      ],
    ],
    [
      'View',
      [
        { label: 'Project Navigator', action: () => togglePanel(refs.navigator) },
        { label: 'Tasks', action: () => togglePanel(refs.tasks) },
        { label: 'Messages', action: () => togglePanel(refs.messages) },
        { label: 'Templates', action: () => store.set((s) => ({ rightPanelOpen: !s.rightPanelOpen })) },
        { separator: true, label: '' },
        { label: 'Home', action: () => openSingleton('welcome') },
      ],
    ],
    [
      'Project',
      [
        {
          label: 'Set as Top-Level Entity',
          action: () => {
            const m = currentModule();
            if (m) void setTopLevel(m);
          },
          enabled: editorActive && !!currentModule(),
        },
        { label: 'Project Settings (Board)...', action: () => openDialog('settings'), enabled: hasProject, testId: 'menu-settings' },
        { separator: true, label: '' },
        { label: 'Add Existing Files...', action: () => void addExistingFiles('design'), enabled: hasProject },
        { label: 'Add Testbench Files...', action: () => void addExistingFiles('testbench'), enabled: hasProject },
        {
          label: 'Remove Current File from Project',
          action: () => activeDoc?.kind === 'editor' && void removeFromProject(activeDoc.rel),
          enabled: editorActive,
        },
      ],
    ],
    ['Assignments', [{ label: 'Pin Planner', action: () => openSingleton('pins'), enabled: hasProject, testId: 'menu-pin-planner' }]],
    [
      'Processing',
      [
        { label: 'Start Analysis', shortcut: mod('K'), action: () => void runAnalysis(), enabled: hasProject, testId: 'menu-start-analysis' },
        { label: 'Start Simulation...', action: () => openDialog('simulate'), enabled: hasProject },
        { label: 'Run on Virtual Board', action: () => void startBoard(), enabled: hasProject },
      ],
    ],
    [
      'Tools',
      [
        { label: 'Pin Planner', action: () => openSingleton('pins'), enabled: hasProject },
        { label: 'Virtual DE10-Lite', action: () => openSingleton('board'), enabled: hasProject },
        { label: `Export to ${tool}...`, action: () => openDialog('export'), enabled: hasProject },
      ],
    ],
    ['Window', docs.map((d) => ({ label: `${d.id === active ? '• ' : ''}${d.title}`, action: () => activate(d.id) }))],
    [
      'Help',
      [
        { label: 'Getting Started', action: () => openSingleton('welcome') },
        { label: 'Open Starter Example', action: () => void openExample('starter') },
        { label: 'Open Reference Project', action: () => void openExample('traffic-light') },
        { separator: true, label: '' },
        { label: 'About NanoLogic', action: () => openDialog('about') },
      ],
    ],
  ];

  return (
    <div className="menubar" ref={ref} role="menubar">
      {menus.map(([name, entries]) => (
        <div className="menubar-item" key={name}>
          <button
            className={`menubar-button ${open === name ? 'open' : ''}`}
            data-testid={`menu-${name.toLowerCase()}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(open === name ? null : name);
            }}
            onMouseEnter={() => open && setOpen(name)}
          >
            {name}
          </button>
          {open === name && (
            <div className="menu-popup" role="menu">
              {entries.length === 0 && <div className="menu-entry secondary">(empty)</div>}
              {entries.map((e, i) =>
                e.separator ? (
                  <div className="menu-separator" key={i} />
                ) : (
                  <button
                    key={i}
                    className="menu-entry"
                    role="menuitem"
                    data-testid={e.testId}
                    disabled={e.enabled === false}
                    onClick={() => {
                      setOpen(null);
                      e.action?.();
                    }}
                  >
                    <span>{e.label}</span>
                    {e.shortcut && <span className="shortcut">{e.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
