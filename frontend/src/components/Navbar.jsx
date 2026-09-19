import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  // Hide standard navbar on public scanner view so scanner gets a dedicated emergency interface
  if (location.pathname.startsWith('/scan/')) {
    return null
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-sm dark:shadow-lg transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-brand-500 to-cyber-cyan flex items-center justify-center shadow-glow-brand group-hover:scale-105 transition-transform duration-200">
            <span className="text-xl">🛡️</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-brand-900 to-brand-700 dark:from-white dark:via-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                SAFEBAND
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-brand-500/10 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-500/30 font-mono">
                v2.0
              </span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase block -mt-0.5">
              Child Protection & Telemetry
            </span>
          </div>
        </Link>

        {/* Navigation & Controls */}
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            id="theme-toggle-button"
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-xs font-semibold
              bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700
              dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:border-white/10 dark:text-slate-200 shadow-sm"
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
          >
            <span className="text-sm transition-transform duration-300 inline-block transform hover:rotate-12">
              {isDark ? '☀️' : '🌙'}
            </span>
            <span className="hidden sm:inline">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          {user ? (
            <>
              <Link
                to="/dashboard"
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  location.pathname === '/dashboard'
                    ? 'bg-brand-500/15 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300 border border-brand-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                Dashboard
              </Link>
              {user.is_admin && (
                <Link
                  to="/admin"
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    location.pathname === '/admin'
                      ? 'bg-purple-500/15 text-purple-700 dark:bg-purple-600/20 dark:text-purple-300 border border-purple-500/30'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  Admin Ops
                </Link>
              )}
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-white/10">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-white/20 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="text-left leading-tight hidden md:block">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{user.full_name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{user.email}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-lg transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 px-4 py-2 rounded-xl shadow-glow-brand transition transform hover:-translate-y-0.5"
              >
                Get SafeBand Free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
