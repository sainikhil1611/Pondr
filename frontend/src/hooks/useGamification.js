import { useEffect } from 'react'
import { api } from '../api/client'
import { useStore } from '../store/useStore'

export function useGamification() {
  const user = useStore((s) => s.user)
  const setGamification = useStore((s) => s.setGamification)

  useEffect(() => {
    if (!user?.id) return

    const loadStats = async () => {
      try {
        const res = await api.get('/gamification/stats')
        setGamification({
          xp: res.data.xp,
          level: res.data.level,
          levelTitle: res.data.level_title,
          streakDays: res.data.streak_days,
          dailyXp: res.data.daily_xp,
          dailyXpGoal: res.data.daily_xp_goal,
          achievements: res.data.achievements,
        })
      } catch {
        // Stats unavailable
      }
    }

    const claimDaily = async () => {
      try {
        await api.post('/gamification/claim-daily')
      } catch {
        // Already claimed or unavailable
      }
    }

    loadStats()
    claimDaily()
  }, [user?.id, setGamification])
}
