import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { X, Play } from 'lucide-react'

export function VideoSnippet() {
  const { activeRecommendation, clearLearningMode } = useStore()
  const rec = activeRecommendation

  if (!rec?.youtube_video_id) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div className="w-full max-w-md mx-4 p-8 rounded-2xl bg-cogni-card border border-cogni-border text-center">
          <p className="text-white/60">No snippet available</p>
          <button onClick={clearLearningMode} className="cogni-btn-secondary mt-4">Close</button>
        </div>
      </motion.div>
    )
  }

  const startSec = rec.timestamp_start || 0
  const endSec = rec.timestamp_end || startSec + 60
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        className="w-full max-w-2xl mx-4 rounded-2xl bg-cogni-card border border-cogni-border overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <Play size={20} className="text-cogni-danger" />
            <div>
              <p className="cogni-label">Video Snippet</p>
              <p className="text-sm font-bold mt-0.5">{rec.youtube_title}</p>
            </div>
          </div>
          <button onClick={clearLearningMode} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-2">
          <p className="text-xs text-cogni-teal font-semibold">
            Watch {formatTime(startSec)} - {formatTime(endSec)}: {rec.snippet_reason}
          </p>
        </div>

        <div className="px-6 pb-6">
          <div className="aspect-video rounded-xl overflow-hidden border border-white/10">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${rec.youtube_video_id}?start=${startSec}&autoplay=1`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video snippet"
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
