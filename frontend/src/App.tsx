import { AppHeader } from './components/board/AppHeader';
import { Board } from './components/board/Board';
import { useBoardSocket } from './realtime/useBoardSocket';

/**
 * LogixFlow shell — the charcoal corporate header over the cool-grey board
 * canvas, per the Veralogix brand standards.
 */
function App() {
  // Bind the realtime socket to the store for the app's lifetime (no-op unless
  // a backend is configured via VITE_WS_URL / VITE_ORG_ID).
  useBoardSocket();

  return (
    <div className="flex h-screen flex-col bg-veralogix-grey">
      <AppHeader />
      <main className="flex-1 overflow-hidden pt-6">
        <Board />
      </main>
    </div>
  );
}

export default App;
