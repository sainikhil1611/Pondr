import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { api } from '../../api/client'
import { useTracker } from '../../hooks/useTracker'
import { X, Zap, Clock, CheckCircle } from 'lucide-react'

export function QuickSnapshot() {
  const { user, activeConcept, clearLearningMode } = useStore()
  const [challenge, setChallenge] = useState(null)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [timer, setTimer] = useState(30)
  const [loading, setLoading] = useState(true)
  const { logEvent } = useTracker(activeConcept?.nodeId)

  useEffect(() => {
    api.post('/gemini/quick-snapshot', {
      concept: activeConcept?.concept,
    }).then((res) => {
      setChallenge(res.data)
      setLoading(false)
    }).catch(() => {
      setChallenge({ question: `What is ${activeConcept?.concept}?`, ideal_answer_points: [] })
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (loading || submitted) return
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(interval)
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [loading, submitted])

  const handleSubmit = async () => {
    if (submitted) return
    setSubmitted(true)
    await logEvent('snapshot', { success: answer.trim().length > 10 })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl bg-cogni-card border border-cogni-border overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-cogni-cyan" />
            <div>
              <p className="cogni-label text-cogni-cyan">Quick Snapshot</p>
              <p className="text-sm font-bold mt-0.5">{activeConcept?.concept}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs font-mono">
              <Clock size={12} className={timer <= 10 ? 'text-cogni-danger' : 'text-white/40'} />
              <span className={timer <= 10 ? 'text-cogni-danger font-bold' : 'text-white/40'}>
                {timer}s
              </span>
            </div>
            <button onClick={clearLearningMode} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 pb-4">
          {loading ? (
            <div className="py-8 text-center text-white/40">Loading challenge...</div>
          ) : !submitted ? (
            <>
              <p className="text-white font-medium mb-4">{challenge?.question}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Quick answer..."
                rows={3}
                className="w-full cogni-input resize-none"
                autoFocus
              />
              <button
                onClick={handleSubmit}
                className="cogni-btn-primary w-full mt-3 flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} />
                Submit
              </button>
            </>
          ) : (
            <div className="space-y-3 pb-2">
              <div className="flex items-center gap-2 text-cogni-success">
                <CheckCircle size={20} />
                <span className="font-semibold">Submitted!</span>
              </div>
              {challenge?.ideal_answer_points?.length > 0 && (
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-xs font-bold uppercase tracking-wider text-cogni-accent mb-2">Key points</p>
                  <ul className="space-y-1">
                    {challenge.ideal_answer_points.map((pt, i) => (
                      <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-cogni-teal mt-0.5">-</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={clearLearningMode} className="cogni-btn-secondary w-full">
                Done
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
