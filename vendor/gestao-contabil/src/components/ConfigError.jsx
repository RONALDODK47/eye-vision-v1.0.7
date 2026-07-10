import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ConfigError({ message, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="max-w-md w-full p-8 space-y-6 text-center shadow-lg border-red-200">
        <div className="flex justify-center">
          <div className="p-3 bg-red-100 rounded-full">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Erro de Configuração</h1>
          <p className="text-slate-600">
            Ocorreu um erro ao carregar as configurações do aplicativo.
          </p>
          {message && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-100 font-mono">
              {message}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Verifique a configuração do Firebase (firebase-applet-config.json) e se o domínio está autorizado no console do Firebase.
          </p>
          
          <Button 
            onClick={onRetry || (() => window.location.reload())}
            className="w-full flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Tentar Novamente
          </Button>
        </div>
      </Card>
    </div>
  );
}
