import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient } from '../lib/query-client.js';
import { AuthProvider } from '../features/auth/auth-provider.js';
import { UploadQueueProvider } from '../features/uploads/use-upload-queue.js';

export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadQueueProvider>{children}</UploadQueueProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
