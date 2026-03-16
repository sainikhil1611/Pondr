import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/ui/Sidebar'
import { useStore } from '../store/useStore'
import { useGamification } from '../hooks/useGamification'
import {
  Search, Bell, Plus, Minus, Navigation,
  Brain, Code, Palette, Server, ChevronRight,
  Mic, MicOff, Loader2,
} from 'lucide-react'
import { useVoiceInput } from '../hooks/useVoiceInput'

const HUB_ICONS = {
  machine_learning: Brain,
  'machine learning': Brain,
  data_science: Brain,
  'data science': Brain,
  web_development: Code,
  'web development': Code,
  ui_ux: Palette,
  'ui/ux': Palette,
  backend: Server,
  default: Brain,
}

function getIconForTopic(topic) {
  const key = (topic || '').toLowerCase()
  for (const [k, Icon] of Object.entries(HUB_ICONS)) {
    if (k !== 'default' && key.includes(k)) return Icon
  }
  return HUB_ICONS.default
}

export function HubsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user, sidebarOpen, hubs, fetchHubs, searchTopic, graphLoading,
    selectHub,
  } = useStore()
  const [view, setView] = useState('network')
  const [searchInput, setSearchInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const { isRecording, isTranscribing, toggleRecording, error: voiceError } = useVoiceInput((text) =>
    setSearchInput((prev) => (prev ? prev + ' ' + text : text))
  )

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [dragHubId, setDragHubId] = useState(null)
  const [hubPositions, setHubPositions] = useState({})
  const canvasRef = useRef(null)

  useGamification()

  // Refetch hubs whenever we land on this page so list is always fresh (e.g. after creating a graph from Canvas)
  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchHubs().finally(() => setLoading(false))
  }, [user, fetchHubs, location.pathname])

  // Pre-fill search from Landing hero (after login)
  useEffect(() => {
    try {
      const q = sessionStorage.getItem('pondr_landing_search')
      if (q) {
        setSearchInput(q)
        sessionStorage.removeItem('pondr_landing_search')
      }
    } catch (_) {}
  }, [])

  const filteredHubs = searchInput.trim()
    ? hubs.filter((h) => (h.topic || h.title || '').toLowerCase().includes(searchInput.toLowerCase()))
    : hubs

  // Initialize hub positions by hub id
  useEffect(() => {
    if (filteredHubs.length === 0) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const w = rect?.width || 900
    const h = rect?.height || 600
    const defaultPositions = [
      { x: w * 0.28, y: h * 0.42 },
      { x: w * 0.62, y: h * 0.32 },
      { x: w * 0.74, y: h * 0.62 },
      { x: w * 0.42, y: h * 0.72 },
      { x: w * 0.18, y: h * 0.68 },
      { x: w * 0.52, y: h * 0.52 },
    ]
    setHubPositions((prev) => {
      const next = { ...prev }
      filteredHubs.forEach((hub, i) => {
        if (!next[hub.id]) {
          const dp = defaultPositions[i] || { x: 200 + (i * 150) % (w * 0.6), y: 150 + (i * 130) % (h * 0.5) }
          next[hub.id] = dp
        }
      })
      return next
    })
  }, [filteredHubs])

  const totalMastery = hubs.length > 0
    ? Math.round(hubs.reduce((sum, h) => sum + (h.mastery || 0), 0) / hubs.length)
    : 0

  const handleSearchSubmit = async (e) => {
    e?.preventDefault()
    const topic = searchInput.trim()
    if (!topic || searching || graphLoading) return
    setSearching(true)
    try {
      const result = await searchTopic(topic)
      if (result.hub_id) {
        selectHub(result.hub_id)
        navigate(`/canvas?hub_id=${result.hub_id}`)
      }
      setSearchInput('')
    } catch (err) {
      console.error(err)
    }
    setSearching(false)
  }

  const handleHubClick = (hubId) => {
    if (dragHubId) return
    selectHub(hubId)
    navigate(`/canvas?hub_id=${hubId}`)
  }

  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target === canvasRef.current || e.target.closest('[data-canvas-bg]')) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleCanvasMouseMove = useCallback((e) => {
    if (dragHubId) {
      setHubPositions((prev) => ({
        ...prev,
        [dragHubId]: {
          x: (e.clientX - pan.x) / zoom,
          y: (e.clientY - (canvasRef.current?.getBoundingClientRect().top || 0) - pan.y) / zoom,
        },
      }))
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
    }
  }, [dragHubId, isPanning, panStart, pan, zoom])

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false)
    setDragHubId(null)
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => Math.min(2, Math.max(0.3, z + delta)))
  }, [])

  const handleZoomIn = () => setZoom((z) => Math.min(2, z + 0.15))
  const handleZoomOut = () => setZoom((z) => Math.max(0.3, z - 0.15))
  const handleResetView = () => { setPan({ x: 0, y: 0 }); setZoom(1) }

  const difficultyLabel = (label) => {
    if (!label) return null
    const l = (label || '').toLowerCase()
    if (l === 'easy') return { text: 'Easy', color: 'text-emerald-400' }
    if (l === 'hard') return { text: 'Hard', color: 'text-amber-400' }
    return { text: 'Intermediate', color: 'text-sky-400' }
  }

  return (
    <div className="min-h-screen bg-[#060B18]">
      <Sidebar />
      <div
        className="h-screen flex flex-col transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? 224 : 72 }}
      >
        <div className="flex items-center justify-between px-8 py-4 flex-shrink-0">
          <div className="flex gap-1 p-1 rounded-xl bg-[#0B1628] border border-[#1A2744]">
            {['network', 'list'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  view === v
                    ? 'bg-cogni-accent text-white shadow-lg shadow-cogni-accent/20'
                    : 'text-[#5B7BA3] hover:text-white'
                }`}
              >
                {v === 'network' ? 'Network View' : 'List View'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex items-center bg-[#0B1628] border border-[#1A2744] rounded-xl px-4 py-2.5 gap-2 w-72">
              <Search size={14} className="text-[#3D5A80]" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search or create a hub..."
                className="bg-transparent text-sm text-white placeholder-[#3D5A80] outline-none flex-1"
              />
              {isTranscribing && (
                <Loader2 size={14} className="text-cogni-accent animate-spin flex-shrink-0" />
              )}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={searching || graphLoading}
                className={`p-1 rounded-lg transition-colors flex-shrink-0 ${isRecording ? 'text-red-400' : 'text-[#3D5A80] hover:text-cogni-accent'}`}
                title={isRecording ? 'Stop recording' : 'Voice search'}
              >
                {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
            {voiceError && (
              <span className="text-xs text-red-400 max-w-[160px] truncate" title={voiceError}>{voiceError}</span>
            )}
            <button
              type="submit"
              disabled={searching || graphLoading || isTranscribing || !searchInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-cogni-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {searching || graphLoading ? 'Creating...' : 'Go'}
            </button>
            <button type="button" className="relative w-10 h-10 rounded-full bg-[#0B1628] border border-[#1A2744] flex items-center justify-center text-[#3D5A80] hover:text-white transition-colors">
              <Bell size={16} />
            </button>
          </form>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-8 h-8 border-2 border-[#1A2744] border-t-cogni-accent rounded-full" />
            </div>
          ) : filteredHubs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <p className="text-white/50 text-center max-w-md">
                No hubs yet. Search for a topic above to create your first hub and generate a knowledge graph.
              </p>
              <form onSubmit={handleSearchSubmit} className="flex items-center bg-[#0B1628] border border-[#1A2744] rounded-xl px-5 py-3 gap-3 w-full max-w-md">
                <Search size={18} className="text-[#3D5A80]" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. Machine Learning, React..."
                  className="flex-1 bg-transparent text-white placeholder-[#3D5A80] outline-none"
                />
                {isTranscribing && (
                  <Loader2 size={18} className="text-cogni-accent animate-spin flex-shrink-0" />
                )}
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={searching || graphLoading}
                  className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isRecording ? 'text-red-400' : 'text-[#3D5A80] hover:text-cogni-accent'}`}
                  title={isRecording ? 'Stop recording' : 'Voice search'}
                >
                  {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button type="submit" disabled={searching || graphLoading} className="px-4 py-2 rounded-xl bg-cogni-accent text-white font-semibold disabled:opacity-50">
                  Create hub
                </button>
              </form>
            </div>
          ) : view === 'network' ? (
            <div
              ref={canvasRef}
              className="w-full h-full relative select-none"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onWheel={handleWheel}
              data-canvas-bg="true"
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cogni-accent/[0.03] rounded-full blur-[150px]" />
                <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px] bg-[#0E4D92]/[0.04] rounded-full blur-[120px]" />
              </div>

              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                  {filteredHubs.length > 1 && filteredHubs.slice(1).map((hub) => {
                    const corePos = hubPositions[filteredHubs[0].id]
                    const hubPos = hubPositions[hub.id]
                    if (!corePos || !hubPos) return null
                    return (
                      <line
                        key={`line-${hub.id}`}
                        x1={corePos.x} y1={corePos.y}
                        x2={hubPos.x} y2={hubPos.y}
                        stroke="rgba(30,58,95,0.25)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                    )
                  })}
                </svg>

                {filteredHubs.map((hub, i) => {
                  const isCore = i === 0
                  const baseSize = isCore ? 240 : 110 + (hub.mastery || 0) * 0.7
                  const Icon = getIconForTopic(hub.topic)
                  const label = hub.title || hub.topic || 'Hub'
                  const pos = hubPositions[hub.id] || { x: 300, y: 300 }
                  const ringCircumference = Math.PI * (baseSize - 4)
                  const ringDash = ((hub.mastery || 0) / 100) * ringCircumference
                  const diff = difficultyLabel(hub.difficulty_label)

                  return (
                    <motion.div
                      key={hub.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.15, type: 'spring', stiffness: 180, damping: 18 }}
                      className="absolute group"
                      style={{
                        left: pos.x,
                        top: pos.y,
                        transform: 'translate(-50%, -50%)',
                        cursor: dragHubId === hub.id ? 'grabbing' : 'pointer',
                        zIndex: dragHubId === hub.id ? 50 : isCore ? 10 : 5,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setDragHubId(hub.id)
                      }}
                      onClick={() => handleHubClick(hub.id)}
                    >
                      {isCore && (
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-cogni-accent text-white text-[9px] font-bold uppercase tracking-wider whitespace-nowrap shadow-lg shadow-cogni-accent/30">
                          Core Hub
                        </div>
                      )}

                      <div
                        className="rounded-full relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                        style={{ width: baseSize, height: baseSize }}
                      >
                        <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${baseSize} ${baseSize}`} style={{ width: baseSize, height: baseSize }}>
                          <circle cx={baseSize / 2} cy={baseSize / 2} r={baseSize / 2 - 2} fill="none" stroke={isCore ? 'rgba(139,92,246,0.12)' : 'rgba(30,58,95,0.4)'} strokeWidth="1.5" />
                          <circle cx={baseSize / 2} cy={baseSize / 2} r={baseSize / 2 - 2} fill="none" stroke={isCore ? '#8B5CF6' : '#0E7490'} strokeWidth="2" strokeLinecap="round" strokeDasharray={`${ringDash} ${ringCircumference}`} opacity={0.7} />
                        </svg>
                        <div className="absolute rounded-full" style={{ width: baseSize * 0.82, height: baseSize * 0.82, border: `1px solid ${isCore ? 'rgba(139,92,246,0.15)' : 'rgba(30,58,95,0.3)'}` }} />
                        <div
                          className="absolute rounded-full flex flex-col items-center justify-center z-10 relative"
                          style={{
                            width: baseSize * 0.62,
                            height: baseSize * 0.62,
                            background: isCore ? 'radial-gradient(ellipse at center, rgba(139,92,246,0.12) 0%, rgba(6,11,24,0.95) 70%)' : 'radial-gradient(ellipse at center, rgba(14,116,144,0.08) 0%, rgba(6,11,24,0.95) 70%)',
                            border: `1px solid ${isCore ? 'rgba(139,92,246,0.25)' : 'rgba(30,58,95,0.4)'}`,
                            boxShadow: isCore ? '0 0 40px rgba(139,92,246,0.1)' : 'none',
                          }}
                        >
                          <Icon size={isCore ? 26 : 16} className={isCore ? 'text-cogni-accent mb-2' : 'text-[#0E7490] mb-1'} />
                          <p className={`font-display font-bold text-center leading-tight ${isCore ? 'text-sm' : 'text-[11px]'} text-white px-1`}>
                            {label}
                            {isCore ? ' Hub' : ''}
                          </p>
                          <p className={`font-bold mt-1 ${isCore ? 'text-cogni-teal text-sm' : 'text-cogni-accent text-[10px]'}`}>
                            {hub.mastery ?? 0}%{isCore ? ' Mastery' : ''}
                          </p>
                          {diff && <p className={`text-[9px] mt-0.5 ${diff.color}`}>{diff.text}</p>}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              <div className="absolute right-6 bottom-24 flex flex-col gap-2 z-20">
                <button onClick={handleZoomIn} className="w-10 h-10 rounded-xl bg-[#0B1628]/80 border border-[#1A2744] flex items-center justify-center text-[#3D5A80] hover:text-white transition-colors">
                  <Plus size={16} />
                </button>
                <button onClick={handleZoomOut} className="w-10 h-10 rounded-xl bg-[#0B1628]/80 border border-[#1A2744] flex items-center justify-center text-[#3D5A80] hover:text-white transition-colors">
                  <Minus size={16} />
                </button>
                <button onClick={handleResetView} className="w-10 h-10 rounded-xl bg-[#0B1628]/80 border border-[#1A2744] flex items-center justify-center text-[#3D5A80] hover:text-white transition-colors">
                  <Navigation size={16} />
                </button>
              </div>
              <div className="absolute left-6 bottom-6 z-20 px-3 py-1.5 rounded-lg bg-[#0B1628]/80 border border-[#1A2744] text-[10px] text-[#3D5A80]">
                {Math.round(zoom * 100)}%
              </div>
            </div>
          ) : (
            <div className="p-8 max-w-4xl mx-auto space-y-3 overflow-auto">
              {filteredHubs.map((hub, i) => {
                const Icon = getIconForTopic(hub.topic)
                const diff = difficultyLabel(hub.difficulty_label)
                return (
                  <motion.div
                    key={hub.id}
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => handleHubClick(hub.id)}
                    className="p-5 rounded-2xl bg-[#0B1628] border border-[#1A2744] hover:border-cogni-accent/30 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-cogni-accent/10 flex items-center justify-center">
                        <Icon size={22} className="text-cogni-accent" />
                      </div>
                      <div>
                        <p className="font-display font-bold">{hub.title || hub.topic}</p>
                        {diff && <p className={`text-xs ${diff.color}`}>{diff.text}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="w-32 h-1.5 rounded-full bg-[#1A2744] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-cogni-accent to-cogni-teal" style={{ width: `${hub.mastery ?? 0}%` }} />
                      </div>
                      <span className="text-sm font-bold text-cogni-teal w-12 text-right">{hub.mastery ?? 0}%</span>
                      <ChevronRight size={16} className="text-[#3D5A80]" />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-8 py-4 border-t border-[#1A2744] flex-shrink-0 bg-[#060B18]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#0B1628] border border-[#1A2744]">
            <span className="text-xs text-[#3D5A80]">Total Mastery</span>
            <span className="text-sm font-bold text-cogni-teal">{totalMastery}%</span>
            <div className="w-16 h-1 rounded-full bg-[#1A2744] overflow-hidden">
              <div className="h-full rounded-full bg-cogni-teal" style={{ width: `${totalMastery}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
