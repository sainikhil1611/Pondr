import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Clock, BookOpen, Brain, Video, HelpCircle } from 'lucide-react'

const HOURS_START = 6
const HOURS_END = 23
const HOUR_HEIGHT = 60 // px per hour
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const ACTIVITY_ICONS = {
  review: BookOpen,
  quiz: HelpCircle,
  feynman: Brain,
  video: Video,
}

function parseTime(dateStr) {
  return new Date(dateStr)
}

function getEventPosition(startStr, endStr) {
  const start = parseTime(startStr)
  const end = parseTime(endStr)
  const startHour = start.getHours() + start.getMinutes() / 60
  const endHour = end.getHours() + end.getMinutes() / 60
  const top = (startHour - HOURS_START) * HOUR_HEIGHT
  const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 20)
  return { top, height }
}

function getDayIndex(dateStr, weekStart) {
  const date = parseTime(dateStr)
  const ws = new Date(weekStart)
  const diff = Math.floor((date - ws) / (1000 * 60 * 60 * 24))
  return Math.max(0, Math.min(6, diff))
}

function formatTime(dateStr) {
  const d = parseTime(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function WeekView({ events = [], studySessions = [], weekStart }) {
  // Don't show Google Calendar events that are our study sessions (avoid duplicate blocks)
  const studyEventIds = useMemo(
    () => new Set(studySessions.map((s) => s.google_event_id).filter(Boolean)),
    [studySessions],
  )
  const otherEvents = useMemo(
    () => events.filter((e) => !e.id || !studyEventIds.has(e.id)),
    [events, studyEventIds],
  )

  const hours = useMemo(() => {
    const h = []
    for (let i = HOURS_START; i <= HOURS_END; i++) {
      h.push(i)
    }
    return h
  }, [])

  // Build day headers with dates
  const dayHeaders = useMemo(() => {
    const ws = new Date(weekStart)
    return DAY_NAMES.map((name, i) => {
      const d = new Date(ws)
      d.setDate(d.getDate() + i)
      return {
        name,
        date: d.getDate(),
        month: d.toLocaleString('default', { month: 'short' }),
        isToday: new Date().toDateString() === d.toDateString(),
      }
    })
  }, [weekStart])

  return (
    <div className="rounded-2xl border border-white/10 bg-cogni-card overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/10">
        <div className="p-2" />
        {dayHeaders.map((day, i) => (
          <div
            key={i}
            className={`p-3 text-center border-l border-white/5 ${
              day.isToday ? 'bg-cogni-accent/10' : ''
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              {day.name}
            </p>
            <p
              className={`text-lg font-bold ${
                day.isToday ? 'text-cogni-accent' : 'text-white/70'
              }`}
            >
              {day.date}
            </p>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="relative grid grid-cols-[60px_repeat(7,1fr)] overflow-y-auto max-h-[600px]">
        {/* Hour labels + grid lines */}
        {hours.map((hour) => (
          <div key={hour} className="contents">
            <div
              className="text-[10px] text-white/30 text-right pr-2 relative"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="absolute -top-2 right-2">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </span>
            </div>
            {Array.from({ length: 7 }).map((_, dayIdx) => (
              <div
                key={dayIdx}
                className="border-l border-t border-white/5 relative"
                style={{ height: HOUR_HEIGHT }}
              />
            ))}
          </div>
        ))}

        {/* Google Calendar events (teal) - exclude study sessions we show in purple below */}
        {otherEvents.map((event, i) => {
          if (event.all_day) return null
          const dayIdx = getDayIndex(event.start, weekStart)
          const pos = getEventPosition(event.start, event.end)
          // Column offset: 60px for time labels, then each day column
          return (
            <motion.div
              key={`gcal-${i}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.02 }}
              className="absolute rounded-lg px-2 py-1 overflow-hidden border border-cogni-teal/30 bg-cogni-teal/15 backdrop-blur-sm z-10"
              style={{
                top: pos.top,
                height: pos.height,
                left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 2px)`,
                width: `calc((100% - 60px) / 7 - 4px)`,
              }}
            >
              <p className="text-[10px] font-semibold text-cogni-teal truncate">
                {event.summary}
              </p>
              {pos.height > 30 && (
                <p className="text-[9px] text-white/40 mt-0.5">
                  {formatTime(event.start)}
                </p>
              )}
            </motion.div>
          )
        })}

        {/* Study sessions (purple) */}
        {studySessions.map((session, i) => {
          const dayIdx = getDayIndex(session.start_time, weekStart)
          const pos = getEventPosition(session.start_time, session.end_time)
          const ActivityIcon = ACTIVITY_ICONS[session.activity_type] || BookOpen
          return (
            <motion.div
              key={`study-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="absolute rounded-lg px-2 py-1 overflow-hidden border border-cogni-accent/40 bg-cogni-accent/20 backdrop-blur-sm z-20 cursor-pointer hover:bg-cogni-accent/30 transition-colors group"
              style={{
                top: pos.top,
                height: pos.height,
                left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 2px)`,
                width: `calc((100% - 60px) / 7 - 4px)`,
              }}
              title={session.reason}
            >
              <div className="flex items-center gap-1">
                <ActivityIcon size={10} className="text-cogni-accent flex-shrink-0" />
                <p className="text-[10px] font-semibold text-cogni-accent truncate">
                  {session.concept}
                </p>
              </div>
              {pos.height > 30 && (
                <p className="text-[9px] text-white/40 mt-0.5">
                  {formatTime(session.start_time)} · {session.activity_type}
                </p>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
