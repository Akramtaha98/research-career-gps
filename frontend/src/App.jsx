import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OrcidCallback from './pages/OrcidCallback';
import Search from './pages/Search';
import Dashboard from './pages/Dashboard';
import Predictor from './pages/Predictor';
import Actions from './pages/Actions';
import ImportData from './pages/ImportData';
import Verify from './pages/Verify';
import { ResearcherProvider } from './context/ResearcherContext';

export default function App() {
  const { t } = useTranslation();
  return (
    <ResearcherProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/orcid/callback" element={<OrcidCallback />} />
            <Route path="/search" element={<Search />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/predictor" element={<Predictor />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/import" element={<ImportData />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-slate-400 py-6">
          {t('footer.tagline')}
        </footer>
      </div>
    </ResearcherProvider>
  );
}
