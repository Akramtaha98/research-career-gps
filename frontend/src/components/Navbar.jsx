import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItem = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="bg-brand-gradient shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg">
          <span aria-hidden>🧭</span> Research Career GPS
        </Link>
        <div className="flex items-center gap-1">
          <NavLink to="/search" className={navItem}>Search</NavLink>
          <NavLink to="/dashboard" className={navItem}>Dashboard</NavLink>
          <NavLink to="/predictor" className={navItem}>Predictor</NavLink>
          <NavLink to="/actions" className={navItem}>Actions</NavLink>
          {user ? (
            <button onClick={handleLogout} className="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 transition">
              Log out
            </button>
          ) : (
            <NavLink to="/login" className={navItem}>Log in</NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
