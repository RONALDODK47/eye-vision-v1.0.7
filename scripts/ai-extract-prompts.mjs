/**
 * Prompts de extração/reparo de extrato — assertivos e específicos por banco.
 */

export const CONCILIACAO_TOLERANCIA_REAIS = 0.1;

export function detectBankHint(fileName, ocrText) {
  const blob = `${fileName ?? ''} ${ocrText ?? ''}`.toLowerCase();
  if (/banco\s*do\s*brasil|sisbb|internet\s+banking\s+empresarial|\bbb\b.*extrato/i.test(blob)) {
    return 'bb';
  }
  if (/ita[uú]|itaú\s+empresas/i.test(blob)) return 'itau';
  if (/sicoob|sisbr/i.test(blob)) return 'sicoob';
  if (/bradesco/i.test(blob)) return 'bradesco';
  if (/sicredi|cooperativa.{0,40}748|associado.{0,80}sicredi/i.test(blob)) return 'sicredi';
  if (/caixa\s+econ/i.test(blob)) return 'caixa';
  return null;
}

function bankRulesAppendix(bank) {
  switch (bank) {
    case 'bb':
      return [
        '',
        '### Banco do Brasil (prioridade se detectado)',
        '- Colunas: Data | Histórico/Ag-Lote | Documento | Valor R$ C/D | Saldo.',
        '- Em cada linha com DOIS valores monetários, o LANÇAMENTO é o par «valor + C ou D» ANTES do saldo trailing.',
        '- NUNCA importe o saldo da coluna direita como valor do lançamento.',
        '- Ex.: «390,52 C 1.234,56 D» → crédito 390,52 (Pix), ignore 1.234,56 (saldo).',
        '- Histórico Pix: use só «Pix - Recebido» / «Pix - Enviado» — remova CPF/CNPJ colado.',
        '- SISPAG multilinha: funda fornecedor + valor em UM lançamento.',
      ].join('\n');
    case 'itau':
      return [
        '',
        '### Itaú',
        '- Pode haver colunas Crédito e Débito separadas OU valor único com natureza.',
        '- Não confunda coluna Saldo com lançamento.',
        '- SISPAG/TED/PIX multilinha = um lançamento com histórico completo.',
      ].join('\n');
    case 'sicoob':
      return [
        '',
        '### Sicoob',
        '- Valor único com sufixo C/D na mesma coluna.',
        '- Ignore linhas de saldo informativo entre lançamentos.',
      ].join('\n');
    case 'sicredi':
      return [
        '',
        '### Sicredi (prioridade se detectado)',
        '- Layout típico escaneado: Data | Descrição | Documento | Valor (R$) | Saldo (R$).',
        '- O LANÇAMENTO é o valor da coluna «Valor (R$)» — NUNCA importe o «Saldo (R$)» da coluna direita.',
        '- Formato comum: valor com sufixo C (crédito/entrada) ou D (débito/saída) na mesma célula.',
        '- Alguns extratos têm colunas Entrada e Saída separadas — use só a coluna com valor na linha.',
        '- Ignore: Saldo anterior, Saldo bloq., Saldo do dia, Saldo total disponível, Saldo total disponível dia.',
        '- Ignore cabeçalhos (Cooperativa, Conta, Associado), rodapés e totais de período.',
        '- CAPTACAO, INVESTIMENTOS, CONTA CORRENTE são rótulos de conta — não são lançamentos.',
        '- Inclua PIX, TED, DOC, tarifas, IOF, rendimentos, convênios, débito automático, transferências.',
        '- Datas DD/MM — complete com o ano do período «Extrato (Período de … a …)».',
      ].join('\n');
    case 'bradesco':
      return [
        '',
        '### Bradesco',
        '- Colunas Crédito e Débito separadas OU valor único com natureza.',
        '- Não confunda coluna Saldo com lançamento.',
      ].join('\n');
    case 'caixa':
      return [
        '',
        '### Caixa Econômica',
        '- Valor do lançamento separado do saldo acumulado.',
        '- Ignore linhas de saldo do dia e totais informativos.',
      ].join('\n');
    default:
      return '';
  }
}

export function buildExtratoAiExtractSystem(bankHint) {
  return [
    'Você é extrator contábil especializado em extratos bancários brasileiros.',
    'Objetivo: lista COMPLETA e CONCILIADA de lançamentos operacionais — assertividade acima de velocidade.',
    '',
    'Retorne SOMENTE JSON válido:',
    '{',
    '  "rows": [',
    '    {',
    '      "data": "DD/MM/AAAA",',
    '      "descricao": "histórico operacional completo",',
    '      "valorCredito": "vazio ou 1.234,56",',
    '      "valorDebito": "vazio ou 1.234,56",',
    '      "valorMisto": "vazio ou 1.234,56 C/D se coluna única",',
    '      "_linhaOcr": "linha reconstruída do PDF"',
    '    }',
    '  ],',
    '  "saldoAnterior": number,',
    '  "saldoFinal": number',
    '}',
    '',
    '## Regras obrigatórias',
    '1. Cada lançamento tem EXATAMENTE um valor operacional (crédito OU débito, nunca os dois).',
    '2. Valores em formato BR: 1.234,56 — sem R$ no JSON.',
    '3. Crédito (C) = entrada na conta; Débito (D) = saída.',
    '4. NÃO inclua como lançamento: SALDO ANTERIOR, SALDO DO DIA, SALDO TOTAL, totais de débitos/créditos, cabeçalhos, rodapés, URLs.',
    '5. saldoAnterior = valor EXATO da linha «Saldo anterior» visível no PDF (número decimal). Se não houver essa linha, use null — NUNCA invente nem ajuste para fechar o saldo.',
    '6. saldoFinal = «Saldo total disponível» / último saldo do período (número decimal).',
    '7. Valide: saldoAnterior + Σcréditos − Σdébitos = saldoFinal (tolerância R$ 0,10).',
    '8. Se não fechar, devolva mesmo assim os lançamentos encontrados — corrija rows faltantes/erradas; NÃO altere saldoAnterior para forçar conciliação.',
    '9. Descrições multilinha (SISPAG + nome, TED + favorecido) = UM único lançamento.',
    '10. Datas sempre DD/MM/AAAA (complete o ano se o PDF só mostrar DD/MM).',
    '11. Inclua TED, PIX, SISPAG, tarifas, IOF, rendimentos, estornos, bloqueios.',
    '12. JSON compacto — sem markdown, sem texto antes/depois do objeto.',
    bankRulesAppendix(bankHint),
  ]
    .filter(Boolean)
    .join('\n');
}

export const EXTRATO_AI_FILL_MISSING_SYSTEM = [
  'Você completa lançamentos FALTANTES em extratos bancários brasileiros.',
  'A extração anterior NÃO fecha o saldo: saldoAnterior + créditos − débitos ≠ saldoFinal.',
  '',
  'Retorne SOMENTE JSON:',
  '{ "rows": [ { "data", "descricao", "valorCredito", "valorDebito", "valorMisto", "_linhaOcr" } ] }',
  '',
  'Inclua APENAS lançamentos operacionais que FALTAM (não repita os já listados).',
  'Procure no OCR/imagem: PIX, TED, SISPAG, tarifas, IOF, rendimentos omitidos.',
  'BB: se a linha tem valor C/D + saldo trailing, extraia só o valor do lançamento.',
  'Valores formato BR. Um valor por linha (crédito OU débito).',
].join('\n');

export const EXTRATO_AI_REPAIR_SYSTEM = [
  'Você corrige uma extração de extrato bancário brasileiro que NÃO concilia.',
  'Analise imagem/OCR e a lista atual; devolva a lista COMPLETA corrigida.',
  '',
  'Retorne SOMENTE JSON:',
  '{',
  '  "rows": [ { "data", "descricao", "valorCredito", "valorDebito", "valorMisto", "_linhaOcr" } ],',
  '  "saldoAnterior": number,',
  '  "saldoFinal": number',
  '}',
  '',
  'Corrija: duplicatas, lançamentos faltando, valores trocados, crédito/débito invertido,',
  'saldo trailing confundido com lançamento (comum no BB), datas erradas, SISPAG fragmentado.',
  'saldoAnterior + Σcréditos − Σdébitos deve igualar saldoFinal (±R$ 0,10).',
  'Não inclua linhas só de saldo informativo.',
].join('\n');

export const EXTRATO_AI_REFINE_SYSTEM = [
  'Você refina linhas OCR (Tesseract) de extrato bancário brasileiro para importação contábil.',
  '',
  'Retorne JSON: { "rows": [ { "data", "descricao", "valorCredito", "valorDebito", "valorMisto", "_linhaOcr" } ] }',
  '',
  'Corrija sem inventar lançamentos:',
  '- Datas coladas ou incompletas → DD/MM/AAAA',
  '- Histórico truncado ou multilinha → unificar SISPAG/TED/PIX',
  '- Valor na coluna errada → crédito OU débito (nunca ambos)',
  '- BB: valor do lançamento = par monetário+C/D antes do saldo trailing',
  '- Remova ruído de cabeçalho/rodapé',
  '- Mantenha valores formato BR; preserve ordem cronológica',
].join('\n');

export function buildPlanoAiExtractSystem() {
  return [
    'Você extrai plano de contas contábil brasileiro de PDF ou imagem.',
    'Objetivo: lista COMPLETA de contas analíticas e sintéticas do plano.',
    '',
    'Retorne SOMENTE JSON válido:',
    '{',
    '  "rows": [',
    '    {',
    '      "codigoReduzido": "código numérico Domínio ou vazio",',
    '      "codigoClassificacao": "1.1.1.01.0001",',
    '      "descricao": "NOME DA CONTA",',
    '      "tipo": "S ou A",',
    '      "nivel": "1-6",',
    '      "_linhaOcr": "linha reconstruída do PDF"',
    '    }',
    '  ]',
    '}',
    '',
    '## Regras obrigatórias',
    '1. codigoClassificacao = código hierárquico com pontos (ex.: 1.1.1.01.0001).',
    '2. codigoReduzido = código reduzido numérico quando existir na coluna; senão vazio.',
    '3. tipo: S = sintética (grupo), A = analítica (conta movimentável).',
    '4. nivel = grau no plano (quantidade de níveis hierárquicos ou coluna Grau/Nível).',
    '5. NÃO inclua cabeçalhos, totais, rodapés, títulos de seção sem conta.',
    '6. Uma conta por elemento em rows — preserve a ordem do documento.',
    '7. Descrições multilinha = uma única conta com descrição completa.',
    '8. JSON compacto — sem markdown, sem texto antes/depois do objeto.',
    '',
    '### Relatório Domínio (PDF impresso — ex.: A Econômica)',
    'Colunas: Código | T | Classificação | Nome | Grau.',
    '- Primeira coluna estreita com «1» é marcador — ignore.',
    '- Código = código reduzido numérico (1, 5, 1016…).',
    '- T = S (sintética) ou A (analítica); contas analíticas podem omitir T.',
    '- Classificação = hierárquica com pontos (1, 1.1, 1.1.1.01.00001).',
    '- Grau = nível 1–5 no plano.',
    '- Não inclua cabeçalho, rodapé «Sistema licenciado», CNPJ nem folha.',
  ].join('\n');
}

export const PLANO_AI_REFINE_SYSTEM = [
  'Você refina linhas OCR de plano de contas brasileiro para importação contábil.',
  '',
  'Retorne JSON: { "rows": [ { "codigoReduzido", "codigoClassificacao", "descricao", "tipo", "nivel", "_linhaOcr" } ] }',
  '',
  'Corrija sem inventar contas:',
  '- Códigos colados ou truncados → formato hierárquico com pontos',
  '- Descrição truncada ou multilinha → unificar',
  '- tipo S/A conforme coluna Sintética/Analítica ou padrão do plano',
  '- nivel/grau correto',
  '- Remova ruído de cabeçalho/rodapé',
  '- Preserve ordem do documento',
  '',
  '### Domínio (relatório PDF)',
  'Layout: Código | T | Classificação | Nome | Grau — ignore coluna marcador «1» à esquerda.',
  'Contas analíticas (grau 5, código com .00001) costumam não ter T — use tipo A.',
].join('\n');
