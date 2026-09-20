/** Development fixture: production Game, with repeatable initial positions, never simulated interaction results. */
import '../styles.css';
import { Game } from '../core/Game';

async function start(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('Interaction QA is development-only.');
  const host = document.getElementById('app')!;
  const mode = new URLSearchParams(location.search).get('start');
  const game = new Game(host);
  await game.initialize(mode === 'toggle' || mode === 'vehicle' || mode === 'interior' || mode === 'purchase' || mode === 'traffic' ? mode : 'door');
  const links = document.createElement('nav');
  links.style.cssText = 'position:fixed;left:12px;bottom:100px;max-width:90vw;background:#16252eee;padding:10px;z-index:5;font:14px monospace';
  for (const scenario of ['traffic', 'purchase', 'interior', 'door', 'toggle', 'vehicle']) {
    const link = document.createElement('a'); link.textContent = `${scenario} fixture `;
    link.href = `/interaction-qa.html?start=${scenario}`; link.style.color = '#bce0ee'; links.append(link);
  }
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // Explicit event-level controls for automation without mouse-button hold support.
  // Uses the real Game/InputManager and real pointer lock; never bypasses lock gating.
  let heldAim = false;
  const aim = document.createElement('button'); aim.textContent = 'QA: Hold RMB (event simulation)';
  aim.onclick = () => {
    heldAim = !heldAim;
    window.dispatchEvent(new MouseEvent(heldAim ? 'mousedown' : 'mouseup', { button: 2, buttons: heldAim ? 2 : 0 }));
    aim.textContent = heldAim ? 'QA: Release RMB' : 'QA: Hold RMB (event simulation)';
  }; links.append(aim);
  for (const [label, x, y] of [['Right', 100, 0], ['Left', -100, 0], ['Up', 0, -80], ['Down', 0, 80]] as const) {
    const button = document.createElement('button'); button.textContent = `QA mouse ${label}`;
    button.onclick = () => window.dispatchEvent(new MouseEvent('pointermove', { movementX: x, movementY: y })); links.append(button);
  }
  for (const [label, code] of [['Drive right 1s', 'KeyD'], ['Drive left 1s', 'KeyA']] as const) {
    const button = document.createElement('button'); button.textContent = label;
    button.onclick = () => {
      for (const key of ['KeyW', code]) window.dispatchEvent(new KeyboardEvent('keydown', { code: key }));
      const timer = setTimeout(() => {
        for (const key of ['KeyW', code]) window.dispatchEvent(new KeyboardEvent('keyup', { code: key }));
        timers.delete(timer);
      }, 1000); timers.add(timer);
    }; links.append(button);
  }
  if (mode === 'traffic') {
    const button = document.createElement('button'); button.textContent = 'QA: Yavaş trafik aracına yaklaş';
    button.onclick = () => game.developmentApproachTraffic(); links.append(button);
  }
  if (mode === 'purchase') for (const action of ['credit', 'debit'] as const) {
    const button = document.createElement('button'); button.textContent = action === 'credit' ? 'QA +1.000 ₺' : 'QA bakiyeyi harca';
    button.onclick = () => game.developmentEconomy(action); links.append(button);
  }
  // The browser test driver supports press, not hold. These visible fixture controls
  // hold real key events through the existing InputManager; no transforms are changed.
  for (const [label, code, milliseconds] of [['Walk forward 1s', 'KeyW', 1000], ['Walk back 1s', 'KeyS', 1000],
    ['Strafe / steer left', 'KeyA', 250], ['Strafe / steer right', 'KeyD', 250], ['Handbrake / jump 3s', 'Space', 3000]] as const) {
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
