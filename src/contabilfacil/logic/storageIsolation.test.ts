import { describe, expect, it } from 'vitest';
import { buildExtratoPdfKey } from '../../../scripts/storage/object-keys.mjs';

describe('storage isolation helpers', () => {
  it('buildExtratoPdfKey isola por office_token', () => {
    const a = buildExtratoPdfKey('TOK-AAAA', 'empresa_x', 'id-1');
    const b = buildExtratoPdfKey('TOK-BBBB', 'empresa_x', 'id-1');
    expect(a).toBe('TOK-AAAA/empresa_x/id-1.pdf');
    expect(b).toBe('TOK-BBBB/empresa_x/id-1.pdf');
    expect(a).not.toBe(b);
  });

  it('sanitiza caracteres perigosos no path', () => {
    const key = buildExtratoPdfKey('TOK/../A', 'emp name', 'id 1');
    expect(key).not.toContain('..');
    expect(key.startsWith('TOK')).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);
  });
});
