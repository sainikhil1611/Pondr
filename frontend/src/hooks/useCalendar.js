import { useState, useCallback } from 'react'
import { api } from '../api/client'

const PLAN_STORAGE_PREFIX = 'pondr_plan_'

function getWeekKey(weekStart) {
  if (!weekStart) return null
  const str = typeof weekStart === 'string' ? weekStart : weekStart.toISOString?.()
  return str ? str.slice(0, 10) : null
}

function getStoredPlan(weekKey) {
  if (!weekKey) return null
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_PREFIX + weekKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setStoredPlan(weekKey, plan) {
  if (!weekKey || !plan) return
  try {
    localStorage.setItem(PLAN_STORAGE_PREFIX + weekKey, JSON.stringify(plan))
  } catch {
    // ignore quota / private mode
  }
}

export function useCalendar() {
  const [events, setEvents] = useState([])
  const [studyPlan, setStudyPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const fetchEvents = useCallback(async (startDate, endDate) => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (startDate) params.start = startDate
      if (endDate) params.end = endDate
      const res = await api.get('/calendar/events', { params })
      setEvents(res.data.events || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load calendar events')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPlan = useCallback(async (weekStart) => {
    const weekKey = getWeekKey(weekStart)
    const cached = getStoredPlan(weekKey)
    if (cached?.sessions?.length) {
      setStudyPlan(cached)
      return
    }
    try {
      const params = weekStart ? { week_start: weekStart } : {}
      const res = await api.get('/calendar/plan', { params })
      const plan = res.data.plan
      setStudyPlan(plan)
      if (plan?.sessions?.length && weekKey) setStoredPlan(weekKey, plan)
    } catch {
      setStudyPlan(null)
    }
  }, [])

  const generateSchedule = useCallback(async (hoursPerWeek, hubIds, weekStart) => {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.post(
        '/calendar/schedule',
        {
          hours_per_week: hoursPerWeek,
          hub_ids: hubIds,
          week_start: weekStart,
        },
        { timeout: 120000 }
      )
      const plan = {
        id: res.data.plan_id,
        sessions: res.data.sessions,
        hours_per_week: hoursPerWeek,
        hub_ids: hubIds,
      }
      setStudyPlan(plan)
      const weekKey = getWeekKey(weekStart)
      if (weekKey) setStoredPlan(weekKey, plan)
      return res.data
    } catch (err) {
      const msg = err.response?.data?.detail
      const detail = Array.isArray(msg) ? msg[0]?.msg || msg[0] : msg
      setError(detail || err.message || 'Failed to generate schedule')
      return null
    } finally {
      setGenerating(false)
    }
  }, [])

  return {
    events,
    studyPlan,
    loading,
    generating,
    error,
    fetchEvents,
    fetchPlan,
    generateSchedule,
  }
}
