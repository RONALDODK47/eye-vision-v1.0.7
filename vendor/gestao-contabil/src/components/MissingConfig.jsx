import React from 'react';
import { AlertCircle, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function MissingConfig() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="max-w-md w-full p-8 space-y-6 text-center shadow-lg border-orange-200">
        <div className="flex justify-center">
          <div className="p-3 bg-orange-100 rounded-full">
            <AlertCircle className="w-8 h-8 text-orange-600" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Configuração Pendente</h1>
          <p className="text-slate-600">
            A configuração do Firebase não foi encontrada. Verifique o arquivo de configuração do projeto.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-left">
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Como configurar:
          </p>
          <ol className="text-xs text-slate-600 space-y-2 list-decimal ml-4">
            <li>Verifique se o arquivo <code>firebase-applet-config.json</code> existe na raiz do projeto.</li>
            <li>Confirme que o projeto Firebase está ativo no console do Firebase.</li>
            <li>Reinicie o servidor de desenvolvimento.</li>
          </ol>
        </div>

        <p className="text-xs text-slate-400">
          O sistema utiliza apenas Firebase (Auth e Firestore) para funcionar.
        </p>
      </Card>
    </div>
  );
}
