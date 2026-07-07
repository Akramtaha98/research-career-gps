import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Search from './pages/Search';
import Dashboard from './pages/Dashboard';
import Predictor from './pages/Predictor';
import Actions from './pages/Actions';
import { ResearcherProvider } from './context/ResearcherContext';

export default function App() {
  return (
    <ResearcherProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/search" element={<Search />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/predictor" element={<Predictor />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-slate-400 py-6">
          Research Career GPS — MVP
        </footer>
      </div>
    </ResearcherProvider>
  );
}
