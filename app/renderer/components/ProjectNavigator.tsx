import { useState, type MouseEvent } from 'react';
import type { HierarchyNode } from '@shared/verilogScan';
import { openFile, openRtlViewer } from '../state/actions';
import { store, useStore } from '../state/store';
import { useContextMenu, type ContextMenuItem } from './ContextMenu';

type ShowMenu = (e: MouseEvent, items: ContextMenuItem[]) => void;

function HierarchyRow({ node, depth, path, showMenu }: { node: HierarchyNode; depth: number; path: string[]; showMenu: ShowMenu }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const menu = (e: MouseEvent) =>
    showMenu(e, [
      { label: 'Open in RTL Viewer', action: () => openRtlViewer(path), enabled: !node.missing, testId: 'ctx-rtl-viewer' },
      { label: 'Open Module Source', action: () => node.file && void openFile(node.file, node.line), enabled: !!node.file, testId: 'ctx-open-source' },
      {
        label: 'Go to Instantiation',
        action: () => node.instanceFile && void openFile(node.instanceFile, node.instanceLine),
        enabled: !!node.instanceFile,
        testId: 'ctx-open-instance',
      },
    ]);
  return (
    <>
      <div
        className="tree-row"
        style={{ paddingLeft: 4 + depth * 14 }}
        data-testid={`hier-${node.instance ?? node.module}`}
        data-path={path.join('/')}
        title={node.file ? `${node.file}:${node.line}` : 'Module not found in the project files'}
        onDoubleClick={() => node.file && void openFile(node.file, node.line)}
        onContextMenu={menu}
      >
        <span className="twisty" onClick={() => setOpen(!open)}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <span className={node.missing ? 'error-text' : ''}>{node.module}</span>
        {node.instance && <span className="secondary">{node.instance}</span>}
      </div>
      {open &&
        node.children.map((c, i) => (
          <HierarchyRow key={`${c.instance}-${i}`} node={c} depth={depth + 1} path={c.instance ? [...path, c.instance] : path} showMenu={showMenu} />
        ))}
    </>
  );
}

function FileRow({ rel, active, onOpen }: { rel: string; active: boolean; onOpen: () => void }) {
  return (
    <div className={`tree-row ${active ? 'selected' : ''}`} style={{ paddingLeft: 18 }} onDoubleClick={onOpen} title={rel} data-testid={`file-${rel}`}>
      <span>{rel.split('/').pop()}</span>
      {rel.includes('/') && <span className="secondary">{rel.split('/').slice(0, -1).join('/')}</span>}
    </div>
  );
}

export function ProjectNavigator() {
  const project = useStore((s) => s.project);
  const tab = useStore((s) => s.navigatorTab);
  const hierarchy = useStore((s) => s.hierarchy);
  const [contextMenu, showMenu] = useContextMenu();
  const active = useStore((s) => s.active);
  const setTab = (t: 'hierarchy' | 'files') => store.set({ navigatorTab: t });

  return (
    <div className="panel" data-testid="project-navigator">
      <div className="panel-header" style={{ padding: 0 }}>
        <div className="subtabs">
          <button className={`subtab ${tab === 'hierarchy' ? 'active' : ''}`} onClick={() => setTab('hierarchy')} data-testid="nav-hierarchy">
            Hierarchy
          </button>
          <button className={`subtab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')} data-testid="nav-files">
            Files
          </button>
        </div>
      </div>
      <div className="panel-body">
        {!project && <div className="empty">No project open.</div>}
        {project && tab === 'hierarchy' && (
          <>
            <div className="tree-group">Entity: {project.project.name}</div>
            {hierarchy ? (
              <HierarchyRow node={hierarchy} depth={0} path={[]} showMenu={showMenu} />
            ) : (
              <div className="empty">{project.project.designFiles.length ? 'Reading the design files...' : 'Add design files to see the module hierarchy.'}</div>
            )}
          </>
        )}
        {project && tab === 'files' && (
          <>
            <div className="tree-group">Design files ({project.project.designFiles.length})</div>
            {project.project.designFiles.map((f) => (
              <FileRow key={f} rel={f} active={active === `file:${f}`} onOpen={() => void openFile(f)} />
            ))}
            <div className="tree-group">Testbenches ({project.project.testbenchFiles.length})</div>
            {project.project.testbenchFiles.map((f) => (
              <FileRow key={f} rel={f} active={active === `file:${f}`} onOpen={() => void openFile(f)} />
            ))}
          </>
        )}
      </div>
      {contextMenu}
    </div>
  );
}
