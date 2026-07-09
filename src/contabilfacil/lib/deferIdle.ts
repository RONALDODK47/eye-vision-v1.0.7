/** Executa tarefa não crítica após a primeira pintura da UI. */
export function deferIdle(task: () => void, fallbackMs = 800): void {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => task(), { timeout: fallbackMs });
    return;
  }
  window.setTimeout(task, Math.min(fallbackMs, 400));
}
