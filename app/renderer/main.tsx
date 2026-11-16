import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupMonaco } from './editor/monacoSetup';
import { tokensToCss } from './theme';
import './styles.css';

const style = document.createElement('style');
style.textContent = tokensToCss();
document.head.prepend(style);

setupMonaco();
createRoot(document.getElementById('root')!).render(<App />);
