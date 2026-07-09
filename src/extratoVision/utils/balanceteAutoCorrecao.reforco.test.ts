import { describe, expect, it } from 'vitest';
import {
  caixaComSaldoCredor,
  gerarReforcoCaixa,
  saldoClienteAReceberDisponivel,
} from './balanceteAutoCorrecao';
import type { VisionBalanceteRow } from '../types/accounting';

const periodo = { de: '2025-12-01', ate: '2025-12-31', label: '12/2025' };

function row(
  partial: Partial<VisionBalanceteRow> & Pick<VisionBalanceteRow, 'codigo' | 'classificacao' | 'nome'>,
): VisionBalanceteRow {
  return {
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
    tipo: 'A',
    ...partial,
  };
}

describe('gerarReforcoCaixa cascata cliente → mútuo', () => {
  const caixa = row({
    codigo: '11101',
    classificacao: '1.1.1.01',
    nome: 'CAIXA GERAL',
    debito: 0,
    credito: 1000,
    saldoFinal: 1000,
    naturezaSaldoFinal: 'C',
  });
  const cliente = row({
    codigo: '11301',
    classificacao: '1.1.3.01',
    nome: 'CLIENTES A RECEBER',
    debito: 300,
    credito: 0,
    saldoFinal: 300,
    naturezaSaldoFinal: 'D',
  });
  const mutuo = row({
    codigo: '21201',
    classificacao: '2.1.2.01',
    nome: 'MUTUO A PAGAR',
    debito: 0,
    credito: 5000,
    saldoFinal: 5000,
    naturezaSaldoFinal: 'C',
  });

  it('recebe do cliente primeiro e usa mútuo se caixa segue credor', () => {
    const balancete = [caixa, cliente, mutuo];
    expect(saldoClienteAReceberDisponivel(cliente, balancete)).toBeGreaterThan(0);

    const { lancamentos, msg } = gerarReforcoCaixa({
      caixa,
      valor: 1000,
      balanceteMes: balancete,
      planoRows: [],
      periodo,
      mesRef: '12/2025',
    });

    expect(lancamentos.length).toBeGreaterThanOrEqual(4);
    expect(msg).toMatch(/Recebimento/i);
    expect(msg).toMatch(/mútuo|mutuo/i);
  });

  it('só cliente quando cobre e caixa deixa de ser credor', () => {
    const caixaLeve = row({
      codigo: '11101',
      classificacao: '1.1.1.01',
      nome: 'CAIXA GERAL',
      debito: 0,
      credito: 200,
      saldoFinal: 200,
      naturezaSaldoFinal: 'C',
    });
    const balancete = [caixaLeve, cliente];
    const { lancamentos, msg } = gerarReforcoCaixa({
      caixa: caixaLeve,
      valor: 200,
      balanceteMes: balancete,
      planoRows: [],
      periodo,
      mesRef: '12/2025',
    });

    expect(lancamentos).toHaveLength(2);
    expect(msg).toMatch(/Recebimento/i);
    expect(msg).not.toMatch(/mútuo|mutuo/i);
    expect(caixaComSaldoCredor(caixaLeve, balancete, lancamentos)).toBe(false);
  });

  it('vai direto ao mútuo sem saldo em clientes', () => {
    const clienteZerado = row({
      codigo: '11301',
      classificacao: '1.1.3.01',
      nome: 'CLIENTES A RECEBER',
      debito: 0,
      credito: 0,
      saldoFinal: 0,
    });
    const balancete = [caixa, clienteZerado, mutuo];
    const { lancamentos, msg } = gerarReforcoCaixa({
      caixa,
      valor: 800,
      balanceteMes: balancete,
      planoRows: [],
      periodo,
      mesRef: '12/2025',
    });

    expect(lancamentos).toHaveLength(2);
    expect(msg).toMatch(/mútuo|mutuo/i);
    expect(msg).not.toMatch(/Recebimento de/i);
  });
});
