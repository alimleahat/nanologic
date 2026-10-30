import { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { DocumentArea } from './components/DocumentArea';
import { MenuBar } from './components/MenuBar';
import { MessagesPanel } from './components/MessagesPanel';
import { ProjectNavigator } from './components/ProjectNavigator';
import { StatusBar } from './components/StatusBar';
import { TasksPanel } from './components/TasksPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { Toolbar } from './components/Toolbar';
import { Dialogs } from './dialogs/Dialogs';
import { loadStartupData, openDialog, openProjectDialog, runAnalysis, saveAll, saveDoc, subscribeBoardState } from './state/actions';
import { store, useStore } from './state/store';

export interface PanelRefs {
  navigator: React.RefObject<ImperativePanelHandle | null>;
  tasks: React.RefObject<ImperativePanelHandle | null>;
  messages: React.RefObject<ImperativePanelHandle | null>;
  templates: React.RefObject<ImperativePanelHandle | null>;
}

export function togglePanel(ref: React.RefObject<ImperativePanelHandle | null>) {
  const p = ref.current;
  if (!p) return;
  if (p.isCollapsed()) p.expand();
  else p.collapse();
}

export function App() {
  const rightOpen = useStore((s) => s.rightPanelOpen);
  const refs: PanelRefs = {
    navigator: useRef<ImperativePanelHandle>(null),
    tasks: useRef<ImperativePanelHandle>(null),
    messages: useRef<ImperativePanelHandle>(null),
    templates: useRef<ImperativePanelHandle>(null),
  };

  useEffect(() => {
    void loadStartupData();
    return subscribeBoardState();
  }, []);

  // The templates panel is collapsed by default (reserved for a future assistant).
  useEffect(() => {
    const p = refs.templates.current;
    if (!p) return;
    if (rightOpen && p.isCollapsed()) p.expand();
    if (!rightOpen && !p.isCollapsed()) p.collapse();
  }, [rightOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void (e.shiftKey ? saveAll() : saveDoc());
      } else if (k === 'o') {
        e.preventDefault();
        void openProjectDialog();
      } else if (k === 'k') {
        e.preventDefault();
        void runAnalysis();
      } else if (k === 'n' && e.shiftKey) {
        e.preventDefault();
        openDialog('newProject');
      }
    };
    window.addEventListener('keydown', onKey);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.get().docs.some((d) => d.kind === 'editor' && d.text !== d.saved)) {
        e.preventDefault();
        e.returnValue = false;
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const offMenu = window.nanologic.onMenuCommand(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      offMenu();
    };
  }, []);

  return (
    <div className="app" data-testid="app">
      <MenuBar refs={refs} />
      <Toolbar />
      <div className="app-body">
        <PanelGroup direction="vertical" autoSaveId="nl-main-v">
          <Panel defaultSize={74} minSize={30}>
            <PanelGroup direction="horizontal" autoSaveId="nl-main-h">
              <Panel ref={refs.navigator} defaultSize={20} minSize={12} collapsible order={1}>
                <PanelGroup direction="vertical" autoSaveId="nl-left">
                  <Panel defaultSize={62} minSize={15}>
                    <ProjectNavigator />
                  </Panel>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel ref={refs.tasks} defaultSize={38} minSize={10} collapsible>
                    <TasksPanel />
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle className="resize-handle" />
              <Panel minSize={30} order={2}>
                <DocumentArea />
              </Panel>
              <PanelResizeHandle className="resize-handle" />
              <Panel
                ref={refs.templates}
                defaultSize={18}
                minSize={12}
                collapsible
                collapsedSize={0}
                order={3}
                onCollapse={() => store.get().rightPanelOpen && store.set({ rightPanelOpen: false })}
                onExpand={() => !store.get().rightPanelOpen && store.set({ rightPanelOpen: true })}
              >
                <TemplatesPanel />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel ref={refs.messages} defaultSize={26} minSize={8} collapsible>
            <MessagesPanel />
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
      <Dialogs />
    </div>
  );
}
