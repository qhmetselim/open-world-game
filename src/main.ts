import './styles.css';
import { Game } from './core/Game';
import { showFatalError } from './ui/ErrorScreen';

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root was not found.');

const game = new Game(app);

const handleFatalError = (error: unknown): void => {
  console.error(error);
  game.dispose();
  showFatalError(app, error);
};

window.addEventListener('error', (event) => handleFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => handleFatalError(event.reason));

void game.initialize().then(() => game.start()).catch(handleFatalError);
