import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { X, Play, BookOpen, Swords, Zap } from 'lucide-react'
import { useEffect } from 'react'

const MODE_OPTIONS = [
  { mode: 'teach', label: 'Feynman', icon: BookOpen, color: '#10B981' },
  { mode: 'defend', label: 'Socratic', icon: Swords, color: '#F59E0B' },
  { mode: 'quick', label: 'Quick Quiz', icon: Zap, color: '#06B6D4' },
]

export function RecommendationCard() {
  const { activeRecommendation, clearRecommendation, setLearningMode } = useStore()
  const rec = activeRecommendation

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') clearRecommendation() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [clearRecommendation])

  if (!rec) return null

  const startSec = rec.timestamp_start || 0
  const endSec = rec.timestamp_end || startSec + 60
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) clearRecommendation() }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full max-w-2xl mx-4 rounded-2xl bg-cogni-card border border-cogni-border overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="cogni-label">Recommendation</p>
            <h3 className="text-xl font-bold mt-1">{rec.concept || 'Concept'}</h3>
          </div>
          <button
            onClick={clearRecommendation}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Reasoning */}
        <div className="px-6 pb-4">
          <p className="text-sm text-white/70 leading-relaxed">{rec.gemini_reasoning}</p>
        </div>

        {/* YouTube embed */}
        {rec.youtube_video_id && (
          <div className="px-6 pb-4">
            <p className="text-xs text-cogni-teal font-semibold mb-2">
              <Play size={12} className="inline mr-1" />
              Watch {formatTime(startSec)}-{formatTime(endSec)}: {rec.snippet_reason}
            </p>
            <div className="aspect-video rounded-xl overflow-hidden border border-white/10">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${rec.youtube_video_id}?start=${startSec}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={rec.youtube_title || 'Video snippet'}
              />
            </div>
          </div>
        )}

        {/* Practice scenario */}
        {rec.practice_scenario && (
          <div className="mx-6 mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="cogni-label-purple mb-2">Practice Scenario</p>
            <p className="text-sm text-white/80 leading-relaxed">{rec.practice_scenario}</p>
          </div>
        )}

        {/* Learning mode buttons */}
        <div className="px-6 pb-6 flex gap-3">
          {MODE_OPTIONS.map(({ mode, label, icon: Icon, color }) => (
            <button
              key={mode}
              onClick={() => {
                setLearningMode(mode, { concept: rec.concept, nodeId: rec.node_id })
                clearRecommendation()
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: `${color}20`,
                border: `1px solid ${color}40`,
                color,
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
