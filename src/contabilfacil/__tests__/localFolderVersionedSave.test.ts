import { describe, expect, it } from 'vitest';
import {
  LOCAL_DB_LATEST_POINTER,
  LOCAL_DB_SAVE_PREFIX,
} from '../../lib/localFolderDatabase';

describe('localFolderDatabase versioned saves', () => {
  it('usa prefixo e ponteiro estáveis para arquivos versionados', () => {
    expect(LOCAL_DB_SAVE_PREFIX).toBe('eye-vision-dados_');
    expect(LOCAL_DB_LATEST_POINTER).toBe('eye-vision-latest.json');
    const sample = `${LOCAL_DB_SAVE_PREFIX}2026-07-09_231500_042.json`;
    expect(sample.startsWith(LOCAL_DB_SAVE_PREFIX)).toBe(true);
    expect(sample.endsWith('.json')).toBe(true);
  });
});
