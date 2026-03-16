import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { api } from '../api/client'
import {
  ArrowLeft, Sparkles, Play, Send, BookOpen, ExternalLink,
  Globe, Brain, ChevronRight, CheckCircle, Lock, Loader2,
  Volume2, VolumeX,
} from 'lucide-react'
import { useTextToSpeech } from '../hooks/useTextToSpeech'

export function ConceptPage() {
  const { nodeId } = useParams()
  const navigate = useNavigate()
  const { user } = useStore()

  const [node, setNode] = useState(null)
  const [nodeDetail, setNodeDetail] = useState(null)
  const [snippet, setSnippet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [snippetLoading, setSnippetLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const ttsExplanation = useTextToSpeech()
  const ttsExample = useTextToSpeech()

  // Load node data + AI explanation + video
  useEffect(() => {
    if (!nodeId || !user) return

    const fetchAll = async () => {
      try {
        // Get node from graph cache
        const graphRes = await api.get('/graph/canvas')
        const foundNode = (graphRes.data.nodes || []).find((n) => String(n.id) === nodeId)
        if (foundNode) setNode(foundNode)

        // Get AI explanation + prerequisites
        const detailRes = await api.get(`/graph/node/${nodeId}/detail`)
        setNodeDetail(detailRes.data)

        // Load video snippet (try multiple queries until one returns a snippet)
        if (foundNode) {
          setSnippetLoading(true)
          const queries = [
            `${foundNode.concept} tutorial explained`,
            `${foundNode.concept} for beginners`,
            foundNode.concept,
          ]
          for (const query of queries) {
            try {
              const snippetRes = await api.post('/youtube/snippet', {
                concept: foundNode.concept,
                gap_description: `Learning ${foundNode.concept}`,
                youtube_query: query,
                timestamp_hint: 'core explanation',
              })
              if (snippetRes.data.snippet) {
                setSnippet(snippetRes.data.snippet)
                break
              }
            } catch {
              // Try next query
            }
          }
          setSnippetLoading(false)
        }
      } catch (err) {
        console.error('Failed to load concept:', err)
      }
      setLoading(false)
    }

    fetchAll()
  }, [nodeId, user])

  // Chat with Gemini
  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const res = await api.post('/gemini/chat', {
        concept: node?.concept || '',
        question: msg,
        history: chatMessages.slice(-6),
      })
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.data.answer || 'Let me think about that...' },
      ])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I couldn\'t process that. Try again.' },
      ])
    }
    setChatLoading(false)
  }

  // Web resource links
  const webResources = node ? [
    { title: `${node.concept} - Wikipedia`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(node.concept).replace(/%20/g, '_')}`, icon: Globe },
    { title: `${node.concept} - Documentation`, url: `https://www.google.com/search?q=${encodeURIComponent(node.concept)}+documentation+tutorial`, icon: BookOpen },
    { title: `${node.concept} - Research`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(node.concept)}`, icon: BookOpen },
  ] : []

  if (loading) {
    return (
      <div className="min-h-screen bg-cogni-bg flex items-center justify-center">
        <div className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <Loader2 size={32} className="text-cogni-accent mx-auto" />
          </motion.div>
          <p className="text-white/40 mt-4 text-sm">Loading concept...</p>
        </div>
      </div>
    )
  }

  const concept = node?.concept || nodeDetail?.concept || 'Concept'
  const explanation = nodeDetail?.explanation
  const stateColor = node?.state === 'green' ? 'emerald' : node?.state === 'yellow' ? 'amber' : 'red'

  return (
    <div className="min-h-screen bg-cogni-bg flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-cogni-bg/80 backdrop-blur-xl flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/canvas')} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Graph</span>
          </button>
          <span className="text-white/10">|</span>
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-cogni-accent" />
            <span className="font-display font-bold text-sm">{concept}</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/assess/quiz', { state: { nodeId: node?.id, concept } })}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cogni-accent to-cogni-teal text-white text-sm font-bold hover:shadow-lg hover:shadow-cogni-accent/20 transition-all flex items-center gap-2"
        >
          <BookOpen size={14} />
          Take Quiz
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Video + Explanation */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status bar */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-${stateColor}-500/15 text-${stateColor}-400`}>
              {node?.state === 'green' ? 'Mastered' : node?.state === 'yellow' ? 'In Progress' : 'To Learn'}
            </span>
            {node?.domain && (
              <span className="text-xs text-white/30 capitalize">{node.domain.replace(/_/g, ' ')}</span>
            )}
            {nodeDetail?.all_prereqs_met === false && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 text-white/30 flex items-center gap-1">
                <Lock size={10} /> Prerequisites needed
              </span>
            )}
          </div>

          {/* Prerequisites */}
          {nodeDetail?.prerequisites?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Prerequisites</p>
              <div className="flex flex-wrap gap-2">
                {nodeDetail.prerequisites.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/learn/${p.id}`)}
                    className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors hover:opacity-80 ${
                      p.state === 'green' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {p.state === 'green' ? <CheckCircle size={12} /> : <Lock size={12} />}
                    {p.concept}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video player */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Play size={16} className="text-cogni-teal" />
              <h2 className="font-display font-bold text-cogni-teal">Video Lesson</h2>
            </div>
            {snippet ? (
              <div className="rounded-2xl overflow-hidden border border-cogni-border bg-black">
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${snippet.video_id}?start=${snippet.start_seconds || 0}`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={snippet.title || 'Video'}
                  />
                </div>
                <div className="px-4 py-3 bg-cogni-card/30">
                  <p className="text-sm font-semibold text-white/70">{snippet.title}</p>
                  {snippet.snippet_reason && (
                    <p className="text-xs text-white/40 mt-1">{snippet.snippet_reason}</p>
                  )}
                </div>
              </div>
            ) : snippetLoading ? (
              <div className="rounded-2xl border border-white/10 bg-cogni-card/20 aspect-video flex flex-col items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Loader2 size={32} className="text-cogni-teal" />
                </motion.div>
                <p className="text-white/30 text-sm mt-3">Finding the best video...</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-cogni-card/20 aspect-video flex flex-col items-center justify-center">
                <Play size={48} className="text-white/10 mb-3" />
                <p className="text-white/30 text-sm">No video found — YouTube quota may be exhausted</p>
              </div>
            )}
          </div>

          {/* AI Explanation */}
          {explanation && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-cogni-accent" />
                <h2 className="font-display font-bold text-cogni-accent">AI Explanation</h2>
                <button
                  type="button"
                  onClick={() => (ttsExplanation.isSpeaking ? ttsExplanation.stop() : ttsExplanation.speak(explanation.explanation))}
                  disabled={ttsExplanation.isLoading}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
                  title={ttsExplanation.isSpeaking ? 'Stop' : 'Listen'}
                >
                  {ttsExplanation.isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : ttsExplanation.isSpeaking ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
                  {ttsExplanation.isLoading ? 'Loading...' : ttsExplanation.isSpeaking ? 'Stop' : 'Listen'}
                </button>
              </div>
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
                  {explanation.explanation}
                </p>

                {explanation.key_points?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Key Points</p>
                    <ul className="space-y-1.5">
                      {explanation.key_points.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                          <ChevronRight size={14} className="text-cogni-teal mt-0.5 flex-shrink-0" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {explanation.real_world_example && (
                  <div className="p-4 rounded-xl bg-cogni-accent/5 border border-cogni-accent/10">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-bold text-cogni-accent uppercase tracking-wider">Real World Example</p>
                      <button
                        type="button"
                        onClick={() => (ttsExample.isSpeaking ? ttsExample.stop() : ttsExample.speak(explanation.real_world_example))}
                        disabled={ttsExample.isLoading}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-50"
                        title={ttsExample.isSpeaking ? 'Stop' : 'Listen'}
                      >
                        {ttsExample.isLoading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : ttsExample.isSpeaking ? (
                          <VolumeX size={12} />
                        ) : (
                          <Volume2 size={12} />
                        )}
                        {ttsExample.isLoading ? '...' : ttsExample.isSpeaking ? 'Stop' : 'Listen'}
                      </button>
                    </div>
                    <p className="text-sm text-white/60">{explanation.real_world_example}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resources */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-amber-400" />
              <h2 className="font-display font-bold text-amber-400">Resources</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {webResources.map((res, i) => (
                <a
                  key={i}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <res.icon size={16} className="text-white/40 flex-shrink-0" />
                    <span className="text-sm text-white/60 truncate">{res.title}</span>
                  </div>
                  <ExternalLink size={14} className="text-white/20 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>

          {/* Unlocks */}
          {nodeDetail?.dependents?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/30 mb-2">Unlocks After Mastery</p>
              <div className="flex flex-wrap gap-2">
                {nodeDetail.dependents.map((d) => (
                  <span key={d.id} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-white/40 flex items-center gap-1.5">
                    <ChevronRight size={12} />
                    {d.concept}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Chat sidebar */}
        <div className="w-96 border-l border-white/5 flex flex-col bg-cogni-card/20 flex-shrink-0">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="text-cogni-accent" />
              <div>
                <h3 className="font-display font-bold text-sm">Ask Questions</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-cogni-teal">AI Tutor</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Sparkles size={24} className="text-white/10 mx-auto mb-3" />
                <p className="text-xs text-white/30 mb-4">Ask me anything about <span className="text-white/50 font-semibold">{concept}</span></p>
                <div className="space-y-2">
                  {[
                    `What is ${concept} used for?`,
                    `Explain ${concept} with an analogy`,
                    `What are common mistakes with ${concept}?`,
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => { setChatInput(suggestion); }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`text-sm p-3.5 rounded-xl ${
                  msg.role === 'user'
                    ? 'bg-cogni-accent/15 border border-cogni-accent/20 ml-6'
                    : 'bg-white/[0.03] border border-white/10 mr-6'
                }`}
              >
                <p className="text-white/70 leading-relaxed whitespace-pre-line">{msg.content}</p>
              </motion.div>
            ))}

            {chatLoading && (
              <div className="flex gap-1.5 p-3 mr-6">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} className="w-2 h-2 rounded-full bg-white/30" />
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-white/5 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                placeholder={`Ask about ${concept}...`}
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-cogni-accent/30 transition-colors"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatLoading}
                className="w-10 h-10 rounded-xl bg-cogni-accent flex items-center justify-center text-white disabled:opacity-30 transition-opacity"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
