/** Singleton — Gestão standalone e Eye Vision embed (mesma instância via alias Vite). */
import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
