import { useEffect, useState } from 'react'
import client from '../api/client'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [reports, setReports] = useState([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [statsRes, reportsRes] = await Promise.all([
      client.get('/admin/stats'),
      client.get('/admin/reports'),
    ])
    setStats(statsRes.data)
    setReports(reportsRes.data)
  }

  useEffect(() => {
    load()
  }, [])

  const setReportStatus = async (id, status) => {
    setBusy(true)
    try {
      await client.post(`/admin/reports/${id}/status/${status}`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!stats) return <div className="p-6 text-slate-500 dark:text-slate-400 font-medium">Loading admin dashboard…</div>

  const cards = [
    ['Parents', stats.total_users],
    ['Children', stats.total_children],
    ['Total scans', stats.total_scans],
    ['Open reports', stats.open_reports],
    ['Suspended accounts', stats.suspended_users],
  ]

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/10">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-slate-900 dark:text-white">Admin Operations Deck</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Platform telemetry and moderation incident response</p>
        </div>
        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
          Admin Tier
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map(([label, value]) => (
          <div key={label} className="glass-card rounded-2xl p-4 text-center border border-slate-200/80 dark:border-white/10 space-y-1">
            <div className="text-2xl font-display font-extrabold text-brand-600 dark:text-brand-400">{value}</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-200/80 dark:border-white/10">
        <h2 className="text-base font-display font-bold text-slate-900 dark:text-white mb-4">Abuse & Safety Incident Reports</h2>
        {reports.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No incident reports on file.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{r.reason}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Date(r.created_at).toLocaleString()} · status: <span className="font-mono font-bold uppercase text-brand-600 dark:text-brand-400">{r.status}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 self-end sm:self-auto">
                    {r.status !== 'reviewing' && (
                      <button
                        disabled={busy}
                        onClick={() => setReportStatus(r.id, 'reviewing')}
                        className="text-xs border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        Review
                      </button>
                    )}
                    {r.status !== 'resolved' && (
                      <button
                        disabled={busy}
                        onClick={() => setReportStatus(r.id, 'resolved')}
                        className="text-xs border border-safety-500/30 rounded-lg px-2.5 py-1 text-safety-700 dark:text-safety-300 bg-safety-50 dark:bg-safety-950/30 hover:bg-safety-100 dark:hover:bg-safety-900/40 transition"
                      >
                        Resolve
                      </button>
                    )}
                    {r.status !== 'dismissed' && (
                      <button
                        disabled={busy}
                        onClick={() => setReportStatus(r.id, 'dismissed')}
                        className="text-xs border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Admins never see full children's home addresses or scan-history detail here — only
        aggregate counts and the safety reports needed to moderate the platform.
      </p>
    </div>
  )
}
