import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { CanvasPage } from './pages/Canvas'
import { ConceptPage } from './pages/ConceptPage'
import { QuizPage } from './pages/QuizPage'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { HubsPage } from './pages/Hubs'
import { DashboardPage } from './pages/Dashboard'
import { PlannerPage } from './pages/Planner'
import { motion } from 'framer-motion'
import { Brain } from 'lucide-react'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-cogni-bg flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <Brain size={48} className="mx-auto text-cogni-accent" />
        </motion.div>
        <p className="mt-4 text-white/50 font-semibold">Loading Pondr...</p>
      </motion.div>
    </div>
  )
}

function HomeRoute() {
  return <Landing />
}

function RequireAuth({ children }) {
  const user = useStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const authReady = useStore((s) => s.authReady)
  const initAuth = useStore((s) => s.initAuth)

  useEffect(() => {
    initAuth()
  }, [initAuth])

  if (!authReady) return <LoadingScreen />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/hubs" element={<RequireAuth><HubsPage /></RequireAuth>} />
        <Route path="/canvas" element={<RequireAuth><CanvasPage /></RequireAuth>} />
        <Route path="/learn/:nodeId" element={<RequireAuth><ConceptPage /></RequireAuth>} />
        <Route path="/planner" element={<RequireAuth><PlannerPage /></RequireAuth>} />
        <Route path="/assess/quiz" element={<RequireAuth><QuizPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
