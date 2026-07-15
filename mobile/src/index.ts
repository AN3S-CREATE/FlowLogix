/**
 * LogixFlow mobile offline-first sync module.
 *
 *   crdt/        — LWW-CRDT primitives (register, element-set, field-level merge)
 *   sync/        — offline-first SyncService + network monitor + ports
 *   attachments/ — background upload queue gated on Wi-Fi/LTE
 *   model/       — WatermelonDB schema, models, and port adapters
 */
export * from './crdt';
export * from './sync/ports';
export * from './sync/SyncService';
export * from './sync/networkMonitor';
export * from './attachments/ports';
export * from './attachments/AttachmentUploadQueue';
export * from './model';
