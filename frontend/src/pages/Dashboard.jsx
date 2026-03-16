import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/ui/Sidebar'
import { useStore } from '../store/useStore'
import { useGamification } from '../hooks/useGamification'
import { api } from '../api/client'
import { StreakCounter } from '../components/gamification/StreakCounter'
import { LevelBadge } from '../components/gamification/LevelBadge'
import {
  Brain, ChevronRight, LayoutGrid, Flame, TrendingUp,
} from 'lucide-react'

const HUB_ICONS = {
  machine_learning: Brain,
  'machine learning': Brain,
  data_science: Brain,
  web_development: Brain,
  default: Brain,
}

function getIconForTopic(topic) {
  const key = (topic || '').toLowerCase()
  for (const [k, Icon] of Object.entries(HUB_ICONS)) {
    if (k !== 'default' && key.includes(k)) return Icon
  }
  return HUB_ICONS.default
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, sidebarOpen, hubs, fetchHubs, selectHub, gamification } = useStore()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)

  useGamification()

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([fetchHubs(), api.get('/graph/progress').then((r) => r.data).catch(() => null)])
      .then(([, prog]) => {
        setProgress(prog)
      })
      .finally(() => setLoading(false))
  }, [user, fetchHubs])

  const handleHubClick = (hub) => {
    selectHub(hub.id)
    navigate(`/canvas?hub_id=${hub.id}`)
  }

  const greetingTime = new Date().getHours()
  const greeting = greetingTime < 12 ? 'Good morning' : greetingTime < 18 ? 'Good afternoon' : 'Good evening'
  const streakDays = gamification?.streakDays ?? gamification?.streak_days ?? 0
  const level = gamification?.level ?? 1
  const levelTitle = gamification?.levelTitle ?? gamification?.level_title ?? 'Novice'

  return (
    <div className="min-h-screen bg-cogni-bg">
      <Sidebar />
      <div
        className="transition-all duration-300 p-8"
        style={{ marginLeft: sidebarOpen ? 224 : 72 }}
      >
        <div className="max-w-5xl mx-auto">
          {/* Greeting */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-8"
          >
            <h1 className="font-display text-3xl font-extrabold">
              {greeting},{' '}
              <span className="text-white/60">{user?.name || 'Learner'}.</span>{' '}
              <span className="bg-gradient-to-r from-cogni-accent to-cogni-teal bg-clip-text text-transparent">
                Good to see you back.
              </span>
            </h1>
          </motion.div>

          {/* Stats: streak, level, overall progress */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10"
          >
            <div className="cogni-card flex items-center gap-4">
              <StreakCounter days={streakDays} />
              {streakDays === 0 && (
                <div className="flex items-center gap-2">
                  <Flame size={20} className="text-white/30" />
                  <span className="text-sm text-white/50">Daily streak</span>
                </div>
              )}
            </div>
            <div className="cogni-card flex items-center gap-4">
              <LevelBadge level={level} title={levelTitle} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-cogni-accent">Level</p>
                <p className="text-lg font-bold text-white">{levelTitle}</p>
              </div>
            </div>
            <div className="cogni-card">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cogni-teal mb-1">Progress</p>
              {loading ? (
                <p className="text-white/40 text-sm">Loading...</p>
              ) : progress ? (
                <>
                  <p className="text-2xl font-display font-extrabold text-white">
                    {progress.mastery_pct ?? 0}%
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {progress.mastered ?? 0} mastered · {progress.in_progress ?? 0} in progress · {progress.not_started ?? 0} to learn
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/40">No topics yet</p>
              )}
            </div>
          </motion.div>

          {/* Hubs as cards */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-10"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-bold">Your learning hubs</h2>
              <button
                onClick={() => navigate('/hubs')}
                className="text-sm text-cogni-accent flex items-center gap-1 hover:text-cogni-accent-light transition-colors"
              >
                Create new hub <ChevronRight size={14} />
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-cogni-card animate-pulse" />
                ))}
              </div>
            ) : hubs.length === 0 ? (
              <div className="cogni-card text-center py-10">
                <LayoutGrid size={40} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm mb-4">No hubs yet. Create a hub to build your knowledge graph.</p>
                <button
                  onClick={() => navigate('/hubs')}
                  className="px-4 py-2 rounded-xl bg-cogni-accent text-white text-sm font-semibold hover:bg-cogni-accent/90 transition-colors"
                >
                  Go to Hubs
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {hubs.map((hub, i) => {
                  const Icon = getIconForTopic(hub.topic)
                  const diff = (hub.difficulty_label || '').toLowerCase()
                  const diffColor = diff === 'easy' ? 'text-emerald-400' : diff === 'hard' ? 'text-amber-400' : 'text-sky-400'
                  return (
                    <motion.div
                      key={hub.id}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.05 }}
                      onClick={() => handleHubClick(hub)}
                      className="cogni-card cursor-pointer hover:border-cogni-accent/30 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-cogni-accent/20 flex items-center justify-center group-hover:bg-cogni-accent/30 transition-colors">
                            <Icon size={20} className="text-cogni-accent" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-white">{hub.topic || hub.title}</p>
                            {hub.difficulty_label && (
                              <p className={`text-[10px] font-medium uppercase tracking-wider ${diffColor}`}>
                                {hub.difficulty_label}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-white/30 group-hover:text-cogni-accent transition-colors flex-shrink-0" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Mastery</span>
                        <span className="font-semibold text-white">{hub.mastery ?? 0}%</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cogni-accent to-cogni-teal transition-all duration-500"
                          style={{ width: `${hub.mastery ?? 0}%` }}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <button
              onClick={() => navigate('/hubs')}
              className="cogni-btn-secondary inline-flex items-center gap-2"
            >
              <TrendingUp size={16} className="text-cogni-accent" />
              Open Hubs
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
