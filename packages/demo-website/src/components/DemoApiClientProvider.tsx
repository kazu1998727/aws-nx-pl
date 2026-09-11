import { AppRouter } from '@aws-nx-pl/demo-api';
import { useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createContext, FC, PropsWithChildren, useMemo } from 'react';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import {
  TRPCClient,
  createTRPCClient,
  httpLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { useSigV4 } from '../hooks/useSigV4';

export interface DemoApiTRPCContextValue {
  optionsProxy: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>;
  client: TRPCClient<AppRouter>;
}

export const DemoApiTRPCContext = createContext<DemoApiTRPCContextValue | null>(
  null,
);

export const DemoApiClientProvider: FC<PropsWithChildren> = ({ children }) => {
  const queryClient = useQueryClient();
  const runtimeConfig = useRuntimeConfig();
  const apiUrl = runtimeConfig.apis.DemoApi;
  const sigv4Client = useSigV4();

  const container = useMemo<DemoApiTRPCContextValue>(() => {
    const client = createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: apiUrl,
            EventSource: EventSourcePolyfill,
            eventSourceOptions: async ({ op }) => {
              const url =
                `${apiUrl.replace(/\/$/, '')}/${op.path}` +
                (op.input !== undefined
                  ? `?input=${encodeURIComponent(JSON.stringify(op.input))}`
                  : '');
              const signed = await sigv4Client.sign(url, { method: 'GET' });
              const headers: Record<string, string> = {};
              signed.headers.forEach((v, k) => {
                headers[k] = v;
              });
              return { headers };
            },
          }),
          false: httpLink({
            url: apiUrl,
            fetch: sigv4Client.fetch,
          }),
        }),
      ],
    });

    const optionsProxy = createTRPCOptionsProxy<AppRouter>({
      client,
      queryClient,
    });

    return { optionsProxy, client };
  }, [apiUrl, queryClient, sigv4Client]);

  return (
    <DemoApiTRPCContext.Provider value={container}>
      {children}
    </DemoApiTRPCContext.Provider>
  );
};

export default DemoApiClientProvider;
