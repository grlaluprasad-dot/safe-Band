import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import BulkRegisterModal from '../components/BulkRegisterModal'

export default function Dashboard() {
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)

  const load = async () => {
    try {
      const res = await client.get('/children')
      setChildren(res.data)
    } catch {
      setError('Could not load your children\'s profiles.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredChildren = children.filter((c) =>
    c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.safeband_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.event_name && c.event_name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const activeCount = children.filter((c) => c.is_active).length
  const lostCount = children.filter((c) => c.lost_mode).length
  const safeZoneCount = children.filter((c) => c.safe_zone_lat != null).length

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500 dark:text-slate-400 font-medium">
        <span className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mr-3"></span>
        Loading Tactical Dashboard...
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-safety-500 animate-pulse"></span>
            <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyber-cyan tracking-wider uppercase">
              Command Deck Active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            Child Protection & Wearables
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Monitor real-time geofence perimeters, generate QR wristbands, and review incident telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-white hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-cyan-700 dark:text-cyber-cyan border border-cyan-500/30 dark:border-cyber-cyan/30 font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2"
          >
            <span>🎟️ Bulk Register (Events)</span>
          </button>
          <Link
            to="/children/new"
            className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-glow-brand transition flex items-center gap-2"
          >
            <span>+ Add New Child</span>
          </Link>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Total Protected</span>
            <span className="text-base">🛡️</span>
          </div>
          <div className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 dark:text-white">
            {children.length}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Profiles registered under your account</p>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Active Wearables</span>
            <span className="text-base">📡</span>
          </div>
          <div className="text-2xl sm:text-3xl font-display font-extrabold text-safety-600 dark:text-safety-400">
            {activeCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Ready for instant camera scanning</p>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Active Safe Zones</span>
            <span className="text-base">📍</span>
          </div>
          <div className="text-2xl sm:text-3xl font-display font-extrabold text-cyan-700 dark:text-cyber-cyan">
            {safeZoneCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Continuous geofence radius checks</p>
        </div>

        <div className={`glass-card rounded-2xl p-4 sm:p-5 border space-y-2 ${
          lostCount > 0
            ? 'border-emergency-500/50 bg-emergency-50 dark:bg-emergency-950/30 shadow-glow-emergency'
            : 'border-slate-200/80 dark:border-white/10'
        }`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Lost Mode Status</span>
            <span className="text-base">🚨</span>
          </div>
          <div className={`text-2xl sm:text-3xl font-display font-extrabold ${
            lostCount > 0 ? 'text-emergency-600 dark:text-emergency-400 animate-pulse' : 'text-slate-900 dark:text-slate-200'
          }`}>
            {lostCount > 0 ? `${lostCount} ACTIVE` : 'All Safe'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {lostCount > 0 ? 'Urgent scans flagged' : 'Zero active distress modes'}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      {children.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, ID, or event..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl glass-input focus:outline-none"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 self-end sm:self-center">
            Showing <strong className="text-slate-800 dark:text-slate-200">{filteredChildren.length}</strong> of {children.length} profiles
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Children Cards Grid */}
      {children.length === 0 ? (
        <div className="glass-card rounded-2xl border border-slate-200/80 dark:border-white/10 p-12 text-center space-y-5 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-600 dark:text-brand-300 flex items-center justify-center text-3xl mx-auto shadow-glow-brand">
            🛡️
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">No Children Registered Yet</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Add your child or batch register an entire event group to generate printable SafeBand QR wristbands with instant GPS telemetry.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/children/new"
              className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-glow-brand transition"
            >
              + Add First Child
            </Link>
            <button
              onClick={() => setShowBulkModal(true)}
              className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyber-cyan border border-cyan-500/30 dark:border-cyber-cyan/30 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              🎟️ Event Bulk Register
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChildren.map((child) => (
            <Link
              key={child.id}
              to={`/children/${child.id}`}
              className="glass-card glass-card-hover rounded-2xl p-5 border border-slate-200/80 dark:border-white/10 flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Top Row: Avatar & Name */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-brand-700 to-cyber-cyan flex items-center justify-center text-white font-display font-bold text-xl shadow-glow-brand group-hover:scale-105 transition-transform duration-200">
                      {child.display_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">
                        {child.display_name}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold tracking-wider">
                        {child.safeband_id}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {child.lost_mode ? (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emergency-600 text-white shadow-glow-emergency animate-pulse">
                        LOST MODE
                      </span>
                    ) : child.is_active ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-safety-500/15 text-safety-700 dark:text-safety-300 border border-safety-500/30">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10">
                        REVOKED
                      </span>
                    )}
                  </div>
                </div>

                {/* Event or Medical tags */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {child.event_name && (
                    <span className="text-[10px] font-medium bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20 px-2 py-0.5 rounded-md truncate max-w-full">
                      🎪 {child.event_name}
                    </span>
                  )}
                  {child.safe_zone_lat ? (
                    <span className="text-[10px] font-medium bg-cyan-500/10 text-cyan-800 dark:text-cyber-cyan border border-cyan-500/20 px-2 py-0.5 rounded-md">
                      📍 Safe Zone: {child.safe_zone_radius_m || 500}m
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      No Geofence Set
                    </span>
                  )}
                </div>

                {child.medical_info && (
                  <p className="mt-3 text-[11px] text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/30 border border-amber-500/20 rounded-lg p-2 line-clamp-2">
                    ⚠️ {child.medical_info}
                  </p>
                )}
              </div>

              {/* Bottom Card Bar */}
              <div className="mt-5 pt-3 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-mono">
                  {child.guardians?.length || 1} Guardians
                </span>
                <span className="text-brand-600 dark:text-brand-400 group-hover:text-brand-500 dark:group-hover:text-brand-300 font-bold flex items-center gap-1">
                  Open Command Deck →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showBulkModal && (
        <BulkRegisterModal
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => load()}
        />
      )}
    </div>
  )
}
