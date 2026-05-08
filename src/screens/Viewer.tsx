import { useAppStore } from '../store/useAppStore'

export default function Viewer() {
  const navigate = useAppStore((s) => s.navigate)
  const roomData = useAppStore((s) => s.roomData)

  return (
    <div className="flex flex-col min-h-screen bg-bg text-white items-center justify-center px-6">
      <p className="text-slate-400 text-sm mb-4">Room analysed</p>
      {roomData && (
        <p className="text-white/80 text-sm mb-8">
          {roomData.estimatedWidth}m × {roomData.estimatedLength}m · {roomData.floorType}
        </p>
      )}
      <button
        onClick={() => navigate('home')}
        className="bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-xl px-6 py-3"
      >
        Back to Home
      </button>
    </div>
  )
}
