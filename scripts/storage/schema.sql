-- Eye Vision — schema multi-tenant por office_token

CREATE TABLE IF NOT EXISTS access_tokens (
  token TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offices (
  office_token TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  companies_registry JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_company TEXT,
  pricing_companies_registry JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing_selected_company TEXT,
  simulador_contracts JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulador_parcelamentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulador_aplicacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  simulador_precificacao JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra_storage JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS company_manager_data (
  office_token TEXT NOT NULL REFERENCES offices(office_token) ON DELETE CASCADE,
  company_slug TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (office_token, company_slug, suffix)
);

CREATE INDEX IF NOT EXISTS idx_company_manager_token
  ON company_manager_data (office_token);

CREATE TABLE IF NOT EXISTS extrato_pastas (
  id UUID PRIMARY KEY,
  office_token TEXT NOT NULL REFERENCES offices(office_token) ON DELETE CASCADE,
  company_slug TEXT NOT NULL,
  conta_banco TEXT NOT NULL DEFAULT '',
  banco_nome TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT 'Extrato',
  saldo_anterior NUMERIC NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  conciliadas INT NOT NULL DEFAULT 0,
  pendentes INT NOT NULL DEFAULT 0,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_object_key TEXT,
  pdf_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extrato_pastas_token_company
  ON extrato_pastas (office_token, company_slug, created_at DESC);
