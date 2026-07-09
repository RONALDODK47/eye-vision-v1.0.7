import { lazy, Suspense } from 'react';
import GestaoAuthShell from './gestaoContabil/GestaoAuthShell';

const ContabilFacilApp = lazy(() => import('./contabilfacil/ContabilFacilApp'));

export default function App() {
  return (
    <GestaoAuthShell>
      <Suspense fallback={null}>
        <ContabilFacilApp />
      </Suspense>
    </GestaoAuthShell>
  );
}
