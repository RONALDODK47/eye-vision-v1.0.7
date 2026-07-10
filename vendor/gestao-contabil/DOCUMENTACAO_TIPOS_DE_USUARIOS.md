# Documentação: Tipos de Usuários no Sistema Gestão Contábil

Este documento explica claramente a diferença entre os tipos de usuários do sistema para evitar confusões no desenvolvimento e manutenção do código.

---

## 1. Definição dos Tipos de Usuários

### 1.1 Escritório Contábil (Interno) - "Equipa"

**O que é:** São os usuários que **trabalham no escritório contábil** e usam o sistema principal da Gestão Contábil.

**Características:**
- Acessam a aplicação principal (`/`, `/Dashboard`, `/Companies`, etc.)
- Têm permissões de administração/edição no sistema
- Token de acesso: `CGE-...` ou `ADM-...`
- `account_type` no `cloud_access_control` é **`"user"`** (não "client")

**Como identificar no código:**
```javascript
// Verifica se é usuário da equipa interna
const isInternalStaff = String(client.account_type || "user") !== "client";
```

---

### 1.2 Cliente do Escritório (Portal) - "Cliente Final"

**O que é:** São os **clientes do escritório contábil** (empresas ou pessoas físicas) que usam o portal exclusivo para chat e visualização de dados.

**Características:**
- Acessam apenas o portal (`/ClientPortal`)
- Normalmente só têm acesso ao chat (modo "chat_only")
- Token de acesso: `CL-...`
- `account_type` no `cloud_access_control` é **`"client"`**

**Como identificar no código:**
```javascript
// Verifica se é cliente do portal
const isPortalClient = String(client.account_type || "user") === "client";
```

---

### 1.3 Convite Empresa (Portal) - "Cliente Final da Empresa"

**O que é:** Um tipo especial de cliente do portal, vinculado diretamente a uma empresa específica do escritório contábil.

**Características:**
- Token de acesso: `EM-...`
- Configurado em `Configurações → Portal cliente da empresa`
- `gc_empresa_portal_guest === true` no perfil do usuário

---

## 2. Estrutura no Banco de Dados (Firestore)

### Coleção `cloud_access_control/config`
Armazena todos os usuários (equipa e clientes) em um objeto `clients`:
```javascript
clients: {
  "email@escritorio.com": {
    account_type: "user",  // Equipa interna
    assigned_company_token: "CGE-...",
    is_master: true,
    // ...
  },
  "cliente-empresa@portal.gc.local": {
    account_type: "client", // Cliente do portal
    assigned_company_token: "CGE-...",
    portal_enabled: true,
    portal_token: "CL-...",
    // ...
  }
}
```

### Coleção `user_profiles`
Perfis de usuários do Firebase Auth, com flags adicionais:
- `gc_portal_client: true` - Cliente do portal
- `gc_empresa_portal_guest: true` - Convite de empresa
- `gc_empresa_portal_company_ids: [...]` - IDs das empresas vinculadas

---

## 3. Regras Importantes para Desenvolvimento

### 3.1 Sempre use `account_type` para diferenciar
```javascript
// ✅ Correto: Usa account_type para verificar
const isClient = String(row.account_type || "user") === "client";

// ❌ Não use apenas emails ou nomes para inferir
const isClient = email.includes("client"); // Errado!
```

### 3.2 Tokens e seus prefixos
| Prefixo | Tipo de Usuário |
|---------|------------------|
| `CGE-`  | Token de escritório (equipa interna) |
| `ADM-`  | Token de admin geral |
| `CL-`   | Token de cliente do portal |
| `EM-`   | Token de convite de empresa |

### 3.3 Chat: Mensagens
No chat, para diferenciar quem enviou a mensagem, **apenas compare o `sender_uid` com o `uid` do usuário logado**:
```javascript
// ✅ Correto (como já está no Chat.jsx)
const mine = !!uid && !!m.sender_uid && m.sender_uid === uid;

// ❌ Não use isAdminEmail para decidir se a mensagem é "sua"
const mine = (!!uid && !!m.sender_uid && m.sender_uid === uid) || isAdminEmail; // Errado!
```

---

## 4. Fluxo de Criação de Usuários

### 4.1 Criar Equipa Interna (Escritório Contábil)
1. Usuário faz login com e-mail/senha ou Google
2. Usa token `CGE-...` ou `ADM-...` para acessar
3. `account_type` é `"user"`

### 4.2 Criar Cliente do Portal
1. Admin vai para página `Administrador`
2. Clica em "Criar escritório" ou usa o assistente de tokens
3. Sistema cria usuário com:
   - `account_type: "client"`
   - `portal_enabled: true`
   - Token `CL-...` gerado
4. Link do portal é gerado para envio ao cliente

---

## 5. Arquivos Relevantes
- `src/pages/administrator.jsx` - Gerencia usuários (equipa e clientes)
- `src/pages/Chat.jsx` - Chat entre equipa e clientes
- `src/pages/ClientPortal.jsx` - Portal do cliente
- `src/api/dbClient.js` - Entidades do banco de dados
- `src/lib/useCloudAccess.js` - Lógica de acesso e permissões

---

## 6. Checklist para IA/Desenvolvedores
Antes de mexer no código, pergunte-se:
1. [ ] Estou trabalhando com **equipa interna** ou **cliente do portal**?
2. [ ] Estou usando `account_type` para diferenciar?
3. [ ] Estou usando o token correto (prefixo)?
4. [ ] No chat, estou comparando apenas `sender_uid === uid`?

