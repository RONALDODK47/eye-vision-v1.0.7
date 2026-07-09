import { describe, expect, it } from 'vitest';
import { looksLikeScannedDocument } from './imageOcrExtract';

describe('imageOcrExtract — detecção de scan', () => {
  it('identifica fundo cinza típico de digitalização', () => {
    const gray = new Uint8Array(400);
    for (let i = 0; i < 300; i++) gray[i] = 210;
    for (let i = 300; i < 340; i++) gray[i] = 40;
    expect(looksLikeScannedDocument(gray, gray.length)).toBe(true);
  });

  it('rejeita imagem quase toda branca sem texto', () => {
    const gray = new Uint8Array(200).fill(250);
    expect(looksLikeScannedDocument(gray, gray.length)).toBe(false);
  });
});
