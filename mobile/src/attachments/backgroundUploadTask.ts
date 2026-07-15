import { NetworkMonitor } from '../sync/ports';
import { isSuitableForLargeUpload } from '../sync/networkMonitor';

/**
 * Expo/React Native background task that drains the attachment upload queue.
 *
 * The OS wakes the app on its own schedule (Expo BackgroundTask / iOS BGTask /
 * Android WorkManager). On each wake we upload the staged files **only if the
 * device is on a connection worth spending bytes on** (Wi-Fi / cellular, see
 * `isSuitableForLargeUpload`); otherwise we no-op and let the scheduler try
 * again later. The heavy lifting (sequential drain, backoff, terminal-failed
 * handling) lives in `AttachmentUploadQueue` — this file is just the OS glue.
 *
 * The Expo native modules (`expo-task-manager`, `expo-background-task`) are
 * taken as an injected {@link BackgroundTaskHost} rather than imported here, so
 * the logic is unit-testable off-device and the native dependency is pinned by
 * the app, not the library. See `expoBackgroundTaskHost` at the bottom for the
 * one-liner adapter to wire in the real modules.
 */

/** What a background execution reports back to the OS scheduler. */
export type BackgroundTaskResult = 'new-data' | 'no-data' | 'failed';

/** The slice of a queue this task needs: drain whatever is runnable, once. */
export interface DrainableQueue {
  process(): Promise<void>;
}

export interface BackgroundRegisterOptions {
  /** Minimum spacing between wakes; the OS may space them out further. */
  minimumIntervalSeconds: number;
  stopOnTerminate: boolean;
  startOnBoot: boolean;
}

/**
 * The Expo surface we depend on, abstracted. `expo-task-manager` provides
 * `defineTask`; `expo-background-task` provides register/unregister.
 */
export interface BackgroundTaskHost {
  defineTask(
    taskName: string,
    executor: () => Promise<BackgroundTaskResult>,
  ): void;
  registerTaskAsync(
    taskName: string,
    options: BackgroundRegisterOptions,
  ): Promise<void>;
  unregisterTaskAsync(taskName: string): Promise<void>;
  isTaskRegisteredAsync(taskName: string): Promise<boolean>;
}

export interface BackgroundUploadConfig {
  queue: DrainableQueue;
  network: NetworkMonitor;
  host: BackgroundTaskHost;
  /** Task identifier registered with the OS. */
  taskName?: string;
  /** Wake spacing hint (default 15 min — the practical iOS floor). */
  minimumIntervalSeconds?: number;
}

export const DEFAULT_UPLOAD_TASK_NAME = 'flowlogix.attachment-upload';

/**
 * One background execution: drain the queue iff the network is suitable.
 * Pure enough to unit-test — no Expo, no timers. Never throws; a failure is
 * reported as `'failed'` so the scheduler can back off rather than crash the
 * app's background runtime.
 */
export async function runBackgroundUploadOnce(
  queue: DrainableQueue,
  network: NetworkMonitor,
): Promise<BackgroundTaskResult> {
  if (!isSuitableForLargeUpload(network)) return 'no-data';
  try {
    await queue.process();
    return 'new-data';
  } catch {
    return 'failed';
  }
}

/**
 * Define + register the background upload task with the OS. Idempotent: if the
 * task is already registered we re-define the executor (so a fresh app launch
 * rebinds the current queue/network instances) without double-registering.
 * Returns the task name for later `unregisterBackgroundUploadTask`.
 */
export async function registerBackgroundUploadTask(
  cfg: BackgroundUploadConfig,
): Promise<string> {
  const taskName = cfg.taskName ?? DEFAULT_UPLOAD_TASK_NAME;

  cfg.host.defineTask(taskName, () =>
    runBackgroundUploadOnce(cfg.queue, cfg.network),
  );

  if (!(await cfg.host.isTaskRegisteredAsync(taskName))) {
    await cfg.host.registerTaskAsync(taskName, {
      minimumIntervalSeconds: cfg.minimumIntervalSeconds ?? 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
  return taskName;
}

/** Tear down the OS registration (e.g. on sign-out). */
export async function unregisterBackgroundUploadTask(
  host: BackgroundTaskHost,
  taskName: string = DEFAULT_UPLOAD_TASK_NAME,
): Promise<void> {
  if (await host.isTaskRegisteredAsync(taskName)) {
    await host.unregisterTaskAsync(taskName);
  }
}
