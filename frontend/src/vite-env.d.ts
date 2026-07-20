/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend Socket.io origin, e.g. `http://localhost:3000`. Unset = offline demo. */
  readonly VITE_WS_URL?: string;
  /** Active tenant id sent in the realtime handshake. Unset = offline demo. */
  readonly VITE_ORG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
