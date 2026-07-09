import { type ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
// @ts-expect-error módulo JSX da gestão contábil
import { AuthProvider, useAuth } from './gestaoAuth';
import { useCloudAccess } from './useCloudAccessFallback';
import { queryClientInstance } from './gestaoQueryClient';
import EyeVisionStaffLogin from './EyeVisionStaffLogin';
import EyeVisionTokenGate from './EyeVisionTokenGate';
import EyeVisionCloudBootstrap from '../contabilfacil/components/EyeVisionCloudBootstrap';
import TabLoadingFallback from '../contabilfacil/components/TabLoadingFallback';
import { notifyDebugAppHealthy } from '../contabilfacil/agent/browserConsoleBridge';

function GestaoAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="h-screen bg-brand-bg">
        <TabLoadingFallback />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <EyeVisionStaffLogin />;
  }

  return <GestaoCloudAccessGate>{children}</GestaoCloudAccessGate>;
}

/** Só monta após login — `useCloudAccess` exige QueryClient + utilizador Firebase. */
function GestaoCloudAccessGate({ children }: { children: ReactNode }) {
  const { isLoading: isLoadingCloudAccess, companyTokenOk } = useCloudAccess();

  const appHealthy = !isLoadingCloudAccess && companyTokenOk;

  useEffect(() => {
    if (!appHealthy) return;
    notifyDebugAppHealthy();
  }, [appHealthy]);

  if (isLoadingCloudAccess) {
    return (
      <div className="h-screen bg-brand-bg">
        <TabLoadingFallback />
      </div>
    );
  }

  if (!companyTokenOk) {
    return <EyeVisionTokenGate />;
  }

  return (
    <>
      <EyeVisionCloudBootstrap />
      {children}
    </>
  );
}

export default function GestaoAuthShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <GestaoAuthGate>{children}</GestaoAuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
