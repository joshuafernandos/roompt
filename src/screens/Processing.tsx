import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScans } from '@/hooks/useScans'
import { CheckCheck } from 'lucide-react'

const MOCK_ROOM_DATA = {
  spaceType: 'Living Room',
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
  const navigate = useNavigate()
  const { addScan } = useScans()
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), (i + 1) * 900))
    })
    timers.push(
      setTimeout(async () => {
        await addScan(MOCK_ROOM_DATA)
        navigate('/')
      }, STEPS.length * 900 + 400)
    )
    return () => timers.forEach(clearTimeout)
  }, [navigate, addScan])

  return (
    <div className="flex flex-col min-h-dvh  text-white px-6 items-center justify-center">
      <div className="w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-8 text-center">Analysing space</h2>
        <div className="flex flex-col gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-4">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                i < step ? 'bg-accent' : i === step ? 'animate-pulse' : ''
              }`}>
                {i < step && (
                  <CheckCheck className="w-3 h-3 text-white" />
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
