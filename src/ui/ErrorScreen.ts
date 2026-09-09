export function showFatalError(host: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown initialization error.';
  host.replaceChildren();

  const screen = document.createElement('main');
  screen.className = 'fatal-error';
  screen.innerHTML = '<h1>Engine başlatılamadı</h1><p>Tarayıcı WebGL desteğini ve sayfayı yenilemeyi kontrol edin.</p>';
  const details = document.createElement('pre');
  details.textContent = message;
  screen.append(details);
  host.append(screen);
}
