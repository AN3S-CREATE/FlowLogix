import { AppHeader } from './components/board/AppHeader';
import { Board } from './components/board/Board';
import { AuthGate } from './components/auth/AuthGate';
import { useBoardSocket } from './realtime/useBoardSocket';

/**
 * LogixFlow shell — the charcoal corporate header over the cool-grey board
 * canvas, per the Veralogix brand standards.
 */
function BoardShell() {
  // Bind the realtime socket to the store for the app's lifetime (no-op unless
  // a backend WS URL is configured and we know the tenant org).
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

function App() {
  return (
    <AuthGate>
      <BoardShell />
    </AuthGate>
  );
}

export default App;
