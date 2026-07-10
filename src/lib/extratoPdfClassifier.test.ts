import { describe, expect, it } from 'vitest';
import { classifyExtratoDocument, isExtratoImageFile } from './extratoPdfClassifier';

describe('extratoPdfClassifier', () => {
  it('detecta arquivos de imagem', () => {
    expect(isExtratoImageFile(new File([], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(isExtratoImageFile(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isExtratoImageFile(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe(false);
  });

  it('classifica imagem como scanned_or_image', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'extrato.png', { type: 'image/png' });
    await expect(classifyExtratoDocument(file)).resolves.toBe('scanned_or_image');
  });
});
