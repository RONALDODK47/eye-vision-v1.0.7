# 📋 Atualização: Regime Tributário para Créditos Fiscais

## ✨ O que mudou?

A seção de **Notas Fiscais e Créditos** agora mostra:

### 1. **Seletor de Regime (Acima da Tabela)**
Escolha o regime tributário da sua empresa:
- **Lucro Real** - Créditos amplos
- **Lucro Presumido** - Créditos limitados
- **Simples Nacional** - Créditos muito limitados

### 2. **Indicadores de Regime para Cada Crédito**
Cada crédito sugerido agora mostra:

#### 🟢 **✓ Recuperável**
O imposto pode ser recuperado neste regime

#### 🔴 **✗ Não Recuperável**
O imposto NÃO pode ser recuperado neste regime

#### 🔵 **Alíquota Zero**
Operação com alíquota zero (ex: exportação)

#### 🟡 **Monofásico**
Tributação acontece uma única vez na cadeia

#### 🟡 **🔄 ICMS ST**
ICMS com Substituição Tributária

### 3. **Observações Específicas do Regime**
Cada crédito tem uma observação sobre as regras aplicadas:
- "PIS não cumulativo - crédito amplo sobre insumos, energia, frete"
- "ICMS integral conforme documento fiscal e operação"
- "PIS geralmente não é recuperável em Simples Nacional"
- etc.

### 4. **Notas Fiscais Melhoradas**
Agora mostra:
- ✓ NF número/série
- ✓ Fornecedor/Emitente
- ✓ Data de emissão
- ✓ Valor total

### 5. **Créditos por Regime**
A lista de créditos é agrupada por regime selecionado:
- **Lucro Real**: 8 créditos
- **Lucro Presumido**: 5 créditos  
- **Simples Nacional**: 3 créditos (como exemplo)

---

## 🎯 Como Usar

1. **Na aba "Notas Fiscais"** do módulo de Precificação
2. **Escolha seu regime tributário** no seletor no topo
3. **Observe automaticamente os indicadores** de cada crédito
4. **Leia as observações** para entender as regras aplicadas
5. **Verifique quais créditos são recuperáveis** no seu regime

---

## 📊 Exemplo de Exibição

```
┌─ Regime Tributário: [Lucro Real ▼] ──────────────┐
│ Determina recuperação, alíquotas zero, etc...    │
└────────────────────────────────────────────────────┘

Créditos Sugeridos - Regime: Lucro Real

▌ ICMS a recuperar
  Fundamento: NF-e item — crédito ICMS
  🟢 ✓ Recuperável  |  🟡 🔄 ICMS ST
  Regime: ICMS integral conforme documento fiscal e operação
  R$ 1.250,50

▌ PIS a recuperar
  Fundamento: NF-e total — PIS
  🟢 ✓ Recuperável
  Regime: PIS não cumulativo - crédito amplo sobre insumos, energia, frete
  R$ 425,75

▌ COFINS a recuperar
  Fundamento: NF-e total — COFINS
  🟢 ✓ Recuperável
  Regime: COFINS não cumulativa - crédito amplo sobre insumos, energia, frete
  R$ 312,40
```

---

## 🔧 Implementação Técnica

### Arquivos Modificados:
1. **`pricingTypes.ts`** - Estendidos tipos de dados
2. **`PricingNotasFiscaisPanel.tsx`** - Componente visual

### Novos Arquivos:
3. **`tributaryRegimeRules.ts`** - Regras tributárias por regime

### Tipos Adicionados:
- `TributaryRegimeDetails` - Detalhes das regras
- Campo `selectedRegime` em `PricingNfeCache`

---

## 📝 Notas Importantes

### Baseado em Legislação Brasileira:
✓ **Lucro Real**: Lei 10.637/2002 (PIS), Lei 10.833/2003 (COFINS), Lei Kandir (ICMS)
✓ **Lucro Presumido**: Não cumulatividade limitada, créditos restritos
✓ **Simples Nacional**: Regime integrado, créditos muitolimitados

### Observações por Regime:
- **Simples Nacional**: PIS/COFINS geralmente SÃO ACUMULATIVAS (sem crédito)
- **Lucro Presumido**: Créditos limitados a operações específicas
- **Lucro Real**: Amplos créditos conforme legislação

---

## 🚀 Próximas Melhorias (Planejadas)

- [ ] Integração em tempo real com API SEFAZ
- [ ] Validação automática de monofásicos no XML
- [ ] Cálculo de ST (Substituição Tributária)
- [ ] Alertas para créditos não recuperáveis
- [ ] Exportação com regime e indicadores no PDF
- [ ] Histórico de regimes por período

---

**Última atualização**: 12/07/2026
