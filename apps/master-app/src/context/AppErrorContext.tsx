import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { ErrorBanner } from '../components/ui/ErrorBanner.js';

export type AppErrorRegion = 'main' | 'sidebar';

type AppErrorState = {
  message: string;
  region: AppErrorRegion;
};

type AppErrorContextValue = {
  error: AppErrorState | null;
  reportError: (message: string, options?: { region?: AppErrorRegion }) => void;
  clearError: () => void;
};

const AppErrorContext = createContext<AppErrorContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
};

export function AppErrorProvider({ children }: ProviderProps): ReactElement {
  const [error, setError] = useState<AppErrorState | null>(null);

  const reportError = useCallback((message: string, options?: { region?: AppErrorRegion }) => {
    setError({ message, region: options?.region ?? 'main' });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ error, reportError, clearError }),
    [error, reportError, clearError],
  );

  return <AppErrorContext.Provider value={value}>{children}</AppErrorContext.Provider>;
}

export function useAppError(): AppErrorContextValue {
  const ctx = useContext(AppErrorContext);
  if (ctx === null) {
    throw new Error('useAppError must be used within AppErrorProvider');
  }
  return ctx;
}

type ErrorOutletProps = {
  region?: AppErrorRegion;
  compact?: boolean;
  className?: string;
};

export function ErrorOutlet({
  region = 'main',
  compact = false,
  className,
}: ErrorOutletProps): ReactElement | null {
  const ctx = useContext(AppErrorContext);
  if (ctx === null || ctx.error === null || ctx.error.region !== region) {
    return null;
  }

  const classNames = ['error-outlet', className].filter(Boolean).join(' ');

  return (
    <div className={classNames || undefined}>
      <ErrorBanner message={ctx.error.message} onDismiss={ctx.clearError} compact={compact} />
    </div>
  );
}

export function FormActionErrorOutlet(): ReactElement | null {
  return <ErrorOutlet region="main" className="error-outlet--form-actions" />;
}
