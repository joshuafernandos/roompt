import { Routes, Route, Navigate } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useIsMobile'
import Home from '@/screens/Home'
import Record from '@/screens/Record'
import Processing from '@/screens/Processing'
import Scan from '@/screens/Scan'

export default function App() {
  const isMobile = useIsMobile()

  if (!isMobile) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-8">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-semibold text-white mb-3">Mobile only</h1>
          <p className="text-slate-400 text-base">
            Roompt is designed for your phone. Open it on a mobile device to scan and prompt your
            space.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/record" element={<Record />} />
      <Route path="/processing" element={<Processing />} />
      <Route path="/scan/:id" element={<Scan />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
