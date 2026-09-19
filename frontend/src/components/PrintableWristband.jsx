export default function PrintableWristband({ bracelets = [], onClose }) {
  if (!bracelets || bracelets.length === 0) return null

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-70 flex flex-col items-center justify-start p-4 sm:p-6 print:p-0 print:bg-white print:static print:overflow-visible">
      {/* Action Bar (hidden when printing) */}
      <div className="w-full max-w-4xl bg-white rounded-t-xl p-4 flex items-center justify-between shadow-lg border-b print:hidden">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            🖨️ Printable SafeBand Wristbands ({bracelets.length})
          </h2>
          <p className="text-xs text-gray-500">
            Standard 8.5"x11" or A4 format with wrist ruler & high-contrast QR.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow transition flex items-center gap-1.5"
          >
            <span>Print All Wristbands</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="w-full max-w-4xl bg-white p-6 rounded-b-xl shadow-lg space-y-6 print:space-y-4 print:p-0 print:shadow-none print:w-full">
        {bracelets.map((b, idx) => (
          <div
            key={b.id || idx}
            className="border-2 border-dashed border-gray-400 p-2 rounded-lg bg-white relative print:break-inside-avoid print:border-black"
          >
            {/* Cut line badge */}
            <div className="text-[10px] text-gray-400 font-mono mb-1 print:text-black">
              ✂ CUT ALONG DASHED LINE • SAFEBAND SAFETY WRISTBAND
            </div>

            {/* The Wristband Strap */}
            <div className="border border-gray-900 rounded-md p-2 bg-gradient-to-r from-blue-50 via-white to-blue-50 flex flex-col sm:flex-row items-center gap-3 print:bg-white print:border-2 print:border-black">
              {/* QR Code Section */}
              <div className="flex-shrink-0 flex flex-col items-center justify-center p-1 bg-white border border-gray-300 rounded print:border-black">
                {b.qr_image_base64 ? (
                  <img
                    src={b.qr_image_base64.startsWith('data:') ? b.qr_image_base64 : `data:image/png;base64,${b.qr_image_base64}`}
                    alt={`SafeBand QR for ${b.display_name}`}
                    className="w-24 h-24 object-contain print:w-28 print:h-28"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 flex items-center justify-center text-xs">
                    QR Code
                  </div>
                )}
                <span className="text-[10px] font-mono font-bold mt-0.5 text-gray-800">
                  {b.safeband_id}
                </span>
              </div>

              {/* Main Badge / Emergency Instructions */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-brand-700 uppercase tracking-tight print:text-black">
                    {b.display_name}
                  </span>
                  {b.event_name && (
                    <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium print:border print:border-black">
                      {b.event_name}
                    </span>
                  )}
                </div>

                <p className="text-xs font-bold text-red-600 mt-0.5 print:text-black">
                  EMERGENCY: SCAN QR CODE WITH ANY PHONE CAMERA
                </p>
                <p className="text-[11px] text-gray-600 print:text-black">
                  Instant reunification contact • No app or account required
                </p>

                {b.medical_info && (
                  <div className="mt-1 text-[11px] bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded font-medium print:border-black">
                    ⚠️ Medical Alert: {b.medical_info}
                  </div>
                )}

                {b.expires_at && (
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    Valid Until: {b.expires_at}
                  </p>
                )}
              </div>

              {/* Measurement Ruler Strip */}
              <div className="w-full sm:w-56 flex-shrink-0 flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-gray-300 sm:pl-3 pt-2 sm:pt-0 print:border-black">
                <div className="flex justify-between text-[9px] font-mono text-gray-500 mb-0.5 print:text-black">
                  <span>0cm</span>
                  <span>5cm</span>
                  <span>10cm</span>
                  <span>15cm</span>
                  <span>20cm</span>
                </div>
                <div className="h-4 w-full bg-gray-100 border border-gray-400 flex items-end justify-between px-0.5 print:bg-white print:border-black">
                  {[...Array(21)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-[1px] bg-gray-600 print:bg-black ${
                        i % 5 === 0 ? 'h-3 font-bold' : 'h-1.5'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-[9px] text-center text-gray-400 mt-1 font-mono print:text-black">
                  [ ADHESIVE / FASTENER TAPE AREA ]
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
