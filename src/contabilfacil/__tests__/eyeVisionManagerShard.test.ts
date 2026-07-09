import { describe, expect, it } from 'vitest';
import {
  chunkManagerRows,
  estimateJsonBytes,
  mergeManagerCloudDocuments,
  EYE_VISION_MANAGER_SAFE_DOC_BYTES,
} from '@gestao/lib/eyeVisionManagerShard.js';

describe('eyeVisionManagerShard', () => {
  it('estimateJsonBytes mede payload serializado', () => {
    expect(estimateJsonBytes({ a: 1 })).toBeGreaterThan(0);
  });

  it('chunkManagerRows mantém um único chunk quando cabe no limite', () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const chunks = chunkManagerRows(rows, { suffix: 'plano', office_token: 'tok' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('chunkManagerRows divide quando excede limite', () => {
    const bigRow = { payload: 'x'.repeat(400_000) };
    const rows = [bigRow, bigRow];
    const baseFields = { suffix: 'razao', office_token: 'tok', company_slug: 'EMPRESA' };
    const chunks = chunkManagerRows(rows, baseFields, 600_000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(estimateJsonBytes({ ...baseFields, rows: chunk })).toBeLessThanOrEqual(600_000);
    }
  });

  it('mergeManagerCloudDocuments funde shards e chunks', () => {
    const merged = mergeManagerCloudDocuments([
      {
        company_slug: 'PROMETAL',
        company_name: 'Prometal',
        storage_mode: 'sharded',
        office_token: 'tok',
      },
      {
        company_slug: 'PROMETAL',
        company_name: 'Prometal',
        suffix: 'plano',
        rows: [{ id: 'p1' }],
      },
      {
        company_slug: 'PROMETAL',
        suffix: 'razao',
        chunk_index: 0,
        chunk_count: 2,
        rows: [{ id: 'r1' }],
      },
      {
        company_slug: 'PROMETAL',
        suffix: 'razao',
        chunk_index: 1,
        chunk_count: 2,
        rows: [{ id: 'r2' }],
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].company_slug).toBe('PROMETAL');
    expect(merged[0].data.plano).toHaveLength(1);
    expect(merged[0].data.razao).toHaveLength(2);
  });

  it('mergeManagerCloudDocuments prefere shards sobre legado monolítico', () => {
    const merged = mergeManagerCloudDocuments([
      {
        company_slug: 'EMPRESA',
        data: { plano: [{ id: 'legado' }] },
      },
      {
        company_slug: 'EMPRESA',
        suffix: 'plano',
        rows: [{ id: 'shard' }],
      },
    ]);

    expect(merged[0].data.plano).toEqual([{ id: 'shard' }]);
  });

  it('margem padrão fica abaixo do limite Firestore', () => {
    expect(EYE_VISION_MANAGER_SAFE_DOC_BYTES).toBeLessThan(1_048_576);
  });
});
