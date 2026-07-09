import { Suspense, useCallback, useEffect, useMemo } from 'react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './gestaoModuleScope.css';
import { useGestaoEmbedScope } from './useGestaoEmbedScope';
import { GESTAO_PAGES, type GestaoPageId } from './gestaoPages';
import GestaoSidebarHeader from './GestaoSidebarHeader';
import TabLoadingFallback from '../contabilfacil/components/TabLoadingFallback';
import ThemeProvider from './GestaoThemeProviderFallback';
import UsernameMandatoryGate from './GestaoUsernameMandatoryGateFallback';
import { useCloudAccess } from './useCloudAccessFallback';

function routeFromPathname(pathname: string): string {
  return pathname.replace(/^\//, '').split('/')[0] ?? '';
}

function GestaoEmbedRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabAccess } = useCloudAccess();

  const visiblePages = useMemo(
    () =>
      GESTAO_PAGES.filter((page) => {
        if (page.id in tabAccess && !tabAccess[page.id]) return false;
        return true;
      }),
    [tabAccess],
  );

  const defaultPageId = (visiblePages[0]?.id ?? 'Dashboard') as GestaoPageId;

  const activePageId = useMemo(() => {
    const route = routeFromPathname(location.pathname);
    if (visiblePages.some((page) => page.route === route)) {
      return route as GestaoPageId;
    }
    return defaultPageId;
  }, [location.pathname, visiblePages, defaultPageId]);

  const handleSelect = useCallback(
    (pageId: GestaoPageId) => {
      navigate(`/${pageId}`);
    },
    [navigate],
  );

  useEffect(() => {
    const route = routeFromPathname(location.pathname);
    const known = visiblePages.some((page) => page.route === route);
    if (!known) {
      navigate(`/${defaultPageId}`, { replace: true });
    }
  }, [location.pathname, visiblePages, defaultPageId, navigate]);

  return (
    <div className="gestao-embed-root gestao-embed-force-light h-full min-h-0">
      <GestaoSidebarHeader pages={visiblePages} activeId={activePageId} onSelect={handleSelect} />
      <div className="gestao-embed-main gestao-embed-force-light min-h-0 flex-1">
        <UsernameMandatoryGate>
          <div className="mx-auto h-full min-h-0 min-w-0 max-w-7xl overflow-y-auto p-4 md:p-8">
            <Suspense fallback={<TabLoadingFallback />}>
              <Routes>
                {visiblePages.map((page) => (
                  <Route key={page.id} path={`/${page.route}`} element={<page.Component />} />
                ))}
                <Route path="*" element={<Navigate to={`/${defaultPageId}`} replace />} />
              </Routes>
            </Suspense>
          </div>
        </UsernameMandatoryGate>
      </div>
    </div>
  );
}

/**
 * Gestão Empresarial — sidebar lateral (Eye Vision) + páginas @gestao.
 */
export default function GestaoContabilModule() {
  useGestaoEmbedScope();

  return (
    <div className="h-full min-h-0">
      <ThemeProvider>
        <MemoryRouter
          initialEntries={['/Dashboard']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <GestaoEmbedRoutes />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  );
}
