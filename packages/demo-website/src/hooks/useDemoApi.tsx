import { useContext } from 'react';
import {
  DemoApiTRPCContext,
  type DemoApiTRPCContextValue,
} from '../components/DemoApiClientProvider';

export const useDemoApi = (): DemoApiTRPCContextValue['optionsProxy'] => {
  const container = useContext(DemoApiTRPCContext);
  if (!container) {
    throw new Error('useDemoApi must be used within DemoApiClientProvider');
  }
  return container.optionsProxy;
};

export const useDemoApiClient = (): DemoApiTRPCContextValue['client'] => {
  const container = useContext(DemoApiTRPCContext);
  if (!container) {
    throw new Error(
      'useDemoApiClient must be used within DemoApiClientProvider',
    );
  }
  return container.client;
};
