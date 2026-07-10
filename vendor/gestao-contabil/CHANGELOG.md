# Changelog

Todas as mudanças relevantes neste projeto serão documentadas aqui.

## Unreleased

## 0.2.31 - 2026-04-09

- **Empréstimo entre empresas**: saldos **por empresa e mês** (`inter_party_balance_entries`); agregado `inter_monthly_balances` derivado; cartão com detalhe por contrapartida no mês; formulário com linhas por empresa + bloco opcional de saldo líquido único; migração ao editar registos só “a pagar” ou só “a receber”.
- **Controle de empréstimos**: opção **Último período com dados** (ignora o mês do seletor por card); PDF alinhado aos lançamentos por empresa.
- Versão **0.2.31** publicada no Firebase Hosting.

## 0.2.30 - 2026-04-08

- **Empréstimo bancário** (`LoanControl`): correção ao **criar** registo — não enviar `FieldValue.delete()` no primeiro `addDoc` (Firestore rejeitava e o empréstimo não era gravado); `onError` na mutação de salvamento com alerta ao utilizador; coluna e textos **“data do pagamento”** (em vez de só “vencimento”); cartão com **1º pagamento**; exportação PDF alinhada.
- **Empréstimo entre empresas**: **Empresa** obrigatória **antes do Tipo** — nome no **título do card** (bancário: mesma empresa como tomadora no topo); **quantidade de empresas a pagar** e **quantidade a receber** (até 15 cada) com seletores por linha; persistência `inter_pay_company_ids`, `inter_receive_company_ids`, `inter_anchor_company_id`; natureza do saldo **pagar** / **receber** / **liquido** (quando há os dois lados: saldo mensal **com sinal**, positivo = a receber líquido, negativo = a pagar líquido); compatibilidade com contratos antigos (uma contrapartida inferida); cartões, textos de ajuda e **PDF** atualizados.
- **`loanCalculations`**: funções auxiliares (`normalizeInterCompanyIdList`, `getInterSaldoNaturezaLoan`, `inferInterAnchorCompanyId`, `getInterPayReceiveCompanyIds`, …); regras de **quitado** para saldo líquido (~0).
- Versão **0.2.30** publicada no Firebase Hosting.

## 0.2.23 - 2026-03-29

- **Empréstimos** (`/LoanControl`): nova aba no menu para empréstimos **bancários** e **entre empresas** (credora × tomadora), com valor total do contrato, parcelas, saldo a pagar, parcela atual e ajuste rápido de parcelas pagas; saldo devedor **manual** opcional quando o banco divergir do cálculo linear. Coleção Firestore `loan_controls` e regras de segurança.
- **Chat direto**: correção para abrir conversa ao clicar no usuário (`otherUid` derivado do ID do tópico) e regra Firestore para `getDoc` em tópico ainda inexistente.
- **Dashboard → Empresas**: filtro “Analisar” (mensal/anual) alinhado às outras abas; gráfico com três séries (novas pela **Implantação**, saídas, total na base por mês); contagem de total respeita `created_at` / `tasks_start_date` e legados sem data.
- **Dashboard → Saídas**: gráfico azul só com **início de tarefas de saída** para empresas **Saída/Baixa** (`exit_tasks_start_date`, com legado em `exit_date`); vermelho só saídas/baixas; lista “Empresas em saída ou baixa” com atalho para **tarefas** em Empresas; ao registrar saída, grava `exit_tasks_start_date`.
- **Sites úteis**: exibição de URL, categoria e descrição em cada card; **editar**; `UsefulSite.update` no `dbClient`.
- **Empresas**: modal de tarefas com lista completa de empresas (inclui saída/baixa); navegação a partir do Dashboard com `state` para abrir tarefas da empresa.
- **Firestore**: índices e regras atualizados (`loan_controls`, chat direto, etc.).
- Versão **0.2.23** publicada no Hosting e regras/índices no Firestore.

## 0.2.11 - 2026-03-26

- Nova aba **Usuários** (`/Users`): lista quem acessou o sistema, empresas e tarefas por login.
- Registro automático de perfil em **`user_profiles`** ao entrar (nome, e-mail, último acesso).
- API: `UserProfile.touch` / `listAll` e `CompanyTask.listAll` no `dbClient`.
- **Firestore**: coleção `user_profiles`; leitura de `companies` e `tasks` para qualquer usuário autenticado (escrita continua restrita ao dono do `uid`).
- Na aba Usuários: seletor de **mês/ano**, **porcentagem de conclusão** das tarefas **mensais** (mesma lógica do dashboard, empresas ativas e início contábil) e campo **Observações mensais** por empresa.
- Versão publicada no Firebase Hosting (`0.2.11`).

## 0.2.1 - 2026-03-13

- Correção da herança de tarefas para novas empresas: ao criar/importar em "Empresas" e "Implantação", as tarefas padrão de "Todas as Empresas" passam a ser aplicadas automaticamente.
- Novo mecanismo de templates de tarefas (`task_templates`) com sincronização para criar/editar/excluir tarefas em lote e manter o padrão global.
- Fallback robusto quando não há template salvo (ou sem acesso à coleção): inferência automática das tarefas padrão a partir das tarefas existentes.
- Auto-sincronização para empresas ativas sem tarefas, com prevenção de duplicidade ao reaplicar padrões.
- Inclusão da ação de excluir registros na aba de "Baixa e Saída de Empresas".

## 0.2.0 - 2026-03-12

- Regras de negócio de implantação separadas das empresas ativas, com passagem automática para "Empresas" após conclusão.
- Dashboard expandido com filtros por empresa, ajustes de métricas mensais/anuais e novos cartões de acompanhamento.
- Melhorias na aba de saídas: edição de registros, motivo principal por período e gráfico de motivos em linha.
- Melhorias de layout/UX em cards, recados e tarefas para evitar esticamento de tela e facilitar leitura.
- Importação CSV refinada em múltiplas abas com modelos e tratamento de dados.
- Inclusão da central de conversas com base para WhatsApp/e-mail, sininho de novidades no menu e registro de histórico.
- Ajustes em tarefas contábeis: visualização/edição no modo em lote e contagem correta de empresas concluídas.

## 0.1.1 - 2026-03-11

- Login manual com e-mail e senha no card de autenticação.
- Botões de entrar e criar conta com feedback visual durante autenticação.
- Fallback e melhorias no fluxo de autenticação para evitar travamento no carregamento.
- Melhorias de estabilidade e ajustes visuais em telas principais.

## 0.1.0 - 2026-03-10

- Versão inicial do sistema.
- Login com Google via Firebase Auth.
- Persistência de dados via Firestore.
- Deploy via Firebase Hosting.

