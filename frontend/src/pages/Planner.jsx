import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sidebar } from '../components/ui/Sidebar'
import { useStore } from '../store/useStore'
import { useCalendar } from '../hooks/useCalendar'
import { WeekView } from '../components/calendar/WeekView'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Clock,
  Target,
  AlertCircle,
} from 'lucide-react'

const TIME_OPTIONS = [
  { label: '1 hour / week', value: 1 },
  { label: '2 hours / week', value: 2 },
  { label: '3 hours / week', value: 3 },
  { label: '5 hours / week', value: 5 },
  { label: '10 hours / week', value: 10 },
]

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(weekStart) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`
}

export function PlannerPage() {
  const { user, sidebarOpen, hubs, fetchHubs } = useStore()
  const {
    events,
    studyPlan,
    loading,
    generating,
    error,
    fetchEvents,
    fetchPlan,
    generateSchedule,
  } = useCalendar()

  const [weekOffset, setWeekOffset] = useState(0)
  const [hoursPerWeek, setHoursPerWeek] = useState(2)
  const [selectedHubIds, setSelectedHubIds] = useState([])

  const weekStart = useMemo(() => {
    const ws = getWeekStart()
    ws.setDate(ws.getDate() + weekOffset * 7)
    return ws
  }, [weekOffset])

  const weekEnd = useMemo(() => {
    const we = new Date(weekStart)
    we.setDate(we.getDate() + 7)
    return we
  }, [weekStart])

  const calendarConnected = user?.google_calendar_connected

  // Fetch hubs on mount
  useEffect(() => {
    if (user) fetchHubs()
  }, [user, fetchHubs])

  // Fetch events + plan when week changes
  useEffect(() => {
    if (!user || !calendarConnected) return
    fetchEvents(weekStart.toISOString(), weekEnd.toISOString())
    fetchPlan(weekStart.toISOString())
  }, [user, calendarConnected, weekStart, weekEnd, fetchEvents, fetchPlan])

  const handleGenerate = async () => {
    const hubIds = selectedHubIds.length > 0 ? selectedHubIds : hubs.map((h) => h.id)
    const result = await generateSchedule(hoursPerWeek, hubIds, weekStart.toISOString())
    // generateSchedule already sets studyPlan from the response; don't call fetchPlan or it overwrites with Google (empty until step 2)
    if (result && calendarConnected) {
      await fetchEvents(weekStart.toISOString(), weekEnd.toISOString())
    }
  }

  const toggleHub = (hubId) => {
    setSelectedHubIds((prev) =>
      prev.includes(hubId) ? prev.filter((id) => id !== hubId) : [...prev, hubId],
    )
  }

  const sessions = studyPlan?.sessions || []

  return (
    <div className="min-h-screen bg-cogni-bg">
      <Sidebar />
      <div
        className="transition-all duration-300 p-8"
        style={{ marginLeft: sidebarOpen ? 224 : 72 }}
      >
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cogni-accent/20 flex items-center justify-center">
                <CalendarDays size={20} className="text-cogni-accent" />
              </div>
              <h1 className="font-display text-2xl font-extrabold">
                <span className="cogni-gradient-text">Study Planner</span>
              </h1>
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-white/70 min-w-[180px] text-center">
                {formatWeekRange(weekStart)}
              </span>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-xs text-cogni-accent hover:text-cogni-accent-light transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </motion.div>

          {!calendarConnected ? (
            /* Calendar not connected CTA */
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="cogni-card text-center py-16"
            >
              <CalendarDays size={48} className="text-white/20 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Connect Google Calendar</h2>
              <p className="text-white/40 text-sm max-w-md mx-auto mb-6">
                Sign in with Google to see your schedule and auto-plan study sessions around your existing commitments.
              </p>
              <button
                onClick={() => (window.location.href = '/login')}
                className="cogni-btn-primary inline-flex items-center gap-2"
              >
                <Sparkles size={16} />
                Sign in with Google
              </button>
            </motion.div>
          ) : (
            <>
              {/* Goal settings bar */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="cogni-card mb-6"
              >
                <div className="flex flex-wrap items-end gap-6">
                  {/* Time commitment */}
                  <div className="flex-shrink-0">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-cogni-teal mb-2 flex items-center gap-1.5">
                      <Clock size={12} />
                      Time Commitment
                    </label>
                    <select
                      value={hoursPerWeek}
                      onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                      className="cogni-input bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-w-[180px]"
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-cogni-bg">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Hub selection */}
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-cogni-teal mb-2 flex items-center gap-1.5">
                      <Target size={12} />
                      Include Hubs {selectedHubIds.length > 0 && `(${selectedHubIds.length})`}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {hubs.length === 0 ? (
                        <p className="text-xs text-white/30">No hubs yet. Create one first.</p>
                      ) : (
                        hubs.map((hub) => {
                          const selected =
                            selectedHubIds.length === 0 || selectedHubIds.includes(hub.id)
                          return (
                            <button
                              key={hub.id}
                              onClick={() => toggleHub(hub.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                selected
                                  ? 'bg-cogni-accent/20 text-cogni-accent border border-cogni-accent/30'
                                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                              }`}
                            >
                              {hub.topic || hub.title}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={handleGenerate}
                    disabled={generating || hubs.length === 0}
                    className="cogni-btn-primary flex items-center gap-2 flex-shrink-0 disabled:opacity-40"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Schedule
                      </>
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ y: -5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl bg-cogni-danger/10 border border-cogni-danger/20 text-sm text-cogni-danger"
                >
                  <AlertCircle size={16} />
                  {error}
                </motion.div>
              )}

              {/* Calendar view */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {loading ? (
                  <div className="cogni-card flex items-center justify-center py-20">
                    <Loader2 size={24} className="animate-spin text-cogni-accent" />
                    <span className="ml-3 text-white/40">Loading calendar...</span>
                  </div>
                ) : (
                  <WeekView
                    events={events}
                    studySessions={sessions}
                    weekStart={weekStart.toISOString()}
                  />
                )}
              </motion.div>

              {/* Session summary */}
              {sessions.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mt-6 cogni-card"
                >
                  <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3">
                    Scheduled Sessions ({sessions.length})
                  </h3>
                  <div className="space-y-2">
                    {sessions.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-cogni-accent" />
                          <span className="text-sm font-medium text-white">{s.concept}</span>
                          <span className="text-[10px] uppercase tracking-wider text-cogni-accent/70 bg-cogni-accent/10 px-2 py-0.5 rounded">
                            {s.activity_type}
                          </span>
                        </div>
                        <div className="text-xs text-white/40">
                          {new Date(s.start_time).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          {new Date(s.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
