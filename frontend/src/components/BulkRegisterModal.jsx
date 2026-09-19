import { useState } from 'react'
import client from '../api/client'
import PrintableWristband from './PrintableWristband'

export default function BulkRegisterModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('manual') // 'manual' or 'csv'
  const [eventName, setEventName] = useState('')
  const [expiryHours, setExpiryHours] = useState('24')
  const [safeZoneName, setSafeZoneName] = useState('')
  const [safeZoneRadius, setSafeZoneRadius] = useState(500)

  // Manual rows
  const [rows, setRows] = useState([
    { display_name: '', medical_info: '', emergency_contact_name: '', emergency_contact_phone: '' },
    { display_name: '', medical_info: '', emergency_contact_name: '', emergency_contact_phone: '' },
    { display_name: '', medical_info: '', emergency_contact_name: '', emergency_contact_phone: '' },
  ])

  // Uploaded CSV data
  const [csvFile, setCsvFile] = useState(null)
  const [csvRows, setCsvRows] = useState([])
  const [csvError, setCsvError] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdChildren, setCreatedChildren] = useState(null)
  const [printData, setPrintData] = useState(null)

  // Add row in manual mode
  const addRow = () => {
    setRows([
      ...rows,
      { display_name: '', medical_info: '', emergency_contact_name: '', emergency_contact_phone: '' },
    ])
  }

  // Remove row
  const removeRow = (index) => {
    setRows(rows.filter((_, idx) => idx !== index))
  }

  // Update row
  const updateRow = (index, field, value) => {
    const updated = [...rows]
    updated[index][field] = value
    setRows(updated)
  }

  // Parse uploaded CSV
  const handleCsvChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCsvFile(file)
    setCsvError('')

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
        if (lines.length <= 1) {
          setCsvError('CSV file appears empty or missing data rows.')
          return
        }

        const parsed = []
        // Skip header if first row contains 'name'
        const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0
        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
          if (cols[0]) {
            parsed.push({
              display_name: cols[0] || '',
              medical_info: cols[1] || '',
              emergency_contact_name: cols[2] || '',
              emergency_contact_phone: cols[3] || '',
            })
          }
        }
        if (parsed.length === 0) {
          setCsvError('No valid child names found in the CSV.')
        } else {
          setCsvRows(parsed)
        }
      } catch (err) {
        setCsvError('Failed to parse CSV: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // Validate and submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const candidateList = mode === 'manual' ? rows : csvRows
    const validChildren = candidateList
      .filter((r) => r.display_name && r.display_name.trim().length > 0)
      .map((r) => ({
        display_name: r.display_name.trim(),
        medical_info: r.medical_info?.trim() || null,
        emergency_contact_name: r.emergency_contact_name?.trim() || null,
        emergency_contact_phone: r.emergency_contact_phone?.trim() || null,
        emergency_contact_relation: 'Guardian',
      }))

    if (validChildren.length === 0) {
      setError('Please provide at least one child with a valid name.')
      return
    }

    // Calculate expiry datetime
    let expiresAt = null
    if (expiryHours && parseInt(expiryHours, 10) > 0) {
      const now = new Date()
      expiresAt = new Date(now.getTime() + parseInt(expiryHours, 10) * 3600 * 1000).toISOString()
    }

    setBusy(true)
    try {
      const payload = {
        event_name: eventName.trim() || null,
        expires_at: expiresAt,
        safe_zone_name: safeZoneName.trim() || null,
        safe_zone_radius_m: safeZoneRadius || 500,
        children: validChildren,
      }

      const res = await client.post('/bulk/children', payload)
      const created = res.data.children
      setCreatedChildren(created)

      // Fetch batch print data immediately
      const childIds = created.map((c) => c.id)
      const printRes = await client.post('/bulk/batch-print-data', childIds)
      setPrintData(printRes.data.bracelets)

      if (onSuccess) onSuccess(created)
    } catch (err) {
      setError(err.response?.data?.detail || 'Bulk registration failed.')
    } finally {
      setBusy(false)
    }
  }

  // If print modal requested
  const [showPrintView, setShowPrintView] = useState(false)

  if (showPrintView && printData) {
    return (
      <PrintableWristband
        bracelets={printData}
        onClose={() => {
          setShowPrintView(false)
          onClose()
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="bg-brand-700 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>🎟️ Event Organizer — Bulk Child Registration</span>
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">
              Rapidly register whole classrooms, sports teams, or festival attendees.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-xl font-bold"
          >
            ✕
          </button>
        </div>

        {/* Success State */}
        {createdChildren ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto text-2xl">
              ✓
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Successfully Registered {createdChildren.length} Children!
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              SafeBand IDs and unique unguessable QR tokens have been generated for each child.
              Ready to print emergency bracelets now.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <button
                onClick={() => setShowPrintView(true)}
                className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow transition flex items-center gap-2"
              >
                <span>🖨️ 1-Click Batch Print Wristbands ({createdChildren.length})</span>
              </button>
              <button
                onClick={onClose}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Event Settings Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Event / Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Summer Camp 2026, Field Trip Zoo"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Automatic Bracelet Expiry
                </label>
                <select
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="6">Expires in 6 Hours (Half-Day Event)</option>
                  <option value="12">Expires in 12 Hours (Full-Day Field Trip)</option>
                  <option value="24">Expires in 24 Hours (Overnight)</option>
                  <option value="72">Expires in 3 Days (Weekend Camp)</option>
                  <option value="168">Expires in 7 Days (1 Week)</option>
                  <option value="0">Never Expires (Permanent)</option>
                </select>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                  mode === 'manual'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Manual Batch Entry Table
              </button>
              <button
                type="button"
                onClick={() => setMode('csv')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                  mode === 'csv'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Upload CSV Spreadsheet
              </button>
            </div>

            {/* Manual Table Mode */}
            {mode === 'manual' ? (
              <div className="space-y-3">
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase font-semibold">
                      <tr>
                        <th className="p-2.5">Child First Name *</th>
                        <th className="p-2.5">Medical / Allergies</th>
                        <th className="p-2.5">Emergency Contact</th>
                        <th className="p-2.5">Phone Number</th>
                        <th className="p-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. Noah"
                              value={row.display_name}
                              onChange={(e) => updateRow(idx, 'display_name', e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                              required={idx === 0}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. Asthmatic, carries inhaler"
                              value={row.medical_info}
                              onChange={(e) => updateRow(idx, 'medical_info', e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. Mom (Sarah)"
                              value={row.emergency_contact_name}
                              onChange={(e) => updateRow(idx, 'emergency_contact_name', e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="tel"
                              placeholder="e.g. +1 555-0199"
                              value={row.emergency_contact_phone}
                              onChange={(e) => updateRow(idx, 'emergency_contact_phone', e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            />
                          </td>
                          <td className="p-2 text-center">
                            {rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                className="text-gray-400 hover:text-red-500 text-sm font-bold"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={addRow}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  + Add Another Child Row
                </button>
              </div>
            ) : (
              /* CSV Upload Mode */
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-brand-500 transition">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvChange}
                    id="csv-file-input"
                    className="hidden"
                  />
                  <label
                    htmlFor="csv-file-input"
                    className="cursor-pointer flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-3xl">📄</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {csvFile ? csvFile.name : 'Click to upload CSV spreadsheet'}
                    </span>
                    <span className="text-xs text-gray-400">
                      Format: Child Name, Medical Notes, Emergency Contact Name, Phone
                    </span>
                  </label>
                </div>

                {csvError && (
                  <div className="p-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded">
                    {csvError}
                  </div>
                )}

                {csvRows.length > 0 && (
                  <div className="border rounded-lg p-3 bg-gray-50 text-xs">
                    <span className="font-bold text-gray-700">
                      ✓ {csvRows.length} children ready to import
                    </span>
                    <ul className="mt-1 max-h-28 overflow-y-auto text-gray-600 list-disc list-inside">
                      {csvRows.slice(0, 5).map((r, i) => (
                        <li key={i}>
                          <b>{r.display_name}</b> {r.medical_info ? `(${r.medical_info})` : ''} - Contact:{' '}
                          {r.emergency_contact_phone || 'None'}
                        </li>
                      ))}
                      {csvRows.length > 5 && (
                        <li className="italic">...and {csvRows.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-xl shadow transition disabled:opacity-50"
              >
                {busy ? 'Registering...' : 'Register Children & Generate Wristbands'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
