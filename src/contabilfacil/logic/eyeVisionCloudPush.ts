let pushScheduler: (() => void) | null = null;
let flushHandler: (() => Promise<void>) | null = null;

export function registerEyeVisionCloudPushHandlers(handlers: {
  schedule: () => void;
  flush: () => Promise<void>;
}): void {
  pushScheduler = handlers.schedule;
  flushHandler = handlers.flush;
}

export function scheduleEyeVisionCloudPush(): void {
  pushScheduler?.();
}

export async function flushEyeVisionCloudPushSafe(): Promise<void> {
  if (flushHandler) await flushHandler();
}
