import { create } from 'zustand'

export type Screen = 'home' | 'record' | 'processing' | 'viewer'

export interface RoomData {
  spaceType: string
  estimatedWidth: number
  estimatedLength: number
  estimatedHeight: number
  floorType: string
  wallFeatures: { wall: string; features: string[] }[]
  constraints: string[]
}

export interface PlacedObject {
  id: string
  name: string
  emoji: string
  x: number
  y: number
  z: number
  rotationY: number
  width: number
  depth: number
  height: number
  colour: string
}

export interface BuildStep {
  step: number
  title: string
  detail: string
  time: string
}

export interface PromptResult {
  objects: PlacedObject[]
  plan: {
    summary: string
    steps: BuildStep[]
  }
}

interface AppState {
  screen: Screen
  videoBlob: Blob | null
  roomData: RoomData | null
  promptResults: PromptResult | null
  navigate: (screen: Screen) => void
  setVideoBlob: (blob: Blob) => void
  setRoomData: (data: RoomData) => void
  setPromptResults: (results: PromptResult) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  videoBlob: null,
  roomData: null,
  promptResults: null,
  navigate: (screen) => set({ screen }),
  setVideoBlob: (blob) => set({ videoBlob: blob }),
  setRoomData: (data) => set({ roomData: data }),
  setPromptResults: (results) => set({ promptResults: results }),
}))
