/**
 * Versão otimizada de imageOcrExtract com suporte a tabelas.
 * Re-exporta todas as funções originais + novas otimizações.
 */

import * as original from './imageOcrExtract';
export * from './imageOcrExtract';

import { ensureOcrAiReady } from './aiAssistClient';
import { refineOcrPlainText, type AiOcrDocumentType } from './aiOcrAssist';
import { runOcrPortuguese } from './imageOcrExtract';

/**
 * OCR otimizado para tabelas — refinamento via IA após leitura local (removida).
 */
export async function runOcrPortugueseOptimized(
  imageFile: File,
  onProgress?: (fraction: number, message: string) => void,
  options?: { documentType?: AiOcrDocumentType },
): Promise<string> {
  onProgress?.(0, 'Preparando OCR…');
  await ensureOcrAiReady((msg) => onProgress?.(0.02, msg));
  const raw = await runOcrPortuguese(imageFile, onProgress, options);
  if (!raw) return raw;
  return refineOcrPlainText(raw, options?.documentType ?? 'generic', (msg) =>
    onProgress?.(0.98, msg),
  );
}
