import { useNavigate } from 'react-router-dom'
import { useScans } from '../hooks/useScans'
import { Camera } from 'lucide-react'

function formatDate(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time
}

export default function Home() {
  const navigate = useNavigate()
  const { scans } = useScans()

  return (
    <div className="flex flex-col min-h-dvh px-6 pt-14 pb-28">
      <h1 className="text-6xl text-white font-semibold mb-4">Roompt</h1>
      <p className="text-white/40 mb-8">Your scanned spaces</p>

      {scans.length === 0 ? (
        <p className="text-white/30 text-sm text-center mt-20">No scans yet. Tap the camera to get started.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {scans.map((scan) => (
            <div
              key={scan.id}
              className="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-4 active:bg-white/10 transition-colors"
            >
              <div>
                <p className="text-white font-medium text-base">{scan.label}</p>
                <p className="text-white/40 text-xs mt-0.5">{formatDate(scan.createdAt)}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6 3L12 9L6 15" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => navigate("/record")}
        className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-xl p-2 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="New scan"
      >
        <Camera className="w-6 h-6 text-black" />
      </button>
    </div>
  )
}
