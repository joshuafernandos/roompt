import { useAppStore } from '../store/useAppStore'

export default function Home() {
  const navigate = useAppStore((s) => s.navigate)

  return (
    <div className="flex flex-col min-h-screen bg-bg text-white px-6 pt-16 pb-safe">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="mb-12">
          <h1 className="text-4xl font-semibold tracking-tight mb-2">Roompt</h1>
          <p className="text-slate-400 text-base">
            Scan a space. Prompt what to build.
          </p>
        </div>

        <button
          onClick={() => navigate('record')}
          className="w-full bg-accent hover:bg-accent-hover active:bg-accent-active text-white font-medium text-base rounded-xl py-4 transition-colors"
        >
          New Scan
        </button>
      </div>

      <div className="mt-8 max-w-sm mx-auto w-full">
        <p className="text-slate-500 text-sm mb-4">Recent scans</p>
        <div className="bg-surface rounded-xl px-4 py-8 text-center">
          <p className="text-slate-500 text-sm">No scans yet</p>
        </div>
      </div>
    </div>
  )
}
