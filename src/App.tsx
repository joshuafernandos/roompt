import { useAppStore } from './store/useAppStore'
import Home from './screens/Home'
import Record from './screens/Record'
import Processing from './screens/Processing'
import Viewer from './screens/Viewer'

export default function App() {
  const screen = useAppStore((s) => s.screen)

  return (
    <div className="min-h-screen bg-bg">
      {screen === 'home' && <Home />}
      {screen === 'record' && <Record />}
      {screen === 'processing' && <Processing />}
      {screen === 'viewer' && <Viewer />}
    </div>
  )
}
