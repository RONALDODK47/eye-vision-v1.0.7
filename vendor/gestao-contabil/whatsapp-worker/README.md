# WhatsApp Automacao Gratis (Cloudflare Worker)

Este worker permite automacao do WhatsApp sem Firebase Blaze:

- envio automatico (API)
- webhook de resposta do cliente
- reenvio diario/horario ate responder (cron)
- atualizacao de conversas no Firestore
- salvamento de arquivos recebidos no Firebase Storage (opcional)

## 1) Instalar

```bash
cd whatsapp-worker
npm install
```

## 2) Configurar segredos no Cloudflare

```bash
wrangler secret put INTERNAL_API_KEY
wrangler secret put WHATSAPP_ACCESS_TOKEN
wrangler secret put WHATSAPP_PHONE_NUMBER_ID
wrangler secret put WHATSAPP_VERIFY_TOKEN
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIREBASE_STORAGE_BUCKET
```

Observacoes:
- `INTERNAL_API_KEY`: chave que sera colocada no AppSettings do sistema.
- `FIREBASE_PRIVATE_KEY`: cole a chave privada completa da service account.

## 3) Deploy

```bash
npm run deploy
```

O deploy retorna uma URL parecida com:

`https://gestao-contabil-whatsapp.<sua-conta>.workers.dev`

## 4) Configurar no sistema

No app (`Configuracoes > WhatsApp Automático (Modo Grátis)`):

- Base URL: URL do worker
- API Key: mesmo valor de `INTERNAL_API_KEY`

## 5) Configurar webhook na Meta

- Callback URL: `https://SEU-WORKER/webhook/whatsapp`
- Verify Token: mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Assinar evento: `messages`

## 6) Endpoints internos (app)

- `POST /api/send-now`
- `POST /api/followups/run-now`

Ambos exigem header `x-api-key`.
