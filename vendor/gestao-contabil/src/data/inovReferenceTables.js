/**
 * Quadros de referência col. K–M do CALENDARIO INOV (extraídos de CALENDARIO INOV (1).xlsx, aba Abril).
 * Textos alinhados à planilha (UTF-8).
 */

export const INOV_REFERENCE_TABLES_NOTE =
  "Fonte: planilha CALENDARIO INOV — tabelas laterais (Gestão Contábil, Gestão Pessoal, Fiscal, Paralegal).";

/** @typedef {{ sectionTitle: string, col1: string, col2: string, col3: string, rows: { c1: string, c2: string, c3: string }[] }} InovRefSection */

/** @type {InovRefSection[]} */
export const INOV_REFERENCE_SECTIONS = [
  {
    sectionTitle: "Gestão Contábil",
    col1: "Grupo",
    col2: "Empresas",
    col3: "Entrega",
    rows: [
      {
        c1: "1",
        c2: "Lucro real e isentas e imunes prestação de contas,",
        c3: "Balancete mensal",
      },
      {
        c1: "2",
        c2: "Lucro presumido, empresas participantes de licitação",
        c3: "Balancete 40 dias",
      },
      {
        c1: "3",
        c2: "Simples Nacional, prestadores de serviço e demais",
        c3: "Balancete 50 dias",
      },
    ],
  },
  {
    sectionTitle: "Gestão Pessoal",
    col1: "Grupo",
    col2: "Empresas",
    col3: "Entrega",
    rows: [
      {
        c1: "1",
        c2:
          "Informações fixas de folha não tem lançamentos variáveis (produtividade, prêmio, faltas, horas) ou que passam a informação até o fim do mês e domésticas",
        c3: "Folha até o último dia útil do mês corrente",
      },
      {
        c1: "2",
        c2: "Empresas que entregam informações após 1º dia útil do mês subsequente",
        c3: "Folha até o terceiro dia do mês subsequente",
      },
      {
        c1: "3",
        c2: "Empresas que possuem fator R (no momento não tem)",
        c3: "Folha após fechamento do fiscal",
      },
    ],
  },
  {
    sectionTitle: "Fiscal — obrigações e prazos",
    col1: "Grupo",
    col2: "Critério",
    col3: "Entrega",
    rows: [
      { c1: "Fase 1", c2: "", c3: "" },
      { c1: "Fase 2", c2: "", c3: "" },
      { c1: "Fase 3", c2: "", c3: "" },
      { c1: "Fase 4", c2: "", c3: "" },
      { c1: "Fase 5", c2: "", c3: "" },
    ],
  },
  {
    sectionTitle: "Paralegal — abertura de empresas e alterações",
    col1: "Grupo",
    col2: "Critério",
    col3: "Entrega",
    rows: [
      {
        c1: "Fase 1",
        c2:
          "Reunião de alinhamento com o cliente estudo do modelo de negócio, análise de regimes, obrigações e cadastros e critérios que possam causar problemas",
        c3: "3 dias",
      },
      {
        c1: "Fase 2",
        c2:
          "Confecção contrato social e protocolo na Junta Comercial do estado ou Portal do Empreendedor simultaneamente Receita Federal e município",
        c3: "7 dias",
      },
      {
        c1: "Fase 3",
        c2:
          "Conferências de inscrições municipal, estado e órgãos competentes bombeiros, vigilância, ambiental Anvisa MAPA e órgãos competentes dependendo do caso (alterações se encerra aqui)",
        c3: "5 dias",
      },
      {
        c1: "Fase 4",
        c2:
          "Cadastros para emissão de notas, prefeitura, estado, credenciamentos necessários e modelos de documentos fiscais",
        c3: "3 dias",
      },
      {
        c1: "Fase 5",
        c2: "Conclusão emissão de documentos fiscais testes",
        c3: "1 dia",
      },
    ],
  },
  {
    sectionTitle: "Paralegal — processo de baixa",
    col1: "Grupo",
    col2: "Empresas",
    col3: "Entrega",
    rows: [
      {
        c1: "Fase 1",
        c2: "Reunião de alinhamento, levantamento de pendências e envios pertinentes",
        c3: "3 dias",
      },
      {
        c1: "Fase 2",
        c2: "Confecção do distrato, DBE Receita Federal, Junta Comercial ou Portal Empreendedor",
        c3: "7 dias",
      },
      {
        c1: "Fase 3",
        c2:
          "Conferência de baixas estadual e municipal que são feitos interligado com a Junta e providenciar baixa de demais órgãos competentes",
        c3: "3 dias",
      },
    ],
  },
];
