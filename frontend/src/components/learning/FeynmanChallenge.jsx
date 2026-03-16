import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { api } from '../../api/client'
import { useTracker } from '../../hooks/useTracker'
import { X, Send, CheckCircle, AlertTriangle } from 'lucide-react'

export function FeynmanChallenge() {
  const { user, activeConcept, clearLearningMode } = useStore()
  const [explanation, setExplanation] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const { logEvent } = useTracker(activeConcept?.nodeId)

  const handleSubmit = async () => {
    if (!explanation.trim() || loading) return
    setLoading(true)
    try {
      const res = await api.post('/gemini/feynman', {
        node_id: activeConcept?.nodeId,
        concept: activeConcept?.concept,
        explanation: explanation,
      })
      setResult(res.data)
      await logEvent('feynman', {
        success: res.data.score >= 0.7,
        confidence_after: res.data.score,
      })
    } catch {
      setResult({ error: true })
    }
    setLoading(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-xl mx-4 rounded-2xl bg-cogni-card border border-cogni-border overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="cogni-label text-cogni-success">Feynman Challenge</p>
            <h3 className="text-lg font-bold mt-1">
              Explain: <span className="cogni-gradient-text">{activeConcept?.concept}</span>
            </h3>
          </div>
          <button onClick={clearLearningMode} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-2">
          <p className="text-sm text-white/50">
            Explain this concept as if teaching someone with no background. Gemini will identify any gaps.
          </p>
        </div>

        {!result ? (
          <div className="px-6 pb-6">
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Type your explanation here..."
              rows={6}
              className="w-full cogni-input resize-none mt-3"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !explanation.trim()}
              className="cogni-btn-primary mt-3 w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <>
                  <Send size={16} />
                  Submit Explanation
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">
            {/* Score */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
              {result.score >= 0.7 ? (
                <CheckCircle size={24} className="text-cogni-success" />
              ) : (
                <AlertTriangle size={24} className="text-cogni-warning" />
              )}
              <div>
                <p className="font-bold">Score: {Math.round((result.score || 0) * 100)}%</p>
                <p className="text-xs text-white/50">
                  {result.score >= 0.7 ? 'Great understanding!' : 'Some gaps detected'}
                </p>
              </div>
            </div>

            {result.correct_parts && (
              <div className="p-4 rounded-xl bg-cogni-success/10 border border-cogni-success/20">
                <p className="text-xs font-bold uppercase tracking-wider text-cogni-success mb-1">What you got right</p>
                <p className="text-sm text-white/80">{result.correct_parts}</p>
              </div>
            )}

            {result.gap_identified && (
              <div className="p-4 rounded-xl bg-cogni-warning/10 border border-cogni-warning/20">
                <p className="text-xs font-bold uppercase tracking-wider text-cogni-warning mb-1">Gap identified</p>
                <p className="text-sm text-white/80">{result.gap_identified}</p>
              </div>
            )}

            {result.gap_fill && (
              <div className="p-4 rounded-xl bg-cogni-accent/10 border border-cogni-accent/20">
                <p className="text-xs font-bold uppercase tracking-wider text-cogni-accent mb-1">Fill the gap</p>
                <p className="text-sm text-white/80">{result.gap_fill}</p>
              </div>
            )}

            <button onClick={clearLearningMode} className="cogni-btn-secondary w-full">
              Done
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
