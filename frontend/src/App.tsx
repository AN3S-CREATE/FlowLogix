import { AppHeader } from './components/board/AppHeader';
import { Board } from './components/board/Board';

/**
 * LogixFlow shell — the charcoal corporate header over the cool-grey board
 * canvas, per the Veralogix brand standards.
 */
function App() {
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
