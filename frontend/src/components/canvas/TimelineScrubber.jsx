import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { motion } from 'framer-motion'
import { api } from '../../api/client'

export function TimelineScrubber() {
  const { user, setTimelineDate } = useStore()
  const [value, setValue] = useState(100)
  const [history, setHistory] = useState([])
  const [dateRange, setDateRange] = useState({ start: null, end: null })

  useEffect(() => {
    if (!user) return
    api.get('/graph/history').then((res) => {
      const hist = res.data.history || []
      setHistory(hist)
      if (hist.length > 0) {
        setDateRange({
          start: new Date(hist[0].date),
          end: new Date(),
        })
      }
    }).catch(() => {})
  }, [user])

  const handleChange = (e) => {
    const v = Number(e.target.value)
    setValue(v)
    if (v >= 100 || !dateRange.start) {
      setTimelineDate(null)
    } else {
      const range = dateRange.end.getTime() - dateRange.start.getTime()
      const targetDate = new Date(dateRange.start.getTime() + (v / 100) * range)
      setTimelineDate(targetDate)
    }
  }

  const currentDate = (() => {
    if (value >= 100 || !dateRange.start) return 'LIVE'
    const range = dateRange.end.getTime() - dateRange.start.getTime()
    const d = new Date(dateRange.start.getTime() + (value / 100) * range)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })()

  const isLive = value >= 100

  return (
    <div className="flex items-center gap-4 px-5 py-3 rounded-full bg-cogni-card/90 backdrop-blur-xl border border-cogni-border shadow-lg min-w-[320px]">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Timeline</span>

      <div className="flex-1 relative">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={handleChange}
          className="w-full h-1.5 appearance-none rounded-full bg-white/10 outline-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cogni-accent
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cogni-accent/30
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div
          className="absolute top-0 left-0 h-1.5 rounded-full bg-gradient-to-r from-cogni-accent to-cogni-teal pointer-events-none"
          style={{ width: `${value}%` }}
        />
      </div>

      <div className="text-xs font-semibold min-w-[60px] text-right">
        {isLive ? (
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-cogni-success"
          >
            LIVE
          </motion.span>
        ) : (
          <span className="text-cogni-accent">{currentDate}</span>
        )}
      </div>
    </div>
  )
}
