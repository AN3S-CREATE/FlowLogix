import { Board } from './components/Board';

function App() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">LogixFlow</h1>
        <p className="text-sm text-slate-500">Collaborative Kanban board</p>
      </header>
      <main className="p-6">
        <Board />
      </main>
    </div>
  );
}

export default App;
