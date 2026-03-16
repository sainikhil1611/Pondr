import { useCallback, useRef } from 'react'
import { api } from '../api/client'
import { useStore } from '../store/useStore'

export function useTracker(nodeId) {
  const user = useStore((s) => s.user)
  const addXp = useStore((s) => s.addXp)
  const startTime = useRef(Date.now())

  const logEvent = useCallback(
    async (eventType, extra = {}) => {
      if (!user?.id || !nodeId) return
      const duration = Math.round((Date.now() - startTime.current) / 1000)
      try {
        const res = await api.post('/graph/event', {
          node_id: nodeId,
          event_type: eventType,
          duration_seconds: duration,
          source: 'inapp',
          ...extra,
        })
        if (res.data.xp?.xp_gained) {
          addXp(res.data.xp.xp_gained, eventType)
        }
      } catch (err) {
        console.error('Failed to log event:', err)
      }
      startTime.current = Date.now()
    },
    [user, nodeId, addXp]
  )

  return { logEvent }
}
