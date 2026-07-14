import { ConnectionType, NetworkMonitor } from './ports';

/**
 * Minimal shape of `@react-native-community/netinfo` that we depend on. Taking
 * it as an injected dependency (rather than importing the package directly)
 * keeps this module buildable and unit-testable off-device, and avoids pinning
 * the native module here.
 */
export interface NetInfoState {
  isConnected: boolean | null;
  type: string; // 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown' | ...
}

export interface NetInfoLike {
  fetch(): Promise<NetInfoState>;
  addEventListener(listener: (state: NetInfoState) => void): () => void;
}

function normalise(type: string): ConnectionType {
  switch (type) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}

/** NetworkMonitor backed by NetInfo. Call `hydrate()` once after construction. */
export class NetInfoNetworkMonitor implements NetworkMonitor {
  private online = false;
  private type: ConnectionType = 'unknown';
  private readonly listeners = new Set<
    (online: boolean, type: ConnectionType) => void
  >();

  constructor(private readonly netInfo: NetInfoLike) {
    this.netInfo.addEventListener((state) => this.update(state));
  }

  /** Pull the current state once so callers don't wait for the first event. */
  async hydrate(): Promise<void> {
    this.update(await this.netInfo.fetch());
  }

  isOnline(): boolean {
    return this.online;
  }

  connectionType(): ConnectionType {
    return this.type;
  }

  subscribe(
    listener: (online: boolean, type: ConnectionType) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(state: NetInfoState): void {
    this.online = state.isConnected === true;
    this.type = normalise(state.type);
    for (const l of this.listeners) l(this.online, this.type);
  }
}

/**
 * In-memory monitor for tests and headless jobs. `set(...)` drives connectivity
 * transitions and notifies subscribers, exactly like the real one.
 */
export class ManualNetworkMonitor implements NetworkMonitor {
  private readonly listeners = new Set<
    (online: boolean, type: ConnectionType) => void
  >();

  constructor(
    private online = false,
    private type: ConnectionType = 'none',
  ) {}

  isOnline(): boolean {
    return this.online;
  }

  connectionType(): ConnectionType {
    return this.type;
  }

  subscribe(
    listener: (online: boolean, type: ConnectionType) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(online: boolean, type: ConnectionType): void {
    this.online = online;
    this.type = type;
    for (const l of this.listeners) l(online, type);
  }
}

/**
 * Upload-gating policy: which connection types are "good enough" for pushing
 * large attachments. Wi-Fi and cellular (LTE/5G) qualify; we never burn a
 * metered fallback or an offline state on big transfers.
 */
export function isSuitableForLargeUpload(monitor: NetworkMonitor): boolean {
  if (!monitor.isOnline()) return false;
  const type = monitor.connectionType();
  return type === 'wifi' || type === 'ethernet' || type === 'cellular';
}
