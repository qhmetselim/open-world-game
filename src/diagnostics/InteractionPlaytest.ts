/** Development fixture: production Game, with repeatable initial positions, never simulated interaction results. */
import '../styles.css';
import { Game } from '../core/Game';

async function start(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('Interaction QA is development-only.');
  const host = document.getElementById('app')!;
  const mode = new URLSearchParams(location.search).get('start');
  const game = new Game(host);
  await game.initialize(mode === 'toggle' || mode === 'vehicle' ? mode : 'door');
  const links = document.createElement('nav');
  links.style.cssText = 'position:fixed;right:12px;top:12px;background:#16252eee;padding:10px;z-index:5;font:14px monospace';
  for (const scenario of ['door', 'toggle', 'vehicle']) {
    const link = document.createElement('a'); link.textContent = `${scenario} fixture `;
    link.href = `/interaction-qa.html?start=${scenario}`; link.style.color = '#bce0ee'; links.append(link);
  }
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // The browser test driver supports press, not hold. These visible fixture controls
  // hold real key events through the existing InputManager; no transforms are changed.
  for (const [label, code, milliseconds] of [['Walk forward 1s', 'KeyW', 1000], ['Walk back 1s', 'KeyS', 1000],
    ['Face left', 'KeyA', 250], ['Face right', 'KeyD', 250], ['Handbrake / jump 3s', 'Space', 3000]] as const) {
    const button = document.createElement('button'); button.textContent = label;
    button.onclick = () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      const timer = setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code })); timers.delete(timer); }, milliseconds);
      timers.add(timer);
    };
    links.append(button);
  }
  host.append(links); game.start();
  window.addEventListener('pagehide', () => { for (const timer of timers) clearTimeout(timer); game.dispose(); }, { once: true });
}
void start().catch((error: unknown) => { document.body.textContent = String(error); console.error(error); });
