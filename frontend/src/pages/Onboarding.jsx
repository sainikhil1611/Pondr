import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { api, storeUser } from '../api/client'
import { ArrowRight, Brain, BookOpen, Sparkles, Mic, MicOff, Loader2 } from 'lucide-react'
import { useVoiceInput } from '../hooks/useVoiceInput'

export function Onboarding() {
  const navigate = useNavigate()
  const { user, setUser, invalidateGraph } = useStore()
  const [priorHistory, setPriorHistory] = useState('')
  const [loading, setLoading] = useState(false)

  const { isRecording, isTranscribing, toggleRecording, error: voiceError } = useVoiceInput(
    (text) => setPriorHistory((prev) => (prev ? prev + ' ' + text : text))
  )

  const goToCanvas = () => {
    navigate('/canvas', { replace: true })
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const res = await api.post('/users/onboard', {
        prior_history: priorHistory.trim() || undefined,
        learner_type: 'gradual',
      })
      const payload = res.data?.user || res.data
      const updatedUser = { ...user, ...payload, has_onboarded: true }
      storeUser(updatedUser)
      setUser(updatedUser)
      invalidateGraph()
    } catch (err) {
      console.error('Onboarding failed:', err)
      const detail = err.response?.data?.detail
      const alreadyOnboarded = typeof detail === 'string' && detail.toLowerCase().includes('already onboarded')
      if (alreadyOnboarded && user) {
        storeUser({ ...user, has_onboarded: true })
        setUser({ ...user, has_onboarded: true })
        invalidateGraph()
      }
      // On any error (network, 401, etc.) still go to canvas so user isn't stuck
    } finally {
      setLoading(false)
      setTimeout(goToCanvas, 0)
    }
  }

  const handleSkip = () => {
    if (loading) return
    setLoading(true)
    api.post('/users/onboard', { prior_history: undefined, learner_type: 'gradual' })
      .then((res) => {
        const payload = res.data?.user || res.data
        const updatedUser = { ...user, ...payload, has_onboarded: true }
        storeUser(updatedUser)
        setUser(updatedUser)
        invalidateGraph()
      })
      .catch((err) => {
        console.error('Onboarding skip failed:', err)
        const detail = err.response?.data?.detail
        const alreadyOnboarded = typeof detail === 'string' && detail.toLowerCase().includes('already onboarded')
        if (alreadyOnboarded && user) {
          storeUser({ ...user, has_onboarded: true })
          setUser({ ...user, has_onboarded: true })
          invalidateGraph()
        }
      })
      .finally(() => {
        setLoading(false)
        setTimeout(goToCanvas, 0)
      })
  }

  return (
    <div className="min-h-screen bg-cogni-bg flex flex-col">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cogni-accent/[0.06] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cogni-accent to-cogni-teal flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Pondr</span>
        </div>
        <button
          onClick={handleSkip}
          disabled={loading}
          className="text-sm text-white/40 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 pt-8 pb-12 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full"
        >
          <h1 className="font-display font-extrabold text-4xl md:text-5xl text-center">
            What have you learned{' '}
            <span className="bg-gradient-to-r from-cogni-accent to-cogni-teal bg-clip-text text-transparent">
              so far
            </span>
            ?
          </h1>
          <p className="text-center text-white/40 mt-3 text-lg">
            Tell us about your learning history — courses, projects, topics you know. We’ll use this to personalize your knowledge graphs and show you what’s easy or challenging.
          </p>

          <form onSubmit={handleSubmit} className="mt-10">
            <label className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-2">
              <BookOpen size={12} className="text-cogni-teal" /> Your learning history (optional)
            </label>
            <div className="relative mt-2">
              <textarea
                value={priorHistory}
                onChange={(e) => setPriorHistory(e.target.value)}
                placeholder="e.g. Completed CS50, built a few React apps, know Python and basic stats..."
                rows={5}
                className="w-full cogni-input resize-none pr-14"
              />
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing}
                className={`absolute right-3 top-3 p-2 rounded-lg transition-all ${
                  isRecording
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                    : isTranscribing
                      ? 'bg-cogni-accent/10 text-cogni-accent/50 cursor-wait'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                }`}
                title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
              >
                {isTranscribing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : isRecording ? (
                  <MicOff size={18} />
                ) : (
                  <Mic size={18} />
                )}
              </button>
            </div>
            {voiceError && (
              <p className="text-red-400 text-xs mt-1">{voiceError}</p>
            )}

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="cogni-btn-secondary flex-1 py-3.5 disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={(e) => {
                  e.preventDefault()
                  handleSubmit(e)
                }}
                className="cogni-btn-primary flex-1 py-3.5 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <Sparkles size={16} />
                    Continue to Pondr
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>

        <p className="text-[11px] text-white/20 mt-auto pt-12">
          &copy; 2026 Pondr. Powered by your curiosity.
        </p>
      </div>
    </div>
  )
}
