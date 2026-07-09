import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectLocalManagerPayload,
  collectLocalOfficePayload,
  EYE_VISION_CLOUD_HYDRATED_EVENT,
  isContabilfacilManagerDataKey,
} from '../logic/eyeVisionCloudSync';
import { savePricingIcmsUfPrefs } from '../logic/pricingCompanyWorkspace';
import { setOcrUserSettings } from '../../lib/ocrUserSettings';
import { setOcrCustomReplacements, setOcrDatePropagationMode } from '../../lib/ocrCloudRulesStorage';
import {
  COMPANIES_REGISTRY_KEY,
  companyStorageSlug,
  saveCompaniesRegistry,
  type CompanyRecord,
} from '../logic/companyWorkspace';

describe('eyeVisionCloudSync', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  });

  afterEach(() => {
    store.clear();
  });

  it('companyStorageSlug normaliza nome da empresa', () => {
    expect(companyStorageSlug('Technova Indústria Ltda')).toBe('TECHNOVA_INDUSTRIA_LTDA');
  });

  it('collectLocalOfficePayload inclui registry e simulador', () => {
    const companies: CompanyRecord[] = [
      { id: '1', name: 'EMPRESA A', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    saveCompaniesRegistry(companies);
    localStorage.setItem('simulador_contracts', JSON.stringify([{ id: 'c1', companyName: 'EMPRESA A' }]));
    localStorage.setItem('simulador_precificacao_v1', JSON.stringify([{ companyName: 'EMPRESA A' }]));

    const payload = collectLocalOfficePayload();
    expect(payload.companies_registry).toHaveLength(1);
    expect(payload.simulador_contracts).toHaveLength(1);
    expect(payload.simulador_precificacao).toHaveLength(1);
  });

  it('collectLocalManagerPayload agrupa suffixes por slug', () => {
    const slug = companyStorageSlug('EMPRESA B');
    localStorage.setItem(`contabilfacil_${slug}_plano`, JSON.stringify([{ id: 'p1' }]));
    localStorage.setItem(`contabilfacil_${slug}_razao`, JSON.stringify([{ id: 'r1' }]));

    const payload = collectLocalManagerPayload(slug, 'EMPRESA B');
    expect(payload.company_slug).toBe(slug);
    expect(payload.data?.plano).toHaveLength(1);
    expect(payload.data?.razao).toHaveLength(1);
  });

  it('dispara evento de hidratação com nome canônico', () => {
    const handler = vi.fn();
    const win = globalThis as typeof globalThis & { dispatchEvent?: (e: Event) => boolean; addEventListener?: typeof window.addEventListener; removeEventListener?: typeof window.removeEventListener };
    win.addEventListener?.(EYE_VISION_CLOUD_HYDRATED_EVENT, handler);
    win.dispatchEvent?.(new CustomEvent(EYE_VISION_CLOUD_HYDRATED_EVENT));
    if (win.addEventListener) {
      expect(handler).toHaveBeenCalled();
      win.removeEventListener?.(EYE_VISION_CLOUD_HYDRATED_EVENT, handler);
    } else {
      expect(EYE_VISION_CLOUD_HYDRATED_EVENT).toBe('contabilfacil:data-hydrated');
    }
  });

  it('collectLocalOfficePayload inclui prefs ICMS em extra_storage', () => {
    savePricingIcmsUfPrefs('EMPRESA ICMS', { ufOrigem: 'SP', ufDestino: 'GO' });
    const payload = collectLocalOfficePayload();
    const extraKeys = Object.keys(payload.extra_storage ?? {});
    expect(extraKeys.some((k) => k.includes('icms_uf'))).toBe(true);
    expect(payload.extra_storage?.[extraKeys.find((k) => k.includes('icms_uf'))!]).toEqual({
      ufOrigem: 'SP',
      ufDestino: 'GO',
    });
  });

  it('collectLocalOfficePayload inclui configurações OCR em extra_storage', () => {
    setOcrUserSettings({ quality: 'high', strictFaixaVertical: true });
    setOcrCustomReplacements([{ from: 'O', to: '0' }]);
    setOcrDatePropagationMode('one-per-tx');
    const payload = collectLocalOfficePayload();
    const extra = payload.extra_storage ?? {};
    expect(extra.contabilfacil_ocr_user_settings).toBeTruthy();
    expect(extra.contabilfacil_ocr_custom_replacements_v1).toEqual([{ from: 'O', to: '0' }]);
    expect(extra.contabilfacil_ocr_date_propagation_mode_v1).toBe('one-per-tx');
  });

  it('isContabilfacilManagerDataKey distingue gerencial de prefs', () => {
    const slug = companyStorageSlug('EMPRESA B');
    expect(isContabilfacilManagerDataKey(`contabilfacil_${slug}_plano`)).toBe(true);
    expect(isContabilfacilManagerDataKey('contabilfacil_icms_uf_EMPRESA_B')).toBe(false);
  });

  it('registry persiste em localStorage', () => {
    saveCompaniesRegistry([{ id: 'x', name: 'TESTE', createdAt: '2026-01-01' }]);
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    expect(raw).toContain('TESTE');
  });

  it('detecta erro de cota Firestore', async () => {
    const { isFirestoreQuotaError } = await import('../logic/eyeVisionCloudSync');
    expect(
      isFirestoreQuotaError(new Error('[code=resource-exhausted]: Quota limit exceeded')),
    ).toBe(true);
    expect(
      isFirestoreQuotaError(
        new Error("Quota exceeded for quota metric 'Free daily read units per project'"),
      ),
    ).toBe(true);
    expect(isFirestoreQuotaError(new Error('network offline'))).toBe(false);
  });
});
