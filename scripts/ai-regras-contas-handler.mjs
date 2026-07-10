/**
 * IA sugere regras de contas (D/C + contrapartida) a partir de
 * plano + amostra do extrato + anexos (contrato, balancete, coligadas…).
 */
import {
  callGemini,
  callGeminiVision,
  isGeminiConfigured,
  parseGeminiJson,
  sanitizeStrongGeminiModel,
  EXTRACT_MAX_OUTPUT_TOKENS,
  EXTRACT_REQUEST_TIMEOUT_MS,
} from './gemini-client.mjs';
import { loadAiConfig } from './ai-config-store.mjs';
import { isWeakAiModel, findModelInCatalog } from './ai-model-catalog.mjs';

const ANALISTA_CONTABIL_SENIOR = [
  'PAPEL — ANALISTA CONTÁBIL SÊNIOR (OBRIGATÓRIO):',
  'Você NÃO é um assistente genérico. Você é analista contábil sênior brasileiro, com experiência em:',
  '· conciliação bancária e extrato × razão;',
  '· plano de contas Domínio (código reduzido, grupos ATIVO/PASSIVO/RECEITA/DESPESA);',
  '· leitura de balancete, razão, contratos e documentos de inteligência;',
  '· classificação de coligadas, mútuos, empréstimos, impostos e operações financeiras.',
  '',
  'METODOLOGIA DO ANALISTA (siga nesta ordem para CADA lançamento ou regra):',
  '1) LER o histórico completo do extrato e a natureza D/C (saída ou entrada no banco).',
  '2) IDENTIFICAR a natureza econômica: pagamento, recebimento, tarifa, rendimento, aplicação,',
  '   coligada, empréstimo, imposto, folha, transferência interna, pendência.',
  '3) CONSULTAR evidências — nesta ordem de prioridade:',
  '   a) MAPA DE USO DE CONTAS / balancetes na Inteligência IA (como a empresa JÁ lança);',
  '   b) lista de coligadas e aliases;',
  '   c) contratos e anexos de inteligência;',
  '   d) plano de contas (nome da conta × sentido do lançamento);',
  '   e) candidatos automáticos (match nome×histórico), se enviados.',
  '4) ESCOLHER codigoReduzido com julgamento profissional — como faria um analista sênior na mesa,',
  '   não como estagiário chutando conta. Em dúvida real → fundo fixo de caixa (pendência).',
  '5) REGISTRAR no campo motivo a evidência usada (balancete, plano, coligada, contrato).',
  '',
  'COMPORTAMENTO DE SÊNIOR vs JÚNIOR:',
  '· SÊNIOR: cruza extrato + balancete + plano antes de decidir.',
  '· SÊNIOR: reconhece padrão da empresa (mesma conta que já tem movimento).',
  '· SÊNIOR: distingue coligada de cliente/fornecedor; rendimento de fornecedor; tarifa de PIX.',
  '· JÚNIOR (PROIBIDO): chutar conta genérica sem ler o plano; confundir nomes parecidos;',
  '  inventar codigoReduzido; classificar coligada como fornecedor; ignorar balancete.',
  '',
  'CAMPO resumo: escreva como analista sênior — 2–4 frases em PT-BR:',
  'quantas regras corrigiu/criou, principais achados (ex.: "3 coligadas estavam em fornecedor"),',
  'e se a cobertura do lote ficou completa.',
  '',
  'CAMPO motivo (cada regra): 1 frase técnica citando a evidência.',
  'Ex.: "Balancete: reduzido 510 RECEITA FINANCEIRA — rendimento BB Rende".',
  'Ex.: "Coligada AJTF — conta mútuo ativo, não fornecedor".',
].join('\n');

const ISOLAMENTO_EMPRESA = [
  'ISOLAMENTO POR EMPRESA (CRÍTICO — NUNCA MISTURAR DADOS):',
  '- Plano de contas, regras de extrato, balancete, razão, coligadas e Inteligência IA são EXCLUSIVOS da empresa no campo "Empresa:".',
  '- Use SOMENTE o plano e as regras enviados neste payload — NUNCA reutilize conta de outra empresa.',
  '- Cada codigoReduzido deve existir no plano DESTA empresa; importado/criado nesta empresa.',
  '- Se faltar conta no plano desta empresa, use fundo fixo ou não sugira — NÃO copie de outra empresa.',
].join('\n');

const COBERTURA_CONCILIACAO = [
  'COBERTURA 100% DA CONCILIAÇÃO (OBRIGATÓRIO — UMA ÚNICA ANÁLISE, SEM LOTES):',
  '- Você recebe TODOS os padrões sem regra DE UMA VEZ — processe a conciliação inteira nesta resposta.',
  '- É PROIBIDO dividir mentalmente em lotes ou ignorar padrões do final da lista.',
  '- PRIORIDADE ABSOLUTA: PRECISÃO — cada regra deve estar correta; melhor fundo fixo que conta errada.',
  '- Crie regras para cobrir 100% dos padrões enviados em "SEM REGRA".',
  '- Leia TODOS os documentos da Inteligência IA (contratos, coligadas, balancetes, sócios).',
  '',
  'CATEGORIAS OBRIGATÓRIAS (crie regra quando o extrato tiver o padrão):',
  '· SÓCIOS / PRÓ-LABORE / RETIRADAS / DISTRIBUIÇÃO DE LUCROS — docs de sócios/contrato social + plano',
  '· COLIGADAS — cruze MAPA COLIGADAS + plano + balancete (conta com nome da empresa coligada; NUNCA fornecedor/cliente/reavaliação)',
  '· HONORÁRIOS — pagamento a contador/escritório/assessoria contábil',
  '· TARIFAS BANCÁRIAS — tarifa, cesta, pacote, manutenção, IOF bancário',
  '· FORNECEDOR — PIX/TED/boleto saída a terceiros → conta GERAL FORNECEDORES + descricao "PIX EMIT" etc.',
  '· CLIENTE — PIX/TED/liquidação entrada → conta GERAL CLIENTES + descricao "PIX REC" etc.',
  '· FUNDO FIXO DE CAIXA — histórico com NOME/RAZÃO DA PRÓPRIA EMPRESA (mesmo nome da empresa analisada)',
  '  ou lançamento ambíguo sem evidência nos docs → fundo fixo (pendência)',
  '· IMPOSTOS E OBRIGAÇÕES — DARF, GPS, FGTS, ISS, INSS, IRPJ, CSLL, PIS, COFINS:',
  '  → Só use conta de imposto ESPECÍFICA se o histórico citar QUAL imposto é.',
  '  → Se NÃO der para saber qual imposto (DARF/RFB/CODE/TRIBUTO genérico): SEMPRE FUNDO FIXO DE CAIXA.',
  '· RENDIMENTOS / APLICAÇÕES FINANCEIRAS — BB Rende, juros, CDB (NUNCA fornecedor/cliente)',
  '· EMPRÉSTIMOS / MÚTUOS — natureza D/C + contrato quando houver',
  '· FOLHA / SALÁRIOS — quando histórico indicar',
  '· DEMAIS DESPESAS E OBRIGAÇÕES que você identificar no plano e nos documentos',
].join('\n');

const MATCH_CONTA_POR_NOME = [
  'MATCH DE CONTA — RACIOCÍNIO DO ANALISTA SÊNIOR:',
  '- Para CADA lançamento, leia o histórico COMPLETO do extrato.',
  '- Busque no PLANO DE CONTAS a conta cujo NOME tem o MESMO SENTIDO do lançamento.',
  '- Compare palavras-chave: tarifa↔TARIFAS BANCARIAS; rendimento↔RECEITA FINANCEIRA;',
  '  aplicação↔APLICAÇÃO FINANCEIRA; fornecedor↔FORNECEDORES; cliente↔CLIENTES;',
  '  coligada↔conta com nome da empresa coligada ou PARTES RELACIONADAS/MÚTUO;',
  '  imposto genérico (DARF/RFB/CODE sem tipo)↔FUNDO FIXO DE CAIXA;',
  '  imposto específico (IRPJ, PIS…)↔conta do MESMO tipo no plano.',
  '- Use o bloco CANDIDATOS DE CONTA (se enviado) — são matches automáticos nome×histórico.',
  '- Use o MAPA DE USO DE CONTAS — se a empresa já lança na conta X, prefira X.',
  '- NÃO chute conta genérica se existir conta específica com nome que combina.',
  '- NÃO troque conta certa por conta errada só para "agrupar".',
  '- No motivo, cite: "plano: reduzido N — NOME DA CONTA" ou "balancete: reduzido N".',
].join('\n');

const BALANCETE_INTELIGENCIA = [
  'BALANCETE / RAZÃO / INTELIGÊNCIA IA (CRÍTICO — LEIA ANTES DE SUGERIR CONTA):',
  '- O bloco "MAPA DE USO DE CONTAS" mostra ONDE a empresa JÁ LANÇA no razão/balancete importado.',
  '- Os documentos [BALANCETES · …] na Inteligência IA mostram o histórico contábil real da empresa.',
  '- ANTES de escolher contaContrapartida: leia o lançamento do extrato + consulte o mapa/balancete.',
  '- Escolha a conta (codigoReduzido) que a empresa JÁ USA para operações do MESMO TIPO:',
  '  · rendimentos/juros → conta de RECEITA que aparece no mapa (grupo RECEITA)',
  '  · aplicação/resgate BB Rende → conta de APLICAÇÃO no ATIVO que aparece no mapa',
  '  · tarifas → DESPESA financeira que já tem movimento',
  '  · fornecedor/cliente genérico → contas gerais que já têm saldo no PASSIVO/ATIVO',
  '- O balancete revela o PADRÃO da empresa — não invente conta que não aparece no mapa se houver equivalente.',
  '- Cruze: descrição do extrato + natureza D/C + grupo de conta no balancete + plano de contas.',
  '- No motivo, cite a evidência: "balancete: reduzido X — RECEITA FINANCEIRA" ou "mapa razão: conta Y".',
].join('\n');

const RENDIMENTO_APLICACAO = [
  'RENDIMENTOS / APLICAÇÕES (BB RENDE, AUT MAIS, REND PAGO APLIC — CRÍTICO):',
  '- NÃO são fornecedor nem cliente — PROIBIDO usar FORNECEDORES ou CLIENTES.',
  '- Crédito de rendimento/juros (RENDIMENTOS, REND PAGO APLIC, BB RENDE crédito) →',
  '  RECEITA FINANCEIRA / JUROS SOBRE APLICAÇÃO (código reduzido do plano).',
  '  descricao da regra = "RENDIMENTO APLICACAO" (UMA regra cobre todos os rendimentos).',
  '- Débito de aplicação/resgate (BB RENDE débito, APLIC, CDB, RESGATE) →',
  '  APLICAÇÃO FINANCEIRA / CDB / investimento (ativo).',
  '  descricao da regra = "APLICACAO FINANCEIRA".',
  '- Poucas regras agrupadas: todos os rendimentos → 1 regra; todos os PIX recebidos genéricos → 1 regra "PIX REC".',
].join('\n');

const AGRUPAR_FORNECEDOR_CLIENTE = [
  'FORNECEDOR / CLIENTE — SEMPRE CONTA GERAL (CRÍTICO — NÃO INFLAR O BALANCETE):',
  '- Pagamentos a fornecedores (PIX emitido, TED, boleto, título) → conta GERAL "FORNECEDORES" / "FORNECEDORES DIVERSOS".',
  '- Recebimentos de clientes (PIX recebido, TED, liquidação) → conta GERAL "CLIENTES" / "CLIENTES DIVERSOS".',
  '- É PROIBIDO criar uma regra por razão social (ex.: "ACME LTDA", "JOAO SILVA ME") nesses casos.',
  '- É PROIBIDO usar conta do plano cujo nome seja o nome da empresa do extrato (conta nominal).',
  '- descricao da regra = padrão OPERACIONAL agrupado (ex.: "PIX EMIT", "PIX REC", "TED ENV", "PAGAMENTO TITULO"),',
  '  NÃO o nome da empresa. Assim vários lançamentos caem na MESMA regra e na MESMA conta geral.',
  '- Exceções (aí SIM pode conta específica): COLIGADA, EMPRÉSTIMO/MÚTUO, tarifa, imposto, folha, fundo fixo,',
  '  ou quando o USUÁRIO no chat pedir explicitamente uma conta/nome.',
].join('\n');

const NOME_COMPLETO_CONTA = [
  'NOME COMPLETO — SÓ PARA COLIGADAS / CONTAS ESPECIAIS (NÃO PARA FORNECEDOR/CLIENTE GENÉRICO):',
  '- Em COLIGADAS: leia o nome INTEIRO — "POLO SUL CLIMATIZACAO" ≠ "POLO SUL REFRIGERACAO".',
  '- Em fornecedor/cliente de terceiros: NÃO case razão social no plano — use conta GERAL (ver regra acima).',
  '- Se houver dúvida entre duas contas de coligada parecidas, prefira a que tem mais palavras em comum.',
].join('\n');

const EMPRESTIMO_NATUREZA = [
  'EMPRÉSTIMO / MÚTUO — NATUREZA DA OPERAÇÃO (CRÍTICO — SÓ PARA EMPRÉSTIMO):',
  '- Olhe a NATUREZA do lançamento (D = dinheiro saindo do banco; C = dinheiro entrando).',
  '- Saída (nature=D) de EMPRÉSTIMO/MÚTUO/COLIGADA (concessão, mútuo ativo, empréstimo a receber):',
  '  → contaContrapartida no ATIVO (empréstimo a receber, mútuo ativo, partes relacionadas ativo).',
  '  → É PROIBIDO usar conta de PASSIVO (empréstimo a pagar / financiamento a pagar) nesses casos.',
  '- Entrada (nature=C) de EMPRÉSTIMO/LIBERAÇÃO/CRÉDITO DE EMPRÉSTIMO (empréstimo tomado):',
  '  → contaContrapartida no PASSIVO (empréstimo a pagar / financiamento).',
  '- Exceção — PAGAMENTO/AMORTIZAÇÃO/PARCELA de empréstimo (débito no banco pagando dívida):',
  '  → aí sim use PASSIVO (reduz o empréstimo a pagar).',
  '- CONTRATO OBRIGATÓRIO para conta específica de empréstimo:',
  '  → Cada empréstimo no plano é POR NÚMERO DE CONTRATO (no nome da conta ou nos docs de inteligência).',
  '  → Só use conta de empréstimo específica se o nº do contrato estiver no histórico do extrato',
  '    OU se documentos de inteligência (contrato, balancete, anexo) identificarem qual empréstimo é.',
  '  → SEM identificação do contrato: use FUNDO FIXO DE CAIXA (pendência) — NÃO chute passivo/ativo genérico.',
  '- No motivo, diga se foi "concessão→ativo", "liberação→passivo", "pagamento/amortização→passivo" ou "pendência→fundo fixo".',
  '- Esta regra vale ESPECIFICAMENTE para empréstimo/mútuo — não altere a lógica de fornecedor, cliente, tarifa etc.',
].join('\n');

const FUNDO_FIXO_PENDENCIA = [
  'FUNDO FIXO DE CAIXA — PENDÊNCIA / CLASSIFICAR DEPOIS (CRÍTICO):',
  '- Quando NÃO der para saber com CERTEZA qual conta usar, use FUNDO FIXO DE CAIXA do plano.',
  '- IMPOSTO / TRIBUTO / DARF / RFB / RECEITA FEDERAL / GPS / CODE / CONV ORGAOS / SISPAG TRIBUTO',
  '  SEM identificar QUAL imposto é (sem IRPJ, CSLL, PIS, COFINS, ISS, FGTS, INSS, ICMS, IPI…):',
  '  → SEMPRE FUNDO FIXO DE CAIXA — é PROIBIDO chutar conta de imposto específica.',
  '- Empréstimo/financiamento SEM número de contrato identificável no extrato e SEM documento de inteligência:',
  '  → FUNDO FIXO DE CAIXA — NÃO chute empréstimo Sicoob/Bradesco genérico.',
  '- Qualquer lançamento ambíguo onde duas ou mais contas seriam possíveis e não há evidência nos anexos:',
  '  → FUNDO FIXO DE CAIXA.',
  '- Busque no plano conta cujo nome contenha "FUNDO FIXO" ou "FUNDO FIXO DE CAIXA".',
  '- No motivo, diga "pendência — fundo fixo de caixa".',
].join('\n');

const PRECISAO_MAXIMA = [
  'PRECISAO MAXIMA (CRÍTICO — NUNCA ERRAR):',
  '- Só sugira regra se tiver CERTEZA da conta no plano (codigoReduzido existente).',
  '- Em DÚVIDA: NÃO chute conta de imposto nem de empréstimo — use FUNDO FIXO DE CAIXA (pendência).',
  '- Fornecedor/cliente genérico em dúvida: conta GERAL (FORNECEDORES/CLIENTES).',
  '- NUNCA invente codigoReduzido. NUNCA use classificação hierárquica.',
  '- NUNCA troque coligada por cliente/fornecedor.',
  '- NUNCA use conta nominal de empresa para fornecedor/cliente genérico.',
  '- nature DEVE bater com o lançamento do extrato (D=saída, C=entrada).',
  '- descricao DEVE casar com o histórico (padrão operacional ou nome da coligada).',
  '- Se duas contas forem possíveis, escolha a GERAL (forn/cli) ou a de COLIGADA — nunca a errada.',
  '- PRIORIDADE: PRECISÃO 100%. É melhor devolver MENOS regras certas do que uma errada.',
].join('\n');

const SYSTEM = [
  ANALISTA_CONTABIL_SENIOR,
  '',
  'TAREFA: sugerir REGRAS DE CONTAS para conciliação do extrato bancário.',
  'Cada regra: trecho da DESCRIÇÃO do extrato → natureza D ou C → conta CONTRAPARTIDA (codigoReduzido).',
  'PRIORIDADE: julgamento de analista sênior — precisão 100%. Menos regras certas > uma errada.',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos, ex.: "85", "147", "0000147").',
  '- É PROIBIDO usar classificação hierárquica (ex.: "2.1.10.100.001", "1.1.10.200.001").',
  '- No plano enviado, o campo "codigoReduzido" é o único válido para contaContrapartida.',
  '- Se a conta não tiver codigoReduzido, NÃO sugira essa conta.',
  '',
  PRECISAO_MAXIMA,
  '',
  ISOLAMENTO_EMPRESA,
  '',
  COBERTURA_CONCILIACAO,
  '',
  MATCH_CONTA_POR_NOME,
  '',
  BALANCETE_INTELIGENCIA,
  '',
  NOME_COMPLETO_CONTA,
  '',
  AGRUPAR_FORNECEDOR_CLIENTE,
  '',
  RENDIMENTO_APLICACAO,
  '',
  EMPRESTIMO_NATUREZA,
  '',
  FUNDO_FIXO_PENDENCIA,
  '',
  'EMPRESAS COLIGADAS (CRÍTICO — NÃO CONFUNDIR COM CLIENTE NEM FORNECEDOR):',
  '- Coligadas / controladas / do mesmo grupo NÃO são clientes nem fornecedores de terceiros.',
  '- ANTES de escolher conta: leia MAPA COLIGADAS → CONTAS NO PLANO E BALANCETE + plano + razão.',
  '- A conta correta é a que tem o NOME da coligada no plano (razão social) ou movimento no balancete.',
  '- Recebimento ou pagamento envolvendo coligada → conta de COLIGADA / PARTES RELACIONADAS / EMPRÉSTIMO ENTRE EMPRESAS / MÚTUO do plano.',
  '- Em coligada: saída (D) → preferir ATIVO (mútuo/empréstimo a receber); entrada (C) → preferir PASSIVO (mútuo/empréstimo a pagar), salvo se o plano tiver conta específica de coligada.',
  '- É PROIBIDO usar conta cujo nome contenha FORNECEDOR / FORN / DUPLICATA para coligada.',
  '- É PROIBIDO usar conta de CLIENTE para coligada.',
  '- É PROIBIDO usar reavaliação de ativos, depreciação, capital social ou conta sem relação com a coligada.',
  '- Aliases da mesma coligada devem ser tratados como UMA entidade. Exemplos equivalentes:',
  '  AJTF = A.J.T.F = A J T F = A. J. T. F = A.J.T.F. (ignore pontos e espaços entre letras).',
  '- Se o histórico citar qualquer forma da coligada (ex.: PIX AJTF, TED A.J.T.F, ONIX COMERCIO, IMPERIO, POLO SUL REFRIGERACAO quando for coligada),',
  '  a regra NÃO pode usar conta de cliente nem de fornecedor.',
  '- No motivo, diga explicitamente "coligada (não cliente/fornecedor)".',
  '',
  'Use:',
  '- Plano de contas (só códigos reduzidos reais — NUNCA invente).',
  '- Amostra de lançamentos do extrato (padrões de histórico).',
  '- Lista estruturada de coligadas + aliases (prioridade máxima).',
  '- Anexos / documentos de inteligência: contrato social, sócios, coligadas, empréstimos, balancete.',
  '- Mensagem do usuário com particularidades.',
  '',
  'Regras boas:',
  '- Fornecedor/cliente: descricao = padrão operacional (PIX EMIT / PIX REC) + conta GERAL — NÃO por nome.',
  '- Coligada: UMA regra por natureza (D e C). descricao = nome canônico curto (ex.: AJTF).',
  '- NÃO crie regras separadas por alias (AJTF, A J T F, A.J.T.F) — aliases casam na mesma regra.',
  '- NÃO crie uma regra por linha do extrato (PIX RECEBIDO A J T vs PIX ENVIADO A J T F) — use a entidade.',
  '- nature = D (saída/débito no banco) ou C (entrada/crédito no banco).',
  '- contaContrapartida = codigoReduzido EXATO do plano (geral para forn/cli; específica só em exceções).',
  '- motivo = 1 frase curta.',
  '',
  'Responda SOMENTE JSON válido:',
  '{"resumo":"texto curto em PT-BR","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 200 regras por análise. Se não houver evidência, use fundo fixo — não invente conta.',
  'Se a mensagem do usuário pedir conta específica (ex.: fundo fixo), OBEDEÇA — use essa conta do plano.',
].join('\n');

const SYSTEM_CHAT = [
  ANALISTA_CONTABIL_SENIOR,
  '',
  'MODO CHAT — o pedido do usuário tem prioridade, mas você continua agindo como analista sênior.',
  'Atenda EXATAMENTE o que o usuário pediu (ex.: "muda Polo Sul Climatização para fundo fixo de caixa").',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos).',
  '- É PROIBIDO usar classificação hierárquica.',
  '',
  NOME_COMPLETO_CONTA,
  '',
  PRECISAO_MAXIMA,
  '',
  COBERTURA_CONCILIACAO,
  '',
  MATCH_CONTA_POR_NOME,
  '',
  BALANCETE_INTELIGENCIA,
  '',
  AGRUPAR_FORNECEDOR_CLIENTE,
  '',
  RENDIMENTO_APLICACAO,
  '',
  EMPRESTIMO_NATUREZA,
  '',
  FUNDO_FIXO_PENDENCIA,
  '',
  'INSTRUÇÕES DO CHAT:',
  '- Se o usuário pedir MUDAR / ALTERAR / TROCAR / JOGAR uma regra ou histórico para outra conta:',
  '  devolva a MESMA descricao (ou o trecho do histórico) com a NOVA contaContrapartida.',
  '- Se citar um nome no extrato + uma conta destino, crie OU atualize regras para TODOS os lançamentos/regras que casam.',
  '- descricao = trecho estável COM nome completo (ex.: POLO SUL CLIMATIZACAO).',
  '- nature = D ou C conforme o lançamento (ou a regra existente).',
  '- contaContrapartida = codigoReduzido da conta pedida — busque no plano pelo NOME.',
  '- É PROIBIDO devolver regras=[] se o pedido for claro e a conta existir no plano.',
  '- É PROIBIDO ignorar o pedido do usuário ou inventar outra conta.',
  '- Trabalhe no LOTE + nas regras existentes enviadas. Priorize o texto do usuário.',
  '',
  'Responda SOMENTE JSON:',
  '{"resumo":"...","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 200 regras por análise.',
].join('\n');

const SYSTEM_CORRIGIR = [
  ANALISTA_CONTABIL_SENIOR,
  '',
  'MODO GERAR REGRAS — analista sênior executa TRÊS TAREFAS OBRIGATÓRIAS:',
  '1) ANALISAR se regras/lançamentos existentes estão CORRETOS vs Inteligência IA, balancete e plano.',
  '2) CORRIGIR regras erradas (conta, coligada, nome completo, natureza do empréstimo).',
  '3) GERAR regras novas para TODOS os lançamentos SEM regra — cobertura 100%.',
  '',
  'REGRA OBRIGATÓRIA — CÓDIGO REDUZIDO:',
  '- contaContrapartida DEVE ser o CÓDIGO REDUZIDO Domínio (1 a 7 dígitos).',
  '- É PROIBIDO usar classificação hierárquica (ex.: "2.1.10.100.001").',
  '',
  NOME_COMPLETO_CONTA,
  '',
  PRECISAO_MAXIMA,
  '',
  COBERTURA_CONCILIACAO,
  '',
  MATCH_CONTA_POR_NOME,
  '',
  BALANCETE_INTELIGENCIA,
  '',
  AGRUPAR_FORNECEDOR_CLIENTE,
  '',
  RENDIMENTO_APLICACAO,
  '',
  EMPRESTIMO_NATUREZA,
  '',
  FUNDO_FIXO_PENDENCIA,
  '',
  'TAREFA 1 — ANALISAR E CORRIGIR REGRAS ERRADAS (conforme Inteligência IA):',
  '- Compare cada regra existente com contratos, balancetes, coligadas e outros docs.',
  '- Se a contaContrapartida estiver errada (ex.: cliente em vez de coligada; REFRIGERAÇÃO em vez de CLIMATIZAÇÃO;',
  '  empréstimo saindo apontando para PASSIVO em vez de ATIVO), devolva a MESMA descricao+nature com a conta CORRETA.',
  '- Se a descrição da regra for genérica demais e os docs/extrato pedem nome completo, devolva a versão corrigida.',
  '- Coligadas (AJTF / A.J.T.F / A J T F) NUNCA usam conta de CLIENTE.',
  '- Empréstimo nature=D (concessão) NUNCA usa passivo; nature=C (liberação) usa passivo; amortização/pagamento usa passivo.',
  '',
  'TAREFA 2 — COBERTURA DOS NÃO CONCILIADOS (OBRIGATÓRIO 100%):',
  '- A lista "Lançamentos SEM regra" deve ser 100% coberta — É PROIBIDO deixar qualquer um sem regra.',
  '- É PROIBIDO devolver regras=[] se houver descobertos OU se houver regra existente claramente errada.',
  '- Fornecedor/cliente: UMA regra por padrão operacional (PIX EMIT, PIX REC…) na conta GERAL — NÃO por empresa.',
  '- Se vários lançamentos são PIX emitidos a empresas diferentes, UMA regra "PIX EMIT" → FORNECEDORES basta.',
  '- Rendimentos (RENDIMENTOS, BB RENDE, REND PAGO APLIC) → "RENDIMENTO APLICACAO" na RECEITA FINANCEIRA — NUNCA fornecedor/cliente.',
  '- Aplicações/resgates (BB RENDE débito, APLIC, CDB) → "APLICACAO FINANCEIRA" no ativo — NUNCA fornecedor.',
  '- Se não souber a conta exata operacional (exceto rendimento/aplicação), use FORNECEDORES (D) ou CLIENTES (C) do plano.',
  '- Imposto RFB/DARF genérico ou empréstimo sem contrato identificável → FUNDO FIXO DE CAIXA (pendência).',
  '- Se ainda assim não achar conta geral, use FUNDO FIXO DE CAIXA antes de chutar conta errada.',
  '',
  'EMPRESAS COLIGADAS (CRÍTICO):',
  '- Coligadas NÃO são clientes NEM fornecedores. AJTF = A.J.T.F = A J T F = A. J. T. F.',
  '- Recebimento/pagamento de coligada → conta de coligada/partes relacionadas/mútuo (NUNCA CLIENTE, NUNCA FORNECEDOR).',
  '- Coligada saída (D) → ATIVO (mútuo a receber); coligada entrada (C) → PASSIVO (mútuo a pagar), se o plano tiver.',
  '- Se a lista estruturada de coligadas citar ONIX, IMPERIO, POLO SUL REFRIGERACAO, ECONOMICA, A.J.T.F etc.,',
  '  trate TODAS como coligadas — não só AJTF.',
  '- Ao corrigir regra existente que aponta FORNECEDOR para uma coligada, TROQUE a conta imediatamente.',
  '',
  'Use documentos de inteligência, coligadas, plano e regras existentes.',
  'Responda SOMENTE JSON:',
  '{"resumo":"...","regras":[{"descricao":"...","nature":"D"|"C","contaContrapartida":"85","motivo":"..."}]}',
  'Máximo 200 regras. Inclua CORREÇÕES + regras novas para TODOS os padrões sem regra.',
  'UMA ÚNICA ANÁLISE COMPLETA — não processe parcialmente.',
].join('\n');

function normalizeNature(v) {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return s === 'C' || s === 'CREDITO' || s === 'CRÉDITO' ? 'C' : 'D';
}

function isClassificacao(val) {
  const v = String(val ?? '').trim();
  if (!v) return false;
  if (v.includes('.')) return /^\d+(\.\d+)+$/.test(v);
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8;
}

function sanitizeReduzido(val) {
  const v = String(val ?? '').trim();
  if (!/^\d{1,7}$/.test(v)) return '';
  return v;
}

function resolveReduzidoFromPlano(raw, plano) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  const asRed = sanitizeReduzido(input);
  if (asRed) {
    const hit = plano.find((p) => sanitizeReduzido(p.codigoReduzido) === asRed);
    if (hit) return asRed;
    // Aceita reduzido mesmo se lista veio só com code=reduzido
    const hitCode = plano.find((p) => sanitizeReduzido(p.code) === asRed || sanitizeReduzido(p.codigoReduzido || p.code) === asRed);
    if (hitCode) return asRed;
  }
  const norm = (s) => s.replace(/[^\d]/g, '');
  const inputNorm = norm(input);
  const byClassif = plano.find((p) => {
    const code = String(p.code ?? '').trim();
    return code === input || norm(code) === inputNorm;
  });
  if (byClassif) return sanitizeReduzido(byClassif.codigoReduzido);
  if (isClassificacao(input)) return '';
  return asRed;
}

function sanitizeSuggestedRules(raw, plano) {
  const list = Array.isArray(raw) ? raw : [];
  const reduzidoSet = new Set(
    (plano ?? [])
      .map((p) => sanitizeReduzido(p.codigoReduzido) || sanitizeReduzido(p.code))
      .filter(Boolean),
  );
  const out = [];
  const seen = new Set();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const descricao = String(item.descricao ?? item.description ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const rawConta = String(
      item.contaContrapartida ?? item.codigoReduzido ?? item.conta ?? item.code ?? '',
    ).trim();
    const contaContrapartida = resolveReduzidoFromPlano(rawConta, plano);
    if (!descricao || !contaContrapartida) continue;
    if (reduzidoSet.size > 0 && !reduzidoSet.has(contaContrapartida)) continue;
    const key = `${descricao}|${normalizeNature(item.nature)}|${contaContrapartida}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      descricao,
      nature: normalizeNature(item.nature),
      contaContrapartida,
      motivo: String(item.motivo ?? item.reason ?? '').trim().slice(0, 200),
    });
    if (out.length >= 200) break;
  }
  return out;
}

const MATCH_STOP = new Set([
  'DE', 'DA', 'DO', 'DOS', 'DAS', 'PARA', 'POR', 'COM', 'LTDA', 'ME', 'SA',
  'PIX', 'TED', 'DOC', 'ENVIADO', 'EMIT', 'RECEBIDO', 'REC', 'PAGTO', 'BANCO',
]);

function normMatchText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTokens(text) {
  return normMatchText(text).split(/\s+/).filter((t) => t.length >= 3 && !MATCH_STOP.has(t));
}

function scoreContaParaHistorico(historico, nature, conta) {
  const hist = normMatchText(historico);
  const nome = normMatchText(conta.name);
  if (!hist || !nome) return 0;
  const histTokens = new Set(matchTokens(hist));
  const nomeTokens = matchTokens(nome);
  let matched = 0;
  for (const nt of nomeTokens) {
    for (const ht of histTokens) {
      if (ht === nt || ht.includes(nt) || nt.includes(ht)) {
        matched++;
        break;
      }
    }
  }
  let score = matched * 18;
  if (matched === nomeTokens.length && nomeTokens.length >= 2) score += 35;
  if (/TARIFA|CESTA/.test(nome) && /TARIFA|CESTA|PACOTE/.test(hist)) score += 40;
  if (/RENDIMENTO|RECEITA\s+FINANCEIRA|JUROS/.test(nome) && /REND|JUROS|BB\s+RENDE|APLIC/.test(hist)) score += 40;
  if (/APLIC|CDB|INVEST/.test(nome) && /APLIC|CDB|RESGATE|BB\s+RENDE/.test(hist)) score += 35;
  if (/FORNEC|DUPLICATA/.test(nome) && nature === 'D') score += 12;
  if (/\bCLIENTE/.test(nome) && nature === 'C') score += 12;
  if (/COLIGAD|MUTUO|EMPREST|PARTES/.test(nome) && /COLIGAD|MUTUO|EMPREST/.test(hist)) score += 25;
  return Math.min(100, score);
}

function buildContaCandidatosTexto(lancamentos, plano) {
  const lines = [
    '=== CANDIDATOS DE CONTA POR LANÇAMENTO (match nome/sentido no plano) ===',
    'Escolha o codigoReduzido cujo NOME combina com o histórico — prioridade sobre chute genérico.',
  ];
  let count = 0;
  for (const row of (lancamentos ?? []).slice(0, 200)) {
    const nature = normalizeNature(row.nature);
    const hits = [];
    for (const p of plano) {
      const red = sanitizeReduzido(p.codigoReduzido) || sanitizeReduzido(p.code);
      if (!red) continue;
      const score = scoreContaParaHistorico(row.description, nature, p);
      if (score >= 28) hits.push({ red, name: p.name, score });
    }
    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, 4);
    if (!top.length) continue;
    count++;
    lines.push(
      `· [${nature}] ${String(row.description ?? '').slice(0, 72)} → ${top.map((c) => `reduzido ${c.red} (${c.name})`).join(' | ')}`,
    );
  }
  if (!count) return '';
  return lines.join('\n').slice(0, 12_000);
}

function buildUserPayload(body) {
  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const extrato = Array.isArray(body?.extratoSample) ? body.extratoSample : [];
  const regrasExistentes = Array.isArray(body?.regrasExistentes) ? body.regrasExistentes : [];
  const anexosTexto = Array.isArray(body?.anexosTexto) ? body.anexosTexto : [];
  const balanceteUsoContas = String(body?.balanceteUsoContas ?? '').trim();
  const inteligenciaBalancetes = Array.isArray(body?.inteligenciaBalancetes)
    ? body.inteligenciaBalancetes
    : [];
  const coligadas = Array.isArray(body?.coligadas) ? body.coligadas : [];
  const uncovered = Array.isArray(body?.uncoveredExtrato) ? body.uncoveredExtrato : [];
  const modulosContexto = String(body?.modulosContexto ?? '').trim();
  const mode = String(body?.mode ?? 'sugerir');

  // Reduzido + nome + grupo (ATIVO/PASSIVO/…) — sem classificação hierárquica.
  // O grupo é necessário para a regra de empréstimo (saída→ATIVO, entrada→PASSIVO).
  const planoParaIa = plano
    .map((p) => {
      const grupo = String(p.group ?? p.grupo ?? '')
        .trim()
        .toUpperCase();
      return {
        codigoReduzido: sanitizeReduzido(p.codigoReduzido) || sanitizeReduzido(p.code) || '',
        name: p.name,
        ...(grupo && ['ATIVO', 'PASSIVO', 'DESPESA', 'RECEITA', 'PATRIMONIO_LIQUIDO', 'CUSTO'].includes(grupo)
          ? { grupo }
          : {}),
      };
    })
    .filter((p) => p.codigoReduzido);

  const coligadasParaIa = coligadas
    .map((c) => ({
      nome: String(c?.nome ?? '').trim(),
      aliases: Array.isArray(c?.aliases) ? c.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
      contaReduzida: sanitizeReduzido(c?.contaReduzida) || undefined,
      tipo: 'COLIGADA_NAO_E_CLIENTE',
    }))
    .filter((c) => c.nome);

  const lines = [
    `Empresa: ${body?.company ?? ''}`,
    `Banco das regras (código reduzido): ${body?.contaBanco ?? ''} — ${body?.bancoNome ?? ''}`,
    `Modo: ${mode}`,
    '',
    '--- Mensagem do usuário ---',
    String(body?.message ?? '').trim() || '(sem texto — use só os anexos e o contexto)',
    '',
    '--- Empresas COLIGADAS (NÃO são clientes NEM fornecedores; aliases equivalentes) ---',
    coligadasParaIa.length
      ? JSON.stringify(coligadasParaIa.slice(0, 80))
      : '(nenhuma cadastrada — ainda assim, se o anexo citar coligada/AJTF/grupo, NÃO use conta de cliente nem fornecedor)',
    '',
    '--- Plano (código reduzido + nome + grupo ATIVO/PASSIVO/… — NÃO use classificação hierárquica) ---',
    JSON.stringify(planoParaIa.slice(0, 600)),
    '',
    `--- Padrões do extrato (${extrato.length} — agrupados por tipo de operação) ---`,
    JSON.stringify(extrato.slice(0, 500)),
    '',
    `--- Regras já cadastradas (${regrasExistentes.length}) ---`,
    JSON.stringify(regrasExistentes.slice(0, 200)),
  ];

  if (modulosContexto) {
    lines.push('', '--- Contexto módulos / categorias obrigatórias ---', modulosContexto.slice(0, 8_000));
  }

  if (
    (mode === 'corrigir_cobertura' || regrasExistentes.length > 0) &&
    mode !== 'chat_pedido' &&
    mode !== 'implantar'
  ) {
    lines.push(
      '',
      '--- TAREFA 1: AUDITAR regras existentes vs documentos de inteligência ---',
      'Devolva correções (mesma descricao+nature, contaContrapartida certa) para regras que conflitem com os docs.',
      'Exemplos de erro: coligada classificada como cliente; nome parecido trocado; conta do plano errada.',
    );
  }

  if (mode === 'corrigir_cobertura' || mode === 'implantar' || mode === 'chat_pedido' || uncovered.length > 0) {
    lines.push(
      '',
      `--- PADRÕES SEM REGRA — COBERTURA 100% (${uncovered.length}) — ANÁLISE ÚNICA, SEM LOTES ---`,
      JSON.stringify(uncovered.slice(0, 500)),
      '',
      mode === 'chat_pedido'
        ? 'OBRIGATÓRIO: atenda o PEDIDO DO USUÁRIO. Altere regras existentes e/ou crie novas conforme o pedido.'
        : 'OBRIGATÓRIO: crie/corrija regra para CADA padrão acima. Cobertura 100% da conciliação. Uma regra por entidade/padrão.',
      'PRECISÃO primeiro: fundo fixo se ambíguo; nunca conta errada.',
      'Leia TODOS os documentos da Inteligência IA antes de decidir.',
    );
  }

  if (balanceteUsoContas) {
    lines.push(
      '',
      '--- MAPA DE USO DE CONTAS (razão/balancete importado — PRIORIDADE MÁXIMA) ---',
      balanceteUsoContas.slice(0, 14_000),
    );
  }

  const candidatosTexto = buildContaCandidatosTexto(
    uncovered.length ? uncovered : extrato,
    planoParaIa,
  );
  if (candidatosTexto) {
    lines.push('', '--- CANDIDATOS DE CONTA (match automático nome × histórico) ---', candidatosTexto);
  }

  if (inteligenciaBalancetes.length) {
    lines.push(
      '',
      `--- Balancetes / razão na Inteligência IA (${inteligenciaBalancetes.length} doc(s)) ---`,
      inteligenciaBalancetes.join('\n---\n').slice(0, 32_000),
    );
  }

  const outrosAnexos = anexosTexto.filter(
    (t) =>
      !t.includes('MAPA DE USO DE CONTAS') &&
      !inteligenciaBalancetes.some((b) => b && t.includes(b.slice(0, 40))),
  );
  if (outrosAnexos.length) {
    lines.push(
      '',
      `--- Outros documentos de inteligência (${outrosAnexos.length}) ---`,
      outrosAnexos.join('\n---\n').slice(0, 32_000),
    );
  } else if (anexosTexto.length && !balanceteUsoContas && !inteligenciaBalancetes.length) {
    lines.push(
      '',
      `--- Documentos de inteligência / anexos ---\n${anexosTexto.join('\n---\n').slice(0, 40_000)}`,
    );
  }

  lines.push(
    '',
    'INSTRUÇÃO FINAL — ANALISTA CONTÁBIL SÊNIOR:',
    'Sugira/corrija regras com julgamento profissional. contaContrapartida = codigoReduzido (nunca classificação com pontos).',
    'Antes de cada conta: consulte MAPA DE USO DE CONTAS + balancetes + candidatos + plano.',
    'FORNECEDOR/CLIENTE genérico: conta GERAL + descricao operacional (PIX EMIT / PIX REC).',
    'RENDIMENTO/APLICACAO: BB RENDE → NUNCA fornecedor/cliente.',
    'Coligada no histórico → conta com NOME da coligada no plano/balancete — NUNCA fornecedor, cliente nem reavaliação.',
    'motivo de cada regra DEVE citar evidência (balancete, plano, coligada).',
    'resumo = parecer do analista sênior sobre a conciliação completa.',
  );

  return lines.filter(Boolean).join('\n');
}

/**
 * @param {Record<string, unknown>} body
 */
export async function handleAiSuggestRegrasContas(body) {
  if (!isGeminiConfigured()) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: 'gemini_not_configured',
        detail: 'Configure a chave Gemini em Contábil → IA ou no .env',
        resumo: '',
        regras: [],
      },
    };
  }

  const config = loadAiConfig();
  const requestedModel = body?.model || config?.model || undefined;
  const catalogHit = findModelInCatalog(requestedModel);
  if (catalogHit && isWeakAiModel(catalogHit)) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: 'weak_model_blocked',
        detail:
          'Modelo fraco (Lite/Mini) bloqueado para regras de contas. Selecione Gemini 2.5 Flash ou superior em Contábil → IA.',
        resumo: '',
        regras: [],
      },
    };
  }
  const model = sanitizeStrongGeminiModel(requestedModel);
  const images = Array.isArray(body?.images)
    ? body.images.filter((img) => img?.base64 && img?.mimeType).slice(0, 16)
    : [];
  const plano = Array.isArray(body?.plano) ? body.plano : [];
  const userContent = buildUserPayload(body);
  const mode = String(body?.mode ?? 'sugerir');
  const systemInstruction =
    mode === 'corrigir_cobertura' || mode === 'implantar'
      ? SYSTEM_CORRIGIR
      : mode === 'chat_pedido'
        ? SYSTEM_CHAT
        : SYSTEM;

  try {
    const out =
      images.length > 0
        ? await callGeminiVision({
            model,
            strongOnly: true,
            systemInstruction,
            userText: userContent,
            images,
            temperature: 0,
            jsonMode: true,
            maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
            timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
          })
        : await callGemini({
            model,
            strongOnly: true,
            systemInstruction,
            userContent,
            temperature: 0,
            jsonMode: true,
            maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
            timeoutMs: EXTRACT_REQUEST_TIMEOUT_MS,
          });

    const parsed = parseGeminiJson(out.text) ?? {};
    const regras = sanitizeSuggestedRules(parsed.regras ?? parsed.rules, plano);
    const resumo =
      String(parsed.resumo ?? parsed.summary ?? '').trim() ||
      (regras.length
        ? `Sugeri ${regras.length} regra(s) com base no plano, extrato e anexos.`
        : 'Não encontrei regras novas com segurança. Envie mais particularidades ou um balancete/contrato.');

    return {
      status: 200,
      body: {
        ok: true,
        model: out.model,
        resumo,
        regras,
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        ok: false,
        reason: 'gemini_error',
        detail: err?.userHint ?? (err instanceof Error ? err.message : 'Falha na IA'),
        resumo: '',
        regras: [],
      },
    };
  }
}
