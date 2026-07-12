/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CreditCard, FileCode, Server, ShieldCheck, Sparkles, Landmark } from "lucide-react";
import { Company } from "../types";

interface HeaderProps {
  activeCompany?: Company | null;
  onSwitchCompany?: () => void;
}

export default function Header({ activeCompany, onSwitchCompany }: HeaderProps) {
  return (
    <header className="bg-[#0A0A0A] border-b border-zinc-800 text-white py-10 px-4 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
        {/* Brand Logo and Title */}
        <div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-none select-none">
            ERP<span className="text-zinc-700">.</span>CONTABIL
          </h1>
          <p className="text-zinc-400 font-bold tracking-[0.2em] uppercase text-xs md:text-sm mt-3 ml-1">
            CONVERSOR FINANCEIRO INTELIGENTE MULTIMODAL
          </p>
        </div>

        {/* Integration Badges */}
        <div className="flex flex-col items-start md:items-end gap-3.5 w-full md:w-auto">
          {activeCompany && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 text-left md:text-right flex items-center gap-3.5 max-w-full">
              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Landmark className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] uppercase font-mono text-zinc-500 block leading-none">Empresa Ativa</span>
                <span className="text-xs font-black text-white block uppercase mt-0.5 truncate max-w-[200px]">
                  {activeCompany.name}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 block mt-0.5">
                  CNPJ: {activeCompany.cnpj}
                </span>
              </div>
              <button
                type="button"
                onClick={onSwitchCompany}
                className="ml-2 px-2.5 py-1.5 bg-zinc-900 hover:bg-white text-zinc-400 hover:text-black text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-all shrink-0"
              >
                Trocar
              </button>
            </div>
          )}

          <div className="flex flex-col items-start md:items-end">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-500 font-bold">Motor Ativo</span>
            </div>
            <p className="text-zinc-500 text-xs font-mono mt-1 ml-1 md:text-right">
              ERP-Contabil-v2.4
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
