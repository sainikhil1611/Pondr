import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { api } from '../../api/client'
import { useTracker } from '../../hooks/useTracker'
import { X, Send, Swords } from 'lucide-react'

export function SocraticDebate() {
  const { user, activeConcept, clearLearningMode } = useStore()
  const [position, setPosition] = useState('')
  const [history, setHistory] = useState([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [round, setRound] = useState(0)
  const { logEvent } = useTracker(activeConcept?.nodeId)

  useEffect(() => {
    const startDebate = async () => {
      setLoading(true)
      try {
        const res = await api.post('/gemini/socratic', {
          node_id: activeConcept?.nodeId,
          concept: activeConcept?.concept,
        })
        setPosition(res.data.position)
        setHistory([
          { role: 'gemini', content: res.data.opening_challenge },
        ])
      } catch {
        setHistory([{ role: 'gemini', content: 'Let\'s discuss this concept. What do you think?' }])
      }
      setLoading(false)
    }
    startDebate()
  }, [])

  const handleReply = async () => {
    if (!reply.trim() || loading) return
    setLoading(true)

    const newHistory = [...history, { role: 'user', content: reply }]
    setHistory(newHistory)
    setReply('')

    try {
      const res = await api.post('/gemini/socratic/reply', {
        concept: activeConcept?.concept,
        position,
        history: newHistory,
        reply,
      })
      setHistory([...newHistory, { role: 'gemini', content: res.data.pushback }])
      setRound((r) => r + 1)

      if (res.data.misconception_caught) {
        setHistory((h) => [
          ...h,
          { role: 'system', content: `Misconception: ${res.data.misconception_detail}` },
        ])
      }

      await logEvent('socratic_round')
    } catch {
      setHistory((h) => [...h, { role: 'gemini', content: 'Interesting. Tell me more.' }])
    }
    setLoading(false)
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
        className="w-full max-w-xl mx-4 rounded-2xl bg-cogni-card border border-cogni-border overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Swords size={20} className="text-cogni-warning" />
            <div>
              <p className="cogni-label text-cogni-warning">Socratic Debate</p>
              <h3 className="text-lg font-bold">{activeConcept?.concept}</h3>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Round {round}</span>
            <button onClick={clearLearningMode} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
          {history.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-cogni-accent/20 border border-cogni-accent/30 text-white'
                    : msg.role === 'system'
                    ? 'bg-cogni-warning/10 border border-cogni-warning/20 text-cogni-warning'
                    : 'bg-white/5 border border-white/10 text-white/80'
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
                <motion.div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-2 h-2 rounded-full bg-white/40"
                    />
                  ))}
                </motion.div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 pb-5 pt-3 border-t border-white/5">
          <div className="flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder="Your response..."
              className="flex-1 cogni-input"
            />
            <button
              onClick={handleReply}
              disabled={loading || !reply.trim()}
              className="cogni-btn-primary px-4 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
