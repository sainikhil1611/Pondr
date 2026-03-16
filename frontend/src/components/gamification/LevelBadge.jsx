import { motion, AnimatePresence } from 'framer-motion'

export function LevelBadge({ level, title, showAnimation = false }) {
  return (
    <div className="relative">
      <AnimatePresence>
        {showAnimation && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.8] }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute inset-0 rounded-full bg-cogni-accent/30 blur-xl"
          />
        )}
      </AnimatePresence>
      <motion.div
        animate={showAnimation ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.6 }}
        className="relative w-16 h-16 rounded-full bg-gradient-to-br from-cogni-accent via-cogni-accent-light to-cogni-teal flex flex-col items-center justify-center shadow-lg shadow-cogni-accent/25"
      >
        <span className="text-2xl font-black text-white leading-none">{level}</span>
        <span className="text-[7px] font-bold uppercase tracking-wider text-white/80 mt-0.5">{title}</span>
      </motion.div>
    </div>
  )
}
