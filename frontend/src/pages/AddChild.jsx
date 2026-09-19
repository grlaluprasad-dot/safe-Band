import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function AddChild() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // 1. Child Basic Information
  const [displayName, setDisplayName] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('en')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoMode, setPhotoMode] = useState('upload') // 'upload' or 'url'

  // 2. Medical & Emergency Info
  const [bloodGroup, setBloodGroup] = useState('')
  const [allergies, setAllergies] = useState('')
  const [emergencyInstructions, setEmergencyInstructions] = useState('')

  // Privacy & Visibility Controls (Sensitive info private by default)
  const [showPhotoPublicly, setShowPhotoPublicly] = useState(false)
  const [showAgePublicly, setShowAgePublicly] = useState(false)
  const [showBloodGroupPublicly, setShowBloodGroupPublicly] = useState(false)
  const [showAllergiesPublicly, setShowAllergiesPublicly] = useState(false)
  const [showEmergencyInstructionsPublicly, setShowEmergencyInstructionsPublicly] = useState(false)

  // 3. Multi-Guardian Information
  const [guardians, setGuardians] = useState([
    {
      name: user?.full_name || '',
      relation: 'Mother',
      phone: user?.phone_number || '',
      email: user?.email || '',
      notification_method: 'all',
      is_primary: true,
      notify_sms: true,
      notify_email: true,
    },
    {
      name: '',
      relation: 'Father',
      phone: '',
      email: '',
      notification_method: 'all',
      is_primary: false,
      notify_sms: true,
      notify_email: true,
    },
  ])

  // 4. Home Address (Private)
  const [addressLine, setAddressLine] = useState('')
  const [areaLocality, setAreaLocality] = useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] = useState('')
  const [pincode, setPincode] = useState('')

  // 5. Optional Geofence & Event Settings
  const [safeZoneName, setSafeZoneName] = useState('')
  const [safeZoneRadius, setSafeZoneRadius] = useState(500)
  const [isEventBracelet, setIsEventBracelet] = useState(false)
  const [eventName, setEventName] = useState('')
  const [expiryHours, setExpiryHours] = useState('24')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Automatic Age Calculation from DOB
  const calculatedAge = useMemo(() => {
    if (!dob) return null
    try {
      const birthDate = new Date(dob)
      if (isNaN(birthDate.getTime())) return null
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const m = today.getMonth() - birthDate.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }
      return age >= 0 ? age : null
    } catch {
      return null
    }
  }, [dob])

  // Handle Photo File Upload
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo size exceeds 5MB limit.')
      return
    }
    const reader = new FileReader()
    reader.onload = (uploadEvent) => {
      setPhotoUrl(uploadEvent.target.result)
    }
    reader.readAsDataURL(file)
  }

  // Guardian Management
  const updateGuardian = (index, field, value) => {
    const updated = [...guardians]
    updated[index][field] = value
    if (field === 'notification_method') {
      updated[index].notify_sms = value === 'sms' || value === 'all'
      updated[index].notify_email = value === 'email' || value === 'all'
    }
    setGuardians(updated)
  }

  const addGuardian = () => {
    setGuardians([
      ...guardians,
      {
        name: '',
        relation: 'Secondary Guardian',
        phone: '',
        email: '',
        notification_method: 'all',
        is_primary: false,
        notify_sms: true,
        notify_email: true,
      },
    ])
  }

  const removeGuardian = (index) => {
    if (guardians.length <= 1) return
    setGuardians(guardians.filter((_, idx) => idx !== index))
  }

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!displayName.trim()) {
      setError('Child first name or nickname is required.')
      return
    }

    setBusy(true)
    try {
      // Calculate Expiration datetime if event mode
      let expiresAt = null
      if (isEventBracelet && expiryHours && parseInt(expiryHours, 10) > 0) {
        const now = new Date()
        expiresAt = new Date(now.getTime() + parseInt(expiryHours, 10) * 3600 * 1000).toISOString()
      }

      // Format guardians list (only include non-empty entries)
      const validGuardians = guardians
        .filter((g) => g.name.trim().length > 0)
        .map((g) => ({
          name: g.name.trim(),
          relation: g.relation.trim() || 'Guardian',
          phone: g.phone.trim() || null,
          email: g.email.trim() || null,
          is_primary: g.is_primary,
          notify_sms: g.notify_sms,
          notify_email: g.notify_email,
          notification_method: g.notification_method,
        }))

      const payload = {
        display_name: displayName.trim(),
        dob: dob || null,
        gender: gender || null,
        preferred_language: preferredLanguage,
        photo_url: photoUrl.trim() || null,
        blood_group: bloodGroup || null,
        allergies: allergies.trim() || null,
        emergency_instructions: emergencyInstructions.trim() || null,
        medical_info: [
          allergies.trim() ? `Allergies: ${allergies.trim()}` : '',
          emergencyInstructions.trim() ? `Instructions: ${emergencyInstructions.trim()}` : '',
        ].filter(Boolean).join(' | ') || null,

        // Granular Visibility controls
        show_photo_publicly: showPhotoPublicly,
        show_age_publicly: showAgePublicly,
        show_blood_group_publicly: showBloodGroupPublicly,
        show_allergies_publicly: showAllergiesPublicly,
        show_emergency_instructions_publicly: showEmergencyInstructionsPublicly,
        show_medical_info_publicly: showAllergiesPublicly || showEmergencyInstructionsPublicly,

        // Strictly Private Home Address (NEVER shown publicly)
        address_line: addressLine.trim() || null,
        area_locality: areaLocality.trim() || null,
        city: city.trim() || null,
        state: stateName.trim() || null,
        pincode: pincode.trim() || null,

        // Multi-guardians
        guardians: validGuardians,

        // Event & SafeZone
        is_event_bracelet: isEventBracelet,
        event_name: isEventBracelet && eventName.trim() ? eventName.trim() : null,
        expires_at: expiresAt,
        safe_zone_name: safeZoneName.trim() || null,
        safe_zone_radius_m: safeZoneRadius || 500,
      }

      const res = await client.post('/children', payload)
      navigate(`/children/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save child profile. Please check your inputs.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Breadcrumb */}
      <div>
        <Link to="/dashboard" className="text-xs text-slate-400 hover:text-brand-400 transition flex items-center gap-1 mb-2">
          <span>← Back to Command Center</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse"></span>
          <span className="text-xs font-mono font-bold text-cyber-cyan uppercase tracking-wider">
            SafeBand Onboarding Deck
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight mt-1">
          Complete Child Registration & Hardware Issuance
        </h1>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Register your child with granular privacy controls. Home address and confidential data are strictly private and never exposed on the public QR scan page.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-900/40 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-slate-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: CHILD BASIC INFORMATION */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-300 flex items-center justify-center text-xs font-mono font-bold">
                01
              </span>
              <span>Child Basic Information</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">* Required fields</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name / Nickname */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                First Name / Nickname *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Leo, Maya, Liam"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Only this first name/nickname is shown publicly on scans.
              </p>
            </div>

            {/* Preferred Language */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Preferred Language
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none bg-white dark:bg-slate-900"
              >
                <option value="en">English (Default)</option>
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
                <option value="te">తెలుగు (Telugu)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Pre-configures scanner interface language when found.
              </p>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            {/* Calculated Age Display & Gender */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Age (Computed)
                </label>
                <div className="w-full text-sm px-3 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-brand-300 font-mono font-bold text-center">
                  {calculatedAge !== null ? `${calculatedAge} yrs old` : '—'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Gender (Optional)
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 rounded-xl glass-input focus:outline-none bg-slate-900"
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>

          {/* Photo Upload or URL */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">
                Child Photo (Optional)
              </label>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPhotoMode('upload')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    photoMode === 'upload' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode('url')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    photoMode === 'url' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Image URL
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {photoUrl ? (
                <div className="relative group flex-shrink-0">
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-brand-500 shadow-glow-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-dashed border-white/20 flex items-center justify-center text-slate-500 text-xl flex-shrink-0">
                  📷
                </div>
              )}

              <div className="flex-1 min-w-0">
                {photoMode === 'upload' ? (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500 cursor-pointer"
                  />
                ) : (
                  <input
                    type="url"
                    placeholder="https://example.com/photo.jpg"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                )}
                <span className="text-[10px] text-slate-500 mt-1 block">
                  PNG, JPG, or WEBP up to 5MB. Protected under strict privacy controls.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: MEDICAL & EMERGENCY INFORMATION */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs font-mono font-bold">
                02
              </span>
              <span>Medical & Emergency Advisory Dossier</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">Optional Emergency Specs</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Blood Group</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none bg-slate-900"
              >
                <option value="">Not Specified</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Allergies & Sensitivities
              </label>
              <input
                type="text"
                placeholder="e.g. Severe Peanut Allergy, Penicillin, Bee stings"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                className="w-full text-sm px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1">
              Critical Emergency Instructions
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Carries EpiPen in backpack front pocket. Asthmatic (inhaler attached to pouch). Keep calm and call guardian."
              value={emergencyInstructions}
              onChange={(e) => setEmergencyInstructions(e.target.value)}
              className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
            />
          </div>
        </div>

        {/* SECTION 3: GRANULAR VISIBILITY CONTROLS */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-4 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-cyber-cyan/20 text-cyber-cyan flex items-center justify-center text-xs font-mono font-bold">
                  03
                </span>
                <span>Public Scan Visibility Controls</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sensitive details are private by default. Check only the items you want finders to see when scanning the QR.
              </p>
            </div>
            <span className="text-[10px] font-bold bg-safety-500/20 text-safety-300 border border-safety-500/30 px-2 py-0.5 rounded">
              PRIVATE BY DEFAULT
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-brand-500/40 cursor-pointer transition">
              <input
                type="checkbox"
                checked={showPhotoPublicly}
                onChange={(e) => setShowPhotoPublicly(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Show Photo on Public Scan</span>
                <span className="text-[10px] text-slate-400">Allows scanner to visually confirm child face match.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-brand-500/40 cursor-pointer transition">
              <input
                type="checkbox"
                checked={showAgePublicly}
                onChange={(e) => setShowAgePublicly(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Show Age on Public Scan</span>
                <span className="text-[10px] text-slate-400">Displays calculated age (e.g. 7 yrs old) to finder.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-brand-500/40 cursor-pointer transition">
              <input
                type="checkbox"
                checked={showBloodGroupPublicly}
                onChange={(e) => setShowBloodGroupPublicly(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Show Blood Group</span>
                <span className="text-[10px] text-slate-400">Reveals blood type advisory to emergency responders.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-brand-500/40 cursor-pointer transition">
              <input
                type="checkbox"
                checked={showAllergiesPublicly}
                onChange={(e) => setShowAllergiesPublicly(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Show Allergy Information</span>
                <span className="text-[10px] text-slate-400">Alerts finder not to feed child allergen foods.</span>
              </div>
            </label>

            <label className="sm:col-span-2 flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-brand-500/40 cursor-pointer transition">
              <input
                type="checkbox"
                checked={showEmergencyInstructionsPublicly}
                onChange={(e) => setShowEmergencyInstructionsPublicly(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Show Emergency Instructions</span>
                <span className="text-[10px] text-slate-400">Provides critical medical instructions (EpiPen, inhaler location) to anyone assisting.</span>
              </div>
            </label>
          </div>
        </div>

        {/* SECTION 4: MULTI-GUARDIAN INFORMATION */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-brand-600/20 text-brand-300 flex items-center justify-center text-xs font-mono font-bold">
                  04
                </span>
                <span>Guardian Emergency Network</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All registered guardians receive simultaneous alerts when a scan occurs.
              </p>
            </div>
            <button
              type="button"
              onClick={addGuardian}
              className="text-xs font-bold text-brand-300 hover:text-white bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/30 px-3 py-1.5 rounded-xl transition"
            >
              + Add Guardian
            </button>
          </div>

          <div className="space-y-4">
            {guardians.map((g, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-900/70 border border-white/10 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-brand-400">
                      Guardian #{idx + 1}
                    </span>
                    {idx === 0 && (
                      <span className="text-[10px] bg-brand-500/20 text-brand-300 border border-brand-500/30 px-2 py-0.2 rounded font-bold">
                        PRIMARY ACCOUNT
                      </span>
                    )}
                  </div>
                  {guardians.length > 1 && idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removeGuardian(idx)}
                      className="text-slate-400 hover:text-red-400 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Full Name {idx === 0 && '*'}
                    </label>
                    <input
                      type="text"
                      required={idx === 0}
                      placeholder="e.g. Sarah Connor"
                      value={g.name}
                      onChange={(e) => updateGuardian(idx, 'name', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Relationship {idx === 0 && '*'}
                    </label>
                    <input
                      type="text"
                      required={idx === 0}
                      placeholder="Mother, Father, Grandparent"
                      value={g.relation}
                      onChange={(e) => updateGuardian(idx, 'relation', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Phone Number (SMS Alert)
                    </label>
                    <input
                      type="tel"
                      placeholder="+1 555-0199"
                      value={g.phone}
                      onChange={(e) => updateGuardian(idx, 'phone', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="guardian@example.com"
                      value={g.email}
                      onChange={(e) => updateGuardian(idx, 'email', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                    />
                  </div>
                </div>

                {/* Preferred Notification Method */}
                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Preferred Notification Method:
                  </span>
                  <div className="flex gap-2">
                    {[
                      { id: 'all', label: 'All (SMS + Email + App)' },
                      { id: 'sms', label: 'SMS Only' },
                      { id: 'email', label: 'Email Only' },
                      { id: 'in_app', label: 'In-App Only' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateGuardian(idx, 'notification_method', opt.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                          g.notification_method === opt.id
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 5: HOME ADDRESS (STRICTLY PRIVATE) */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-4">
          <div className="border-b border-white/10 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-mono font-bold">
                  05
                </span>
                <span>Home Address (Confidential & Private)</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Stored for official police dossiers and lost mode only.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg self-start sm:self-auto">
              <span>🔒 NEVER SHOWN ON PUBLIC QR SCAN</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-200 mb-1">Address Line</label>
              <input
                type="text"
                placeholder="Apartment, building, street number"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Area / Locality</label>
              <input
                type="text"
                placeholder="e.g. Downtown, Sector 4, Green Park"
                value={areaLocality}
                onChange={(e) => setAreaLocality(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">City</label>
              <input
                type="text"
                placeholder="e.g. Springfield, London, Bengaluru"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">State / Province</label>
              <input
                type="text"
                placeholder="e.g. Karnataka"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">PIN Code / ZIP</label>
              <input
                type="text"
                placeholder="e.g. 583101"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 6: EVENT MODE & GEOFENCE (OPTIONAL) */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 border border-white/10 space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-safety-500/20 text-safety-300 flex items-center justify-center text-xs font-mono font-bold">
                06
              </span>
              <span>Geofence & Temporary Event Mode (Optional)</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Geofence Preset */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Safe Zone Name</label>
              <input
                type="text"
                placeholder="e.g. Home Safe Zone, School Campus"
                value={safeZoneName}
                onChange={(e) => setSafeZoneName(e.target.value)}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Safe Zone Radius ({safeZoneRadius}m)
              </label>
              <select
                value={safeZoneRadius}
                onChange={(e) => setSafeZoneRadius(Number(e.target.value))}
                className="w-full text-xs px-4 py-2.5 rounded-xl glass-input focus:outline-none bg-slate-900"
              >
                <option value="200">200 meters (Immediate venue / playground)</option>
                <option value="500">500 meters (Standard park / neighborhood)</option>
                <option value="1000">1 kilometer (School / event campus)</option>
                <option value="2500">2.5 kilometers (Wide perimeter)</option>
              </select>
            </div>
          </div>

          {/* Event Mode Toggle */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isEventBracelet}
                onChange={(e) => setIsEventBracelet(e.target.checked)}
                className="rounded bg-slate-800 text-brand-600 border-white/20"
              />
              <span>Enable Temporary Event Mode (Auto-expires after trip / festival)</span>
            </label>

            {isEventBracelet && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-900/60 rounded-xl border border-white/10">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Event Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Zoo Field Trip 2026"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Auto-Expiry Duration</label>
                  <select
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg glass-input focus:outline-none bg-slate-900"
                  >
                    <option value="6">6 Hours (Half Day)</option>
                    <option value="12">12 Hours (Full Day)</option>
                    <option value="24">24 Hours (Overnight)</option>
                    <option value="72">3 Days (Weekend Camp)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-cyber-cyan hover:from-brand-500 hover:to-cyber-cyan text-white font-display font-extrabold text-sm shadow-glow-brand transition transform hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>{busy ? 'Registering & Generating Hardware...' : '🛡️ Save & Generate SafeBand Bracelet'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
