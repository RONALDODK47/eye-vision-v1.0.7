# Auditoria pente fino — Gestão Contábil

**Data:** 27/05/2026  
**Versão app:** 0.2.106  
**Executado automaticamente:** build, lint, typecheck + revisão estática de todas as abas.

---

## Resultado dos checks automáticos

| Check | Resultado |
|-------|-----------|
| `npm run build` | OK (1m 31s) |
| `npm run lint` | OK |
| `npm run typecheck` | OK |

---

## Correções já aplicadas nesta sessão

1. **Users** — rota bloqueada para quem não é admin/master/staff interno; dados limitados ao escritório (peers + token), sem `listAll` global.
2. **Exits (Baixa e Saída)** — lista empresas do escritório (mesmo critério que Empresas); exclusão passa a **lixeira** (soft delete), não apaga permanente.
3. **Companies** — `update` exige `canCreateCompanies` (alinha com criar/editar).
4. **LoanControl** — `LoanControl` entrou em `TAB_EDIT_PAGE_KEYS`; banner «só leitura» e mutações passam a respeitar a Gestão.
5. **AppSettings** — removida query `listAll` de perfis com `enabled: !canSeeAppSettings` (bug invertido / vazamento).
6. **App.jsx** — rota `/Users` protegida.
7. **INOV (sessão anterior)** — dados do token `CL-FN14-AZ4ZV81Y` restaurados; admin bootstrap vê só o próprio UID nas abas operacionais.

---

## Checklist por aba (menu lateral)

### Dashboard — OK (com ressalvas)

| Função | Esperado | Status |
|--------|----------|--------|
| Listar empresas do escritório | Por token / peers | OK |
| Gráficos e KPIs | Com base nas empresas visíveis | OK |
| Importar CSV | Só quem pode editar Dashboard na Gestão | MÉDIO — import ainda sem `canEditTab('Dashboard')` explícito |
| Software hub | Troca de módulo local | OK |

### Empresas — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Listar / filtrar / pesquisar | Escritório por token | OK |
| Criar empresa | `canCreateCompanies` | OK |
| Editar / notas / tarefas | Permissões cloud | OK |
| Mover para lixeira | Soft delete | OK |
| Excluir permanente | Só na Lixeira | OK |
| Import/export CSV | Com login | OK |

### Calendário INOV — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Ver prazos | Com `hasOfficeCalendarAccess` | OK |
| Criar/editar/apagar tarefas custom | `canEditCalendarRows` | OK |
| Conclusões (sininho) | Por UID | OK |
| Dados na nuvem | `inov_calendar_data` | OK (restaurado) |

### Baixa e Saída — OK (corrigido)

| Função | Esperado | Status |
|--------|----------|--------|
| Ver histórico baixa/saída | Escritório INOV | OK (corrigido) |
| Editar registo | Update empresa | OK |
| «Excluir» | Lixeira | OK (corrigido) |
| Import CSV | Com permissão | OK (corrigido) |

### Chat — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Threads diretos | Por participantes | OK |
| Enviar / editar / apagar msg | Só remetente | OK |
| Lista de perfis | Filtrada no UI | MÉDIO — ainda pede `listAll` no servidor |

### Recados — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Listar | Peers do escritório | OK |
| CRUD | Autor ou admin/master | OK |
| Marcar lido | Autor ou admin/master | OK |
| Import CSV | Com uid | OK |

### Links úteis — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Listar | Peers / escritório | OK |
| CRUD | Dono ou admin/master | OK |
| Admin bootstrap | Só os próprios (vazio) | OK |
| Staff INOV | Vê links restaurados | OK |

### Lixeira — OK (com ressalvas)

| Função | Esperado | Status |
|--------|----------|--------|
| Empresas apagadas | Escritório (master/staff) | OK |
| Recados apagados | Só os do próprio UID | MÉDIO — master não vê recados de colegas na lixeira |
| Calendário apagado | Snapshot live | OK |
| Restaurar / apagar permanente | Sem gate fino de permissão | MÉDIO — confiar no Firestore |

### Configurações — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Aparência / branding | `canSeeAppSettings` | OK |
| EmailJS / sessão | Local + cloud | OK |
| Convites portal empresa | Só admin | OK |
| Export/import dados | Admin | OK |

### Perfil — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Ver / editar login | Próprio perfil | OK |

### Administrador — OK

| Função | Esperado | Status |
|--------|----------|--------|
| Gestão clientes cloud | Só `isAdminEmail` | OK |
| Tokens / tab access | Admin | OK |

---

## Abas fora do menu (rotas diretas)

| Página | Acesso | Observação |
|--------|--------|------------|
| **Users** | Staff interno / admin / master | Corrigido |
| **LoanControl** | `tabAccess` default true | Permissão edição corrigida |
| **Excel** | LocalStorage | OK — sem cloud |
| **Onboarding** | `tabAccess` false por defeito | ALTO — hard delete se rota aberta |
| **Novidades** | Depende de Calendário | OK |
| **Conversations** | Rota aberta | BAIXO — título «Novidades» errado |
| **ClientPortal** | Portal cliente | ALTO — `Company.listAll` no cliente |

---

## O que testar manualmente ao voltar (5–10 min)

1. Login **ronaldo.silva@inovssc.com.br** (token INOV): Empresas, Links, Calendário, Recados preenchidos.
2. Login **ronaldojunior.gyn@gmail.com** (admin): mesmas abas **vazias**; Administrador e Configurações funcionam.
3. Empresas: criar → editar → lixeira → restaurar na Lixeira.
4. Calendário: criar tarefa custom → marcar conclusão no sininho.
5. Baixa e Saída: abrir registo → «excluir» → confirmar que vai para Lixeira (não some para sempre).

---

## Pendências (não bloqueiam build)

| Prioridade | Item |
|------------|------|
| ALTO | `ClientPortal`: trocar `listAll` por empresas do convite |
| MÉDIO | `Dashboard`: checar `canEditTab` no import CSV |
| MÉDIO | `Trash`: recados do escritório na lixeira para master |
| BAIXO | `Conversations.jsx`: renomear título / remover legado |
| BAIXO | `Onboarding`: soft delete + gate de rota |

---

## Scripts úteis

```bash
npm run build && npm run lint && npm run typecheck
node scripts/restore-inov-office-from-dump.mjs --dry-run
node scripts/purge-admin-data-only.mjs --dry-run
```

---

*Relatório gerado automaticamente; correções de código já commitáveis no working tree.*
