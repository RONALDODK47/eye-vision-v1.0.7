import { describe, expect, it } from 'vitest';
import {
  cfopEhCompraRevenda,
  cfopEhRemessa,
  cfopEhRemessaEntrada,
  cfopEhUsoConsumo,
} from '../logic/fiscalCfopCatalog';

describe('cfopEhCompraRevenda', () => {
  it('identifica compra para revenda', () => {
    expect(cfopEhCompraRevenda('1102')).toBe(true);
    expect(cfopEhCompraRevenda('2102')).toBe(true);
    expect(cfopEhCompraRevenda('1403')).toBe(true);
  });

  it('não confunde com uso e consumo', () => {
    expect(cfopEhUsoConsumo('1556')).toBe(true);
    expect(cfopEhCompraRevenda('1556')).toBe(false);
  });

  it('não confunde com remessa de entrada', () => {
    expect(cfopEhRemessa('1905')).toBe(true);
    expect(cfopEhRemessaEntrada('1905')).toBe(true);
    expect(cfopEhCompraRevenda('1905')).toBe(false);
  });
});
