/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BankConfig } from "../types";
import { Download, Landmark, CreditCard, Settings, Coins } from "lucide-react";

interface OFXConfigFormProps {
  config: BankConfig;
  onChangeConfig: (newConfig: BankConfig) => void;
  onExport: () => void;
  isEnabled: boolean;
}

const BANK_PRESETS = [
  { id: "341", name: "Itaú Unibanco" },
  { id: "237", name: "Banco Bradesco" },
  { id: "001", name: "Banco do Brasil" },
  { id: "104", name: "Caixa Econômica" },
  { id: "260", name: "Nubank (Nu Pagamentos)" },
  { id: "033", name: "Banco Santander" },
  { id: "077", name: "Banco Inter" },
  { id: "041", name: "Banrisul" },
  { id: "336", name: "C6 Bank" },
  { id: "999", name: "Outro / Banco Personalizado" }
];

export default function OFXConfigForm({
  config,
  onChangeConfig,
  onExport,
  isEnabled
}: OFXConfigFormProps) {
  
  const handleBankSelect = (bankId: string) => {
    const selected = BANK_PRESETS.find(b => b.id === bankId);
    if (selected) {
      onChangeConfig({
        ...config,
        bankId: selected.id,
        bankName: selected.name
      });
    }
  };

  const handleFieldChange = (field: keyof BankConfig, value: string) => {
    onChangeConfig({
      ...config,
      [field]: value
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-none p-6 shadow-md space-y-6">
      <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
        <Settings className="w-5 h-5 text-emerald-400" />
        <h3 className="font-black text-white text-base uppercase tracking-wider">Configurações do Arquivo OFX</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Bank Selection Preset */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
            Instituição Financeira (Banco)
          </label>
          <div className="relative">
            <Landmark className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
            <select
              value={config.bankId}
              onChange={(e) => handleBankSelect(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-zinc-800 bg-zinc-950 text-white rounded-none text-sm outline-none focus:border-white focus:ring-0 font-bold uppercase tracking-wider"
            >
              <option value="" disabled>Selecione um banco...</option>
              {BANK_PRESETS.map(bank => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({bank.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Bank Name if selected "Outro" */}
        {config.bankId === "999" && (
          <div className="space-y-2 animate-fade-in">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
              Nome do Banco Personalizado
            </label>
            <input
              type="text"
              value={config.bankName}
              onChange={(e) => handleFieldChange("bankName", e.target.value)}
              placeholder="Digite o nome do seu banco"
              className="w-full px-3 py-2.5 border border-zinc-800 bg-zinc-950 text-white rounded-none text-sm outline-none focus:border-white focus:ring-0 font-bold uppercase tracking-wider"
            />
          </div>
        )}

        {/* Account Identifier */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
            Identificador da Conta (Agência/Conta)
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={config.accountId}
              onChange={(e) => handleFieldChange("accountId", e.target.value)}
              placeholder="Ex: 0001 / 123456-7"
              className="w-full pl-9 pr-3 py-2.5 border border-zinc-800 bg-zinc-950 text-white rounded-none text-sm outline-none focus:border-white focus:ring-0 font-bold uppercase tracking-wider"
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">Identificador único usado pelo seu ERP ou gerenciador financeiro.</span>
        </div>

        {/* Account Type */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
            Tipo de Conta
          </label>
          <select
            value={config.accountType}
            onChange={(e) => handleFieldChange("accountType", e.target.value)}
            className="w-full px-3 py-2.5 border border-zinc-800 bg-zinc-950 text-white rounded-none text-sm outline-none focus:border-white focus:ring-0 font-bold uppercase tracking-wider"
          >
            <option value="CHECKING">Conta Corrente (CHECKING)</option>
            <option value="SAVINGS">Conta Poupança (SAVINGS)</option>
            <option value="CREDITCARD">Cartão de Crédito (CREDITCARD)</option>
          </select>
        </div>

        {/* Currency selection */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
            Moeda Base
          </label>
          <div className="relative">
            <Coins className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
            <select
              value={config.currency}
              onChange={(e) => handleFieldChange("currency", e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-zinc-800 bg-zinc-950 text-white rounded-none text-sm outline-none focus:border-white focus:ring-0 font-bold uppercase tracking-wider"
            >
              <option value="BRL">Real Brasileiro (BRL)</option>
              <option value="USD">Dólar Americano (USD)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="GBP">Libra Esterlina (GBP)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Compile & Export Button */}
      <div className="pt-6 border-t border-zinc-800 flex justify-end">
        <button
          onClick={onExport}
          disabled={!isEnabled}
          className={`px-12 py-5 text-sm font-black uppercase tracking-[0.3em] flex items-center gap-4 transition-all rounded-none ${
            isEnabled 
              ? "bg-white text-black hover:bg-emerald-400 cursor-pointer" 
              : "bg-zinc-800 text-zinc-600 border border-zinc-850 cursor-not-allowed"
          }`}
        >
          <Download className="w-5 h-5" />
          <span>Exportar para OFX (.ofx)</span>
        </button>
      </div>
    </div>
  );
}
