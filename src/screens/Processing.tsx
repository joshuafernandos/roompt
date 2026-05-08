import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

const MOCK_ROOM_DATA = {
  spaceType: 'room',
  estimatedWidth: 5,
  estimatedLength: 4,
  estimatedHeight: 2.7,
  floorType: 'timber',
  wallFeatures: [
    { wall: 'north', features: ['window'] },
    { wall: 'east', features: ['door'] },
  ],
  constraints: ['radiator south wall'],
}

const STEPS = ['Extracting frames', 'Analysing space', 'Mapping features', 'Building model']

export default function Processing() {
  const navigate = useAppStore((s) => s.navigate)
  const setRoomData = useAppStore((s) => s.setRoomData)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), (i + 1) * 900))
    })
    timers.push(
      setTimeout(() => {
        setRoomData(MOCK_ROOM_DATA)
        navigate('viewer')
      }, STEPS.length * 900 + 400)
    )
    return () => timers.forEach(clearTimeout)
  }, [navigate, setRoomData])

  return (
    <div className="flex flex-col min-h-screen bg-bg text-white px-6 items-center justify-center">
      <div className="w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-8 text-center">Analysing space</h2>
        <div className="flex flex-col gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-4">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                i < step ? 'bg-accent' : i === step ? 'bg-accent/40 animate-pulse' : 'bg-slate-700'
              }`}>
                {i < step && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className={`text-sm transition-colors ${i <= step ? 'text-white' : 'text-slate-500'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
