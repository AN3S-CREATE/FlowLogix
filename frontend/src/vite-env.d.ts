/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Nest API origin, e.g. `http://localhost:3000`. Unset = offline demo. */
  readonly VITE_API_URL?: string;
  /** Backend Socket.io origin, e.g. `http://localhost:3000`. Defaults to API URL. */
  readonly VITE_WS_URL?: string;
  /** Active tenant id for realtime handshake when no JWT session is present. */
  readonly VITE_ORG_ID?: string;
  /** Optional board id to open; otherwise the first org board is used. */
  readonly VITE_BOARD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
