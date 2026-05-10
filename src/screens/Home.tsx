import { useNavigate } from "react-router-dom";
import { useScans } from "@/hooks/useScans";
import { useSwipeMotion } from "@/hooks/useSwipeMotion";
import { Camera, Trash2, ChevronRight } from "lucide-react";
import { formatDate } from "@/utils/formatDate";

function ScanRow({
  scan,
  onDelete,
}: {
  scan: { id: string; label: string; createdAt: number }
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const { offset, handlers, isOpen } = useSwipeMotion()
  const DELETE_WIDTH = 72

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        onClick={() => onDelete(scan.id)}
        className="absolute right-2 top-2 bottom-2 flex items-center justify-center bg-red-500 active:bg-red-600 transition-colors"
        style={{ width: DELETE_WIDTH }}
        aria-label="Delete scan"
      >
        <Trash2 className="w-5 h-5 text-white" />
      </button>

      <div
        {...handlers}
        onClick={() => !isOpen && navigate(`/scan/${scan.id}`)}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isOpen ? 'none' : 'transform 0.25s ease',
        }}
        className="relative flex items-center justify-between rounded-2xl px-4 py-4 border border-white/5 cursor-pointer bg-bg"
      >
        <div>
          <p className="text-white font-medium text-base">{scan.label}</p>
          <p className="text-white/40 text-xs mt-0.5">{formatDate(scan.createdAt)}</p>
        </div>
        <ChevronRight className="w-[18px] h-[18px] text-white/30" />
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate();
  const { scans, deleteScan, isLoading } = useScans();

  return (
    <div className="flex flex-col min-h-dvh px-6 pt-14 pb-28">
      <h1 className="text-6xl text-white font-semibold mb-4">Roompt</h1>
      <p className="text-white/40 mb-8">Your scanned spaces</p>
      {scans.length === 0 ? (
        <p className="text-white/30 text-sm text-center mt-20">
          {isLoading ? 'Loading scans...' : 'No scans yet. Tap the camera to get started.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {scans.map((scan) => (
            <ScanRow key={scan.id} scan={scan} onDelete={deleteScan} />
          ))}
        </div>
      )}

      <button
        onClick={() => navigate("/record")}
        className="fixed bottom-8 right-8 z-20 p-2 rounded-xl bg-white w-14 h-14 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="New scan"
      >
        <Camera />
      </button>
    </div>
  );
}
