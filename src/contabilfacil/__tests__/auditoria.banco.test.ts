import { describe, expect, it } from 'vitest';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import { auditarBalanceteContinuo } from '../../extratoVision/utils/auditoriaBalanceteContinua';
import { celulaFromRowFast } from '../../extratoVision/utils/balanceteComparativoMensal';
import { analisarSaldoContabil, listarContasInvertidas } from '../../extratoVision/utils/naturezaContabil';

describe('Auditoria — banco com saldo credor', () => {
  const bancoCredor: VisionBalanceteRow = {
    codigo: '103',
    classificacao: '1.1.1.02.00001',
    nome: 'BANCO XYZ',
    tipo: 'A',
    saldoInicial: 0,
    debito: 100,
    credito: 500,
    saldoFinal: 400,
    naturezaSaldoFinal: 'C',
  };

  const bancoDevedor: VisionBalanceteRow = {
    ...bancoCredor,
    debito: 500,
    credito: 100,
    saldoFinal: 400,
    naturezaSaldoFinal: 'D',
  };

  it('detecta banco credor como invertido (CPC ativo devedor)', () => {
    const rows = [bancoCredor];
    const analise = analisarSaldoContabil(bancoCredor, rows);
    expect(analise.naturezaEsperada).toBe('D');
    expect(analise.invertido).toBe(true);
    expect(listarContasInvertidas(rows).length).toBe(1);
  });

  it('não acusa banco com saldo devedor correto', () => {
    const rows = [bancoDevedor];
    expect(analisarSaldoContabil(bancoDevedor, rows).invertido).toBe(false);
  });

  it('detecta inversão sem coluna D/C quando movimento indica credor', () => {
    const semIndicador: VisionBalanceteRow = {
      codigo: '103',
      classificacao: '1.1.1.02.00001',
      nome: 'BANCO SEM INDICADOR',
      tipo: 'A',
      saldoInicial: 0,
      debito: 50,
      credito: 450,
      saldoFinal: 400,
    };
    const rows = [semIndicador];
    expect(analisarSaldoContabil(semIndicador, rows).invertido).toBe(true);
    const cel = celulaFromRowFast(semIndicador, rows);
    expect(cel.invertido).toBe(true);
    expect(cel.natureza).toBe('C');
  });

  it('reconhece BANCO C6 no nome (sem espaço após c6)', () => {
    const c6: VisionBalanceteRow = {
      codigo: '1106',
      classificacao: '1.1.1.02.00006',
      nome: 'BANCO C6',
      tipo: 'A',
      saldoInicial: 0,
      debito: 0,
      credito: 300,
      saldoFinal: 300,
      naturezaSaldoFinal: 'C',
    };
    const analise = analisarSaldoContabil(c6, [c6]);
    expect(analise.invertido).toBe(true);
    expect(celulaFromRowFast(c6, [c6]).invertido).toBe(true);
  });

  it('auditoria RF marca banco credor como crítico', () => {
    const res = auditarBalanceteContinuo({ balanceteRows: [bancoCredor] });
    expect(res.criticos).toBeGreaterThan(0);
    expect(res.bancosComProblema).toBeGreaterThan(0);
    expect(res.achados.some((a) => /banco|disponibilidade|invertido/i.test(a.titulo))).toBe(true);
  });
});
