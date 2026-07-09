export type {
  AiPricingTier,
  AiProviderId,
  AiExtractEngine,
  AiProviderInfo,
  AiModelEntry,
  AiTierInfo,
} from './aiModelCatalog';

import type { AiProviderId } from './aiModelCatalog';

export type AiTier = AiProviderId;

export interface AiTierOption {
  tier: AiTier;
  title: string;
  description: string;
  models: { id: string; label: string; hint?: string }[];
}

export interface LocalAiCatalogEntry {
  id: string;
  label: string;
  minRamGb: number;
  description: string;
}

export interface InferenceLimits {
  tier: 'minima' | 'leve' | 'media' | 'confortavel';
  tierLabel: string;
  num_ctx: number;
  num_predict: number;
  num_predict_fast: number;
  num_thread: number;
  useGpu: boolean;
  gpuLayers: number | 'auto';
  totalRamGb: number;
  freeRamGb: number;
  vramGb: number;
  discreteGpu: boolean;
  gpuName?: string;
}

export interface SystemProfile {
  totalRamGb: number;
  freeRamGb: number;
  usableRamGb: number;
  cpuCount: number;
  cpuModel: string;
  platform: string;
  arch: string;
  gpuHint?: string;
  gpuName?: string;
  vramGb?: number;
  discreteGpu?: boolean;
  integratedGpu?: boolean;
  compatibleModels: string[];
  recommendedModelId: string;
}

export interface AiConfig {
  tier: AiTier;
  providerId: AiProviderId;
  model: string;
  localModel?: string;
  pricingTier?: import('./aiModelCatalog').AiPricingTier;
  extractEngine?: import('./aiModelCatalog').AiExtractEngine;
  updatedAt?: string;
}

export interface ProviderKeyStatus {
  configured: boolean;
  source: 'env' | 'ui' | 'none';
  masked: string | null;
  envVar: string;
  storagePath?: string;
}

export type ProviderKeyStatusMap = Partial<Record<AiProviderId, ProviderKeyStatus>>;
