import { useBoardStore } from '../../store/useBoardStore';

/**
 * Live-connection indicator for the corporate header. A lime dot means frames
 * are flowing (connected/synced); amber is connecting; charcoal is offline.
 * The `idle` state (no realtime backend configured — the offline demo) renders
 * nothing so the header stays clean.
 */
export function ConnectionStatus() {
  const status = useBoardStore((s) => s.connectionStatus);
  if (status === 'idle') return null;

  const config: Record<
    Exclude<typeof status, 'idle'>,
    { label: string; dot: string; pulse: boolean }
  > = {
    connecting: { label: 'Connecting…', dot: 'bg-amber-400', pulse: true },
    connected: { label: 'Live', dot: 'bg-veralogix-lime', pulse: true },
    synced: { label: 'Live', dot: 'bg-veralogix-lime', pulse: false },
    disconnected: { label: 'Offline', dot: 'bg-white/50', pulse: false },
  };
  const { label, dot, pulse } = config[status];

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 sm:inline-flex"
      role="status"
      aria-live="polite"
    >
      <span
        className={
          'h-2 w-2 flex-none rounded-full ' + dot + (pulse ? ' animate-pulse' : '')
        }
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
