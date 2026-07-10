/** Debounce único para pasta + nuvem — suave na UI, cobre gravações e exclusões. */
export const OPERATIONAL_SAVE_DEBOUNCE_MS = 6000;
export const FOLDER_SAVE_DEBOUNCE_MS = 8000;

let operationalDirtyGeneration = 0;
let lastFolderFlushGeneration = 0;
let lastCloudFlushGeneration = 0;

export function markOperationalStorageDirty(): void {
  operationalDirtyGeneration += 1;
}

export function hasOperationalStorageDirty(): boolean {
  return operationalDirtyGeneration > lastFolderFlushGeneration;
}

export function markOperationalFolderFlushed(): void {
  lastFolderFlushGeneration = operationalDirtyGeneration;
}

export function hasOperationalCloudDirty(): boolean {
  return operationalDirtyGeneration > lastCloudFlushGeneration;
}

export function markOperationalCloudFlushed(): void {
  lastCloudFlushGeneration = operationalDirtyGeneration;
}

export function scheduleEyeVisionOperationalSave(
  delayMs = OPERATIONAL_SAVE_DEBOUNCE_MS,
): void {
  void import('./eyeVisionCloudPush').then(({ scheduleEyeVisionCloudPush }) => {
    scheduleEyeVisionCloudPush();
  });
  void import('../../lib/localFolderDatabase').then(({ scheduleLocalDatabaseSave }) => {
    scheduleLocalDatabaseSave(FOLDER_SAVE_DEBOUNCE_MS);
  });
}
