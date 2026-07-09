import { describe, expect, it } from 'vitest';
import { agruparAchadosAuditoriaPorTipo } from '../utils/auditoriaAchadosAgrupados';
import type { AchadoAuditoriaBalancete } from '../utils/auditoriaBalanceteContinua';

function achado(partial: Partial<AchadoAuditoriaBalancete> & Pick<AchadoAuditoriaBalancete, 'id' | 'conta'>): AchadoAuditoriaBalancete {
  return {
    severidade: 'alerta',
    titulo: 'Natureza invertida na conta',
    detalhe: 'Saldo C',
    norma: 'CPC 26',
    explicacao: 'Explicacao unica',
    normaParagrafo: 'Item 54',
    normaTrecho: 'Trecho norma',
    ...partial,
  };
}

describe('agruparAchadosAuditoriaPorTipo', () => {
  it('agrupa contas com o mesmo titulo e severidade', () => {
    const grupos = agruparAchadosAuditoriaPorTipo([
      achado({ id: '1', conta: '111 — SICOOB' }),
      achado({ id: '2', conta: '112 — CRESOL' }),
      achado({
        id: '3',
        conta: '211 — FORNECEDOR',
        titulo: 'Banco ou disponibilidade com saldo invertido',
        severidade: 'critico',
      }),
    ]);
    expect(grupos).toHaveLength(2);
    const nat = grupos.find((g) => g.titulo.includes('Natureza invertida'));
    expect(nat?.qtdContas).toBe(2);
    expect(nat?.contas).toContain('111 — SICOOB');
    expect(nat?.explicacao).toBe('Explicacao unica');
  });

  it('nao mistura severidades diferentes do mesmo titulo', () => {
    const grupos = agruparAchadosAuditoriaPorTipo([
      achado({ id: '1', conta: 'A', severidade: 'critico', titulo: 'Problema X' }),
      achado({ id: '2', conta: 'B', severidade: 'alerta', titulo: 'Problema X' }),
    ]);
    expect(grupos).toHaveLength(2);
  });
});
