import { describe, expect, it } from 'vitest';
import { walkFiscalDirectoryFiles } from '../logic/fiscalDirectoryWalk';

describe('walkFiscalDirectoryFiles', () => {
  it('entra em subpastas aninhadas e encontra arquivos', async () => {
    const janeiro: FileSystemDirectoryHandle = {
      name: 'janeiro',
      kind: 'directory',
      async *entries() {
        yield [
          'contrib.txt',
          {
            kind: 'file',
            name: 'contrib.txt',
            getFile: async () => new File(['sped'], 'contrib.txt', { type: 'text/plain' }),
          } as FileSystemFileHandle,
        ];
      },
    } as FileSystemDirectoryHandle;

    const ano2026: FileSystemDirectoryHandle = {
      name: '2026',
      kind: 'directory',
      async *entries() {
        yield ['janeiro', janeiro];
      },
    } as FileSystemDirectoryHandle;

    const root: FileSystemDirectoryHandle = {
      name: 'SPED',
      kind: 'directory',
      async *entries() {
        yield ['2026', ano2026];
        yield [
          'raiz.txt',
          {
            kind: 'file',
            name: 'raiz.txt',
            getFile: async () => new File(['x'], 'raiz.txt'),
          } as FileSystemFileHandle,
        ];
      },
    } as FileSystemDirectoryHandle;

    const result = await walkFiscalDirectoryFiles(root, (n) => /\.txt$/i.test(n));
    expect(result.files).toHaveLength(2);
    expect(result.files.some((f) => f.relativePath === '2026/janeiro/contrib.txt')).toBe(true);
    expect(result.files.some((f) => f.relativePath === 'raiz.txt' && f.folderKey === '.')).toBe(true);
    expect(result.foldersVisited).toBe(3);
  });
});
