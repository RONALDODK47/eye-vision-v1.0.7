/** Margem abaixo do limite Firestore (1 MiB por documento). */
export const EYE_VISION_MANAGER_SAFE_DOC_BYTES = 900_000;

export function estimateJsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Divide linhas em chunks que cabem cada um em um documento Firestore.
 * Caminho rápido por estimativa — evita JSON.stringify por linha (travava o browser).
 * @param {unknown[]} rows
 * @param {Record<string, unknown>} baseFields campos fixos do doc (sem rows)
 * @param {number} maxBytes
 */
export function chunkManagerRows(rows, baseFields, maxBytes = EYE_VISION_MANAGER_SAFE_DOC_BYTES) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const envelopeOverhead = estimateJsonBytes({ ...baseFields, rows: [] });
  const single = { ...baseFields, rows };
  if (estimateJsonBytes(single) <= maxBytes) return [rows];

  const sampleCount = Math.min(8, rows.length);
  let sampleBytes = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    sampleBytes += estimateJsonBytes(rows[i]);
  }
  const avgRowBytes = Math.max(48, Math.ceil(sampleBytes / sampleCount));
  let rowsPerChunk = Math.max(
    1,
    Math.floor((maxBytes - envelopeOverhead - 64) / avgRowBytes),
  );

  /** Refina tamanho do chunk com no máximo 6 medições reais. */
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slice = rows.slice(0, Math.min(rowsPerChunk, rows.length));
    if (estimateJsonBytes({ ...baseFields, rows: slice }) <= maxBytes) break;
    rowsPerChunk = Math.max(1, Math.floor(rowsPerChunk * 0.65));
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    chunks.push(rows.slice(i, i + rowsPerChunk));
  }

  for (const chunk of chunks) {
    if (estimateJsonBytes({ ...baseFields, rows: chunk }) > maxBytes) {
      if (chunk.length === 1) {
        throw new Error(
          'Linha gerencial individual excede o limite do Firestore; reduza o tamanho do registro.',
        );
      }
      /** Fallback pontual para chunk ainda grande. */
      return chunkManagerRowsSlow(rows, baseFields, maxBytes);
    }
  }

  return chunks.length > 0 ? chunks : [rows];
}

function chunkManagerRowsSlow(rows, baseFields, maxBytes) {
  const chunks = [];
  let current = [];

  for (const row of rows) {
    const trial = [...current, row];
    if (current.length > 0 && estimateJsonBytes({ ...baseFields, rows: trial }) > maxBytes) {
      chunks.push(current);
      current = [row];
    } else {
      current = trial;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Agrupa documentos eye_vision_manager (legado + sharded) por empresa.
 * @param {Array<{ id?: string, data?: () => Record<string, unknown> } | Record<string, unknown>>} docs
 */
export function mergeManagerCloudDocuments(docs) {
  /** @type {Map<string, { company_slug: string, company_name: string, data: Record<string, unknown[]>, legacyData: Record<string, unknown[]> | null, chunkBuckets: Map<string, unknown[][]>, directShards: Map<string, unknown[]>, hasShards: boolean }>} */
  const groups = new Map();

  for (const raw of docs) {
    const row = typeof raw?.data === 'function' ? raw.data() : raw;
    if (!row || typeof row !== 'object') continue;

    const slug = String(row.company_slug || '').trim();
    if (!slug) continue;

    let group = groups.get(slug);
    if (!group) {
      group = {
        company_slug: slug,
        company_name: String(row.company_name || '').trim(),
        data: {},
        legacyData: null,
        chunkBuckets: new Map(),
        directShards: new Map(),
        hasShards: false,
      };
      groups.set(slug, group);
    }

    if (!group.company_name && row.company_name) {
      group.company_name = String(row.company_name).trim();
    }

    if (row.data && typeof row.data === 'object' && !row.suffix) {
      group.legacyData = row.data;
      continue;
    }

    if (!row.suffix || !Array.isArray(row.rows)) continue;

    group.hasShards = true;

    if (row.chunk_count != null && row.chunk_index != null) {
      const suffix = String(row.suffix);
      const bucket = group.chunkBuckets.get(suffix) || [];
      bucket[Number(row.chunk_index)] = row.rows;
      group.chunkBuckets.set(suffix, bucket);
    } else {
      group.directShards.set(String(row.suffix), row.rows);
    }
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.hasShards) {
      for (const [suffix, rows] of group.directShards) {
        group.data[suffix] = rows;
      }
      for (const [suffix, parts] of group.chunkBuckets) {
        group.data[suffix] = parts.flatMap((part) => (Array.isArray(part) ? part : []));
      }
    } else if (group.legacyData) {
      group.data = group.legacyData;
    }

    result.push({
      company_slug: group.company_slug,
      company_name: group.company_name,
      data: group.data,
    });
  }
  return result;
}
