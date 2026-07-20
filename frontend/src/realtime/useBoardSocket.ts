import { useEffect } from 'react';
import { BoardSocketManager } from './boardSocketManager';
import { useBoardStore } from '../store/useBoardStore';

/**
 * Binds the framework-agnostic {@link BoardSocketManager} to the Zustand store
 * for the lifetime of the board view: live `board:mutation` frames flow into
 * `applyRemoteMutation`, connection state into the header pill, and an
 * unrecoverable delta-sync gap flips `needsResync`.
 *
 * The socket only activates when both `VITE_WS_URL` and `VITE_ORG_ID` are set;
 * otherwise the board runs as a self-contained offline demo (status `idle`) and
 * no connection is attempted. Identity/tenant still come from the backend JWT —
 * `VITE_ORG_ID` is only the dev handshake hint for local runs.
 */
export function useBoardSocket(): void {
  const boardId = useBoardStore((s) => s.board.id);

  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL;
    const orgId = import.meta.env.VITE_ORG_ID;
    const {
      applyRemoteMutation,
      setConnectionStatus,
      markNeedsResync,
    } = useBoardStore.getState();

    if (!url || !orgId) {
      setConnectionStatus('idle');
      return;
    }

    const manager = new BoardSocketManager({
      url,
      boardId,
      orgId,
      onNeedsResync: markNeedsResync,
    });
    const offMutation = manager.onMutation((envelope) =>
      applyRemoteMutation(envelope),
    );
    const offStatus = manager.onStatus((status) =>
      setConnectionStatus(status),
    );
    manager.connect();

    return () => {
      offMutation();
      offStatus();
      manager.disconnect();
      setConnectionStatus('idle');
    };
  }, [boardId]);
}
