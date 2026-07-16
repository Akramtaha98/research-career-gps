import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from './components/Navbar';
import VerifyEmailBanner from './components/VerifyEmailBanner';
import ScrollToTop from './components/ScrollToTop';
import FeedbackWidget from './components/FeedbackWidget';
import ChatWidget from './components/ChatWidget';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import OrcidCallback from './pages/OrcidCallback';
import Search from './pages/Search';
import HowItWorks from './pages/HowItWorks';
import Dashboard from './pages/Dashboard';
import Timeline from './pages/Timeline';
import Predictor from './pages/Predictor';
import Actions from './pages/Actions';
import Verify from './pages/Verify';
import Contact from './pages/Contact';
import { ResearcherProvider } from './context/ResearcherContext';

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <ResearcherProvider>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <VerifyEmailBanner />
        <main className="flex-1">
          {/* key={pathname} forces a remount on every navigation, which
              replays the .page-transition fade defined in index.css — see
              that file's comment for why this stays a single cheap
              opacity/transform animation rather than anything heavier. */}
          <div key={location.pathname} className="page-transition">
            <Routes>
              <Route path="/" element={<Navigate to="/search" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/auth/orcid/callback" element={<OrcidCallback />} />
              <Route path="/search" element={<Search />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/predictor" element={<Predictor />} />
              <Route path="/actions" element={<Actions />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Routes>
          </div>
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
        <FeedbackWidget />
        <ChatWidget />
      </div>
    </ResearcherProvider>
  );
}
