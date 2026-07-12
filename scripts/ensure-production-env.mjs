#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, '.env.production.example');
const target = path.join(root, '.env.production');
const localEnv = path.join(root, '.env');

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const obj = {};
  for (const line of String(fs.readFileSync(filePath, 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) obj[m[1]] = m[2] || '';
  }
  return obj;
}

function serializeEnv(obj) {
  return Object.entries(obj)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n') + '\n';
}

function looksLikePlaceholder(v) {
  if (!v) return true;
  const lower = String(v).toLowerCase();
  return (
    lower.includes('sua_') ||
    lower.includes('alter') ||
    lower.includes('<') ||
    lower.includes('chang') ||
    lower.includes('example') ||
    lower.includes('seu_') ||
    lower.includes('[ref]') ||
    lower.includes('[senha]') ||
    lower.includes('[regiao]')
  );
}

function pickValue(source, key, fallback = '') {
  const value = String(source?.[key] ?? '').trim();
  return value || fallback;
}

function applyDefault(targetObj, sourceObj) {
  for (const [key, fallback] of Object.entries(sourceObj)) {
    if (targetObj[key] === undefined || looksLikePlaceholder(targetObj[key])) {
      const candidate = pickValue(sourceObj, key, fallback);
      if (candidate) targetObj[key] = candidate;
    }
  }
}

if (!fs.existsSync(example)) {
  console.error('[ensure-prod-env] Falta .env.production.example — verifique o repositório.');
  process.exit(1);
}

const exampleEnv = parseEnv(example);
const localEnvData = parseEnv(localEnv);
const processEnvData = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || '',
  MINIO_S3_ENDPOINT: process.env.MINIO_S3_ENDPOINT || '',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
  MINIO_BUCKET: process.env.MINIO_BUCKET || '',
  MINIO_REGION: process.env.MINIO_REGION || '',
  VITE_AGENT_API_URL: process.env.VITE_AGENT_API_URL || '',
  VITE_STORAGE_BACKEND: process.env.VITE_STORAGE_BACKEND || '',
  STORAGE_BACKEND: process.env.STORAGE_BACKEND || '',
  CORS_ALLOWED_ORIGIN: process.env.CORS_ALLOWED_ORIGIN || '',
  VERCEL_TOKEN: process.env.VERCEL_TOKEN || '',
};

let targetEnv = {};
if (fs.existsSync(target)) {
  targetEnv = parseEnv(target);
  console.info('[ensure-prod-env] .env.production já existe — mesclando valores');
} else {
  targetEnv = { ...exampleEnv };
  console.info('[ensure-prod-env] Arquivo .env.production criado a partir de .env.production.example');
}

// defaults from example + local env + process env
const defaults = {
  NODE_ENV: 'production',
  STORAGE_BACKEND: 'supabase',
  VITE_STORAGE_BACKEND: 'supabase',
  AGENT_API_HOST: '0.0.0.0',
  GEMINI_MODEL: 'gemini-2.5-flash',
  MINIO_BUCKET: 'eye-vision',
  MINIO_REGION: 'us-east-1',
  ALLOW_DEV_MIGRATION_ROUTES: 'false',
  CORS_ALLOWED_ORIGIN: 'https://seu-app.vercel.app',
};

for (const [key, fallback] of Object.entries(defaults)) {
  if (!targetEnv[key] || looksLikePlaceholder(targetEnv[key])) {
    targetEnv[key] = fallback;
  }
}

applyDefault(targetEnv, exampleEnv);
applyDefault(targetEnv, localEnvData);
applyDefault(targetEnv, processEnvData);

// keep existing non-placeholder values over defaults
for (const [key, value] of Object.entries(processEnvData)) {
  if (value && (!targetEnv[key] || looksLikePlaceholder(targetEnv[key]))) {
    targetEnv[key] = value;
  }
}

fs.writeFileSync(target, serializeEnv(targetEnv));

const warnings = [];
const errors = [];

if (!targetEnv.DATABASE_URL || looksLikePlaceholder(targetEnv.DATABASE_URL)) {
  errors.push('DATABASE_URL');
}

const hasMinioS3 = Boolean(targetEnv.MINIO_S3_ENDPOINT && !looksLikePlaceholder(targetEnv.MINIO_S3_ENDPOINT));
const hasMinioParts = Boolean(
  targetEnv.MINIO_ENDPOINT &&
  targetEnv.MINIO_ACCESS_KEY &&
  targetEnv.MINIO_SECRET_KEY &&
  !looksLikePlaceholder(targetEnv.MINIO_ACCESS_KEY),
);
if (!hasMinioS3 && !hasMinioParts) {
  warnings.push('MINIO_S3_ENDPOINT ou MINIO_ENDPOINT + MINIO_ACCESS_KEY + MINIO_SECRET_KEY');
}

if (!targetEnv.GEMINI_API_KEY || looksLikePlaceholder(targetEnv.GEMINI_API_KEY)) {
  warnings.push('GEMINI_API_KEY');
}

if (!targetEnv.VITE_AGENT_API_URL || looksLikePlaceholder(targetEnv.VITE_AGENT_API_URL)) {
  warnings.push('VITE_AGENT_API_URL');
}

if (errors.length) {
  console.error('\n[ensure-prod-env] Faltam valores essenciais para produção:');
  for (const item of errors) console.error('  -', item);
  console.error('\nPreencha .env.production ou .env antes de rodar o deploy real.');
  process.exit(1);
}

if (warnings.length) {
  console.warn('\n[ensure-prod-env] Avisos de configuração:');
  for (const item of warnings) console.warn('  -', item);
  console.warn('\nO deploy pode continuar, mas estes valores devem ser ajustados para produção completa.');
}

console.info('[ensure-prod-env] Validação OK — prosseguindo com deploy');
process.exit(0);
