import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone_number: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(form)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-4">
      <div className="glass-card rounded-2xl p-6 sm:p-8 border border-slate-200/80 dark:border-white/10 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyber-cyan mx-auto flex items-center justify-center text-2xl shadow-glow-brand mb-3">
            🛡️
          </div>
          <h1 className="text-2xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight">
            Create SafeBand Account
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Guardian-exclusive registration with encrypted data storage
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Full Name
            </label>
            <input
              required
              placeholder="e.g. Sarah Jenkins"
              className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="sarah@example.com"
              className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Phone Number <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">(Emergency Contact)</span>
            </label>
            <input
              placeholder="+1 555-0199"
              className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Password <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">(min 8 characters)</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <button
            disabled={busy}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-sm py-2.5 rounded-xl shadow-glow-brand transition disabled:opacity-50 mt-2"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-6">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
