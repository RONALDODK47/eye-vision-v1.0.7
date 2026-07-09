import { describe, expect, it } from 'vitest';
import {
  canAccessEyeVisionModule,
  getOfficeModuleAccess,
  normalizeEyeVisionModuleAccess,
  parseEyeVisionOffices,
  resolveEffectiveModuleAccess,
} from '../logic/eyeVisionAdmin';

describe('eyeVisionAdmin', () => {
  it('normaliza permissões de módulo', () => {
    expect(normalizeEyeVisionModuleAccess({ manager: false, pricing: true })).toEqual({
      manager: false,
      pricing: true,
    });
  });

  it('admin acede a tudo', () => {
    expect(canAccessEyeVisionModule({ manager: false, pricing: false }, 'manager', true)).toBe(true);
    expect(canAccessEyeVisionModule({ manager: false, pricing: false }, 'admin', true)).toBe(true);
  });

  it('utilizador sem gerencial não vê manager', () => {
    expect(canAccessEyeVisionModule({ manager: false, pricing: true }, 'manager', false)).toBe(false);
    expect(canAccessEyeVisionModule({ manager: true, pricing: false }, 'pricing', false)).toBe(false);
  });

  it('parse offices map com module_access', () => {
    const offices = parseEyeVisionOffices({
      'ADM-1': {
        name: 'Organo',
        created_at: '2026-01-01',
        module_access: { manager: true, pricing: false },
      },
    });
    expect(offices['ADM-1']?.name).toBe('Organo');
    expect(getOfficeModuleAccess(offices, 'ADM-1').pricing).toBe(false);
  });

  it('empresa restringe todos os utilizadores do token', () => {
    const offices = parseEyeVisionOffices({
      'ADM-1': { name: 'X', created_at: '', module_access: { manager: false, pricing: true } },
    });
    const officeAccess = getOfficeModuleAccess(offices, 'ADM-1');
    const effective = resolveEffectiveModuleAccess(officeAccess, { manager: true, pricing: true });
    expect(effective.manager).toBe(false);
    expect(effective.pricing).toBe(true);
  });
});
