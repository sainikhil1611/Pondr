import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

export function StreakCounter({ days }) {
  if (days === 0) return null

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cogni-warning/10 border border-cogni-warning/20"
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <Flame size={16} className="text-cogni-warning" />
      </motion.div>
      <span className="text-sm font-bold text-cogni-warning">{days}</span>
      <span className="text-xs text-cogni-warning/70">day streak</span>
    </motion.div>
  )
}
