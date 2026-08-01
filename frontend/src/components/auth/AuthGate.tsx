import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { isApiMode } from '../../api/config';
import { fetchMe, logout, readStoredSession } from '../../api/authApi';
import { fetchBoardSnapshot } from '../../api/boardLoader';
import { AuthUserSession } from '../../api/session';
import { useBoardStore } from '../../store/useBoardStore';
import { LoginScreen } from './LoginScreen';

interface AuthGateProps {
  children: ReactNode;
}

/**
 * When `VITE_API_URL` is set: require JWT session, hydrate the board from REST.
 * When unset: render children immediately (offline demo seed).
 */
export function AuthGate({ children }: AuthGateProps) {
  const hydrateBoard = useBoardStore((s) => s.hydrateBoard);
  const setBoardLoading = useBoardStore((s) => s.setBoardLoading);
  const setBoardLoadError = useBoardStore((s) => s.setBoardLoadError);
  const boardLoadError = useBoardStore((s) => s.boardLoadError);
  const boardLoading = useBoardStore((s) => s.boardLoading);

  const [session, setSession] = useState<AuthUserSession | null>(() =>
    isApiMode() ? readStoredSession() : null,
  );
  const [bootstrapping, setBootstrapping] = useState(isApiMode());

  const loadBoard = useCallback(async (): Promise<void> => {
    setBoardLoading(true);
    setBoardLoadError(null);
    try {
      const snapshot = await fetchBoardSnapshot();
      hydrateBoard(snapshot);
    } catch (err) {
      setBoardLoadError(
        err instanceof Error ? err.message : 'Failed to load board',
      );
      setBoardLoading(false);
    }
  }, [hydrateBoard, setBoardLoadError, setBoardLoading]);

  useEffect(() => {
    if (!isApiMode()) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (!cancelled) setBootstrapping(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setSession(me);
        await loadBoard();
      } catch {
        logout();
        if (!cancelled) {
          setSession(null);
          setBoardLoadError(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBoard, setBoardLoadError]);

  const onAuthenticated = (): void => {
    const next = readStoredSession();
    setSession(next);
    void loadBoard();
  };

  if (!isApiMode()) {
    return <>{children}</>;
  }

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-veralogix-grey text-sm text-veralogix-charcoal">
        Connecting…
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onAuthenticated={onAuthenticated} />;
  }

  if (boardLoading && boardLoadError === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-veralogix-grey text-sm text-veralogix-charcoal">
        Loading board…
      </div>
    );
  }

  if (boardLoadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-veralogix-grey px-4 text-center">
        <p className="text-sm text-red-700" role="alert">
          {boardLoadError}
        </p>
        <button
          type="button"
          className="rounded bg-veralogix-lime px-3 py-1.5 text-sm font-semibold text-veralogix-charcoal"
          onClick={() => void loadBoard()}
        >
          Retry
        </button>
        <button
          type="button"
          className="text-xs text-veralogix-charcoal/60 underline"
          onClick={() => {
            logout();
            setSession(null);
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
