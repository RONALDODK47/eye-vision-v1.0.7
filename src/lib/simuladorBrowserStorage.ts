/** Mescla listas salvas pelo `id` (última ocorrência vence — chaves mais recentes no array têm prioridade). */
export function mergeSavedById<T extends { id: string }>(lists: readonly (readonly T[])[]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      const id = String(item?.id ?? '').trim();
      if (id) map.set(id, item);
    }
  }
  return Array.from(map.values());
}

export function persistCanonicalList(canonicalKey: string, list: unknown[]): void {
  if (list.length === 0) return;
  try {
    localStorage.setItem(canonicalKey, JSON.stringify(list));
    void import('../contabilfacil/logic/eyeVisionCloudPush').then(({ scheduleEyeVisionCloudPush }) => {
      scheduleEyeVisionCloudPush();
    });
  } catch (e) {
    console.warn(`[storage] não foi possível gravar ${canonicalKey}:`, e);
  }
}
