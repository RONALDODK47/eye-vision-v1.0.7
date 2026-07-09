import { describe, expect, it } from 'vitest';
import { tryInstantReply } from '../agent/agentInstantReply';

describe('tryInstantReply', () => {
  it('responde cumprimentos na hora (FlowMind)', () => {
    expect(tryInstantReply('bom dia')).toBe('Bom dia! Como posso ajudar?');
    expect(tryInstantReply('boa noite')).toBe('Oi!');
    expect(tryInstantReply('oi')).toBe('Oi!');
    expect(tryInstantReply('como ta o dia hoje')).toBe('Tudo bem! E com você?');
  });

  it('ignora pedidos complexos', () => {
    expect(tryInstantReply('exporta dominio do contrato 1')).toBeNull();
    expect(tryInstantReply('como funciona o empréstimo com SAC e PRICE no sistema')).toBeNull();
  });
});
