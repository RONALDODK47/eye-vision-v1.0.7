import { lazy, Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import TabLoadingFallback from './TabLoadingFallback';
import ThemeProvider from '../../gestaoContabil/GestaoThemeProviderFallback';
import { useCloudAccess } from '../../gestaoContabil/useCloudAccessFallback';
import GestaoPagePlaceholder from '../../gestaoContabil/GestaoPagePlaceholder';

const GestaoAdministrator = lazy(async () => ({
  default: () => <GestaoPagePlaceholder title="Administrador" />,
}));

export default function AdminModule() {
  const { isAdminEmail, isLoading } = useCloudAccess();

  if (isLoading) return <TabLoadingFallback />;

  if (!isAdminEmail) {
    return (
      <div className="technical-panel p-6 max-w-lg">
        <h2 className="text-lg font-black uppercase">Acesso restrito</h2>
        <p className="mt-2 text-xs opacity-70 leading-relaxed">
          Apenas o administrador cloud pode aceder a este módulo. Utilize a conta de administrador
          configurada na Gestão Contábil.
        </p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <MemoryRouter
        initialEntries={['/administrator']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Suspense fallback={<TabLoadingFallback />}>
          <GestaoAdministrator />
        </Suspense>
      </MemoryRouter>
    </ThemeProvider>
  );
}
