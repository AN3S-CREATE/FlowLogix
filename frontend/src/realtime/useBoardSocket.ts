import { useEffect } from 'react';
import { BoardSocketManager } from './boardSocketManager';
import { useBoardStore } from '../store/useBoardStore';
import { getWsUrl } from '../api/config';
import { getAuthUser } from '../api/session';

/**
 * Binds the framework-agnostic {@link BoardSocketManager} to the Zustand store
 * for the lifetime of the board view: live `board:mutation` frames flow into
 * `applyRemoteMutation`, connection state into the header pill, and an
 * unrecoverable delta-sync gap flips `needsResync` (which triggers a targeted
 * REST refetch when API mode is on).
 *
 * Activates when a WS URL is available (`VITE_WS_URL` or `VITE_API_URL`) and an
 * org id is known (JWT session, else `VITE_ORG_ID` for local handshake).
 * Otherwise the board runs as a self-contained offline demo (status `idle`).
 */
export function useBoardSocket(): void {
  const boardId = useBoardStore((s) => s.board.id);

  useEffect(() => {
    const url = getWsUrl();
    const sessionOrg = getAuthUser()?.orgId;
    const orgId = sessionOrg ?? import.meta.env.VITE_ORG_ID?.trim();
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
