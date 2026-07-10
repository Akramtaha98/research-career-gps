import { Navigate, Route, Routes, Link } from 'react-router-dom';
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
import Verify from './pages/Verify';
import Contact from './pages/Contact';
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
            <Route path="/verify" element={<Verify />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-slate-400 py-6 space-y-1">
          <p>{t('footer.tagline', { year: new Date().getFullYear() })}</p>
          <p>
            {t('footer.builtWithLove')}
            {' · '}
            <Link to="/contact" className="underline hover:text-slate-500">
              {t('footer.contactLink')}
            </Link>
          </p>
        </footer>
      </div>
    </ResearcherProvider>
  );
}
