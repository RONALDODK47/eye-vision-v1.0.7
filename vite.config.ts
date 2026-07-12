import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type {Plugin, ProxyOptions} from 'vite';
import {defineConfig} from 'vite';
import {agentApiDevFallback} from './scripts/vite-agent-api-fallback.mjs';
import {viteDevBackendPlugin} from './scripts/vite-dev-backend-plugin.mjs';

const GESTAO_ROOT = path.resolve(__dirname, 'vendor/gestao-contabil');
const GESTAO_SRC = path.resolve(GESTAO_ROOT, 'src');
const GESTAO_AUTH_CONTEXT = path.resolve(GESTAO_SRC, 'lib/AuthContext.jsx');
const GESTAO_AUTH_CORE = path.resolve(GESTAO_SRC, 'lib/authContextCore.js');
const GESTAO_QUERY_CLIENT = path.resolve(__dirname, 'src/gestaoContabil/gestaoQueryClient.ts');
const REACT_QUERY_PKG = path.resolve(__dirname, 'node_modules/@tanstack/react-query');

/** Resolve `@/` (padrão da Gestão Contábil) para `GESTAO-CONTABIL/src`. */
function gestaoAtAlias(): Plugin {
  return {
    name: 'gestao-at-alias',
    enforce: 'pre',
    resolveId(source) {
      if (!source.startsWith('@/')) return null;
      const rel = source.slice(2);
      if (rel === 'lib/useCloudAccess' || rel === 'lib/useCloudAccess.js') {
        return path.resolve(__dirname, 'src/gestaoContabil/useCloudAccessBridge.ts');
      }
      const exts = ['', '.jsx', '.tsx', '.js', '.ts', '.json'];
      for (const ext of exts) {
        const full = path.resolve(GESTAO_SRC, `${rel}${ext}`);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      }
      for (const indexExt of ['index.ts', 'index.tsx', 'index.js', 'index.jsx']) {
        const indexFull = path.resolve(GESTAO_SRC, rel, indexExt);
        if (fs.existsSync(indexFull)) return indexFull;
      }
      return null;
    },
  };
}

/** Admin Eye Vision: escopo completo no Dashboard (sem aviso bootstrap). */
function gestaoAdminScopePatch(): Plugin {
  return {
    name: 'gestao-admin-scope-patch',
    transform(code, id) {
      if (!id.includes('gestao-contabil') || !id.replace(/\\/g, '/').endsWith('/pages/Dashboard.jsx')) {
        return null;
      }
      if (!code.includes('Conta administrador bootstrap')) return null;
      return code.replace(
        '{isAdminEmail && (',
        '{isAdminEmail && !internalStaffFullAccess && (',
      );
    },
  };
}

/// <reference types="vitest/config" />

import pkg from './package.json';

/** Base pública: GitHub Pages termina em /v1.0.7/; Vercel usa /v1.0.7/ */
function resolveAppBasePath(): string {
  const explicit = String(process.env.VITE_BASE_PATH || '').trim();
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    return `/v${pkg.version}/`;
  }
  return '/';
}

/** Dev / preview: API fiscal local + séries BCB (evita CORS no browser). */
const devPreviewProxy: Record<string, ProxyOptions> = {
  '/api/fiscal-nfe': {
    target: 'http://127.0.0.1:8780',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api\/fiscal-nfe/, ''),
  },
  '/api/brasilapi': {
    target: 'https://brasilapi.com.br',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/api\/brasilapi/, ''),
  },
  '/api/bcb': {
    target: 'https://api.bcb.gov.br',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/api\/bcb/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
        proxyReq.setHeader(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 EmprestimosSim/1.0'
        );
      });
    },
  },
};

export default defineConfig(() => ({
    base: resolveAppBasePath(),
    plugins: [react(), tailwindcss(), gestaoAtAlias(), gestaoAdminScopePatch(), viteDevBackendPlugin(), agentApiDevFallback()],
    test: {
      globals: false,
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
      setupFiles: ['src/test/vitest.setup.ts'],
    },
    resolve: {
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-router',
        'react-router-dom',
        '@tanstack/react-query',
        'firebase',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        '@firebase/app',
        '@firebase/auth',
        '@firebase/firestore',
        '@firebase/webchannel-wrapper',
      ],
      alias: {
        '@gestao': GESTAO_SRC,
        '@gestao/lib/AuthContext.jsx': GESTAO_AUTH_CONTEXT,
        '@gestao/lib/AuthContext': GESTAO_AUTH_CONTEXT,
        '@gestao/lib/query-client': GESTAO_QUERY_CLIENT,
        '@/lib/query-client': GESTAO_QUERY_CLIENT,
        '@/lib/AuthContext': GESTAO_AUTH_CONTEXT,
        '@/lib/authContextCore': GESTAO_AUTH_CORE,
        '@/lib/useCloudAccess': path.resolve(__dirname, 'src/gestaoContabil/useCloudAccessBridge.ts'),
        '@/api/dbClient': path.resolve(GESTAO_SRC, 'api/dbClient.js'),
        '@tanstack/react-query': REACT_QUERY_PKG,
        firebase: path.resolve(__dirname, 'node_modules/firebase'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-router-dom',
        '@tanstack/react-query',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        '@radix-ui/react-select',
        '@radix-ui/react-dialog',
        '@radix-ui/react-slot',
        'class-variance-authority',
        'recharts',
      ],
    },
    server: {
      fs: {
        allow: [__dirname, GESTAO_ROOT],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      port: 3000,
      host: 'localhost',
      strictPort: true,
      hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      proxy: devPreviewProxy,
    },
    preview: {
      proxy: devPreviewProxy,
    },
    worker: {
      format: 'es',
      plugins: () => [gestaoAtAlias()],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('d3-')) return 'vendor-charts';
            if (id.includes('pdfjs-dist')) return 'vendor-pdf';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf')) return 'vendor-jspdf';
            if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@tanstack/react-query')) return 'vendor-react-query';
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          },
        },
      },
    },
}));
