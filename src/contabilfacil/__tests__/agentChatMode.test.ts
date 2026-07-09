import { describe, expect, it } from 'vitest';
import { needsAgentTools } from '../agent/agentChatMode';

describe('needsAgentTools', () => {
  it('mantém conversa casual no modo leve', () => {
    expect(needsAgentTools('bom dia', [])).toBe(false);
    expect(needsAgentTools('boa noite', [])).toBe(false);
    expect(needsAgentTools('oi, tudo bem?', [])).toBe(false);
    expect(needsAgentTools('obrigado pela ajuda', [])).toBe(false);
  });

  it('mantém perguntas explicativas no modo leve', () => {
    expect(needsAgentTools('como funciona o empréstimo?', [])).toBe(false);
    expect(needsAgentTools('o que é precificação?', [])).toBe(false);
    expect(needsAgentTools('me explica o cronograma', [])).toBe(false);
    expect(needsAgentTools('fala sobre empréstimos', [])).toBe(false);
  });

  it('ativa modo pesado para comandos de ação', () => {
    expect(needsAgentTools('exporta dominio do contrato 1', [])).toBe(true);
    expect(needsAgentTools('valida cpc contrato 1', [])).toBe(true);
    expect(needsAgentTools('navega para precificação', [])).toBe(true);
    expect(needsAgentTools('confira os empréstimos', [])).toBe(true);
  });

  it('ativa modo pesado para consulta de dados reais', () => {
    expect(needsAgentTools('quantos contratos tenho?', [])).toBe(true);
    expect(needsAgentTools('me lista os contratos', [])).toBe(true);
    expect(needsAgentTools('mostra o cronograma do contrato', [])).toBe(true);
  });

  it('continua pesado durante fluxo com ferramentas', () => {
    expect(
      needsAgentTools('ok', [
        { role: 'model', functionCall: { name: 'listar_contratos_emprestimo', args: {} } },
      ]),
    ).toBe(true);
  });
});
