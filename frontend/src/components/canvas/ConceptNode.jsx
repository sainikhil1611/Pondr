import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'

const STATE_CONFIG = {
  red:    { bg: 'linear-gradient(135deg, #EF4444, #DC2626)', ring: '#EF4444', glow: 'rgba(239,68,68,0.35)' },
  yellow: { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', ring: '#F59E0B', glow: 'rgba(245,158,11,0.35)' },
  green:  { bg: 'linear-gradient(135deg, #10B981, #059669)', ring: '#10B981', glow: 'rgba(16,185,129,0.35)' },
  fading: { bg: 'linear-gradient(135deg, #6B7280, #4B5563)', ring: '#6B7280', glow: 'rgba(107,114,128,0.5)' },
  glow:   { bg: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', ring: '#8B5CF6', glow: 'rgba(139,92,246,0.6)' },
}

const MODE_ICONS = {
  teach: '\uD83C\uDFA4',
  defend: '\u2694\uFE0F',
  connect: '\uD83D\uDD17',
  quick: '\u23F1\uFE0F',
  struggle: '\uD83D\uDD25',
}

/** Difficulty label: prefer API difficulty_label, else derive from state (green=easy, yellow=intermediate, red=hard) */
function getDifficulty(data) {
  const raw = (data.difficulty_label || '').toLowerCase()
  if (raw === 'easy') return { label: 'Easy', color: '#10B981' }
  if (raw === 'intermediate') return { label: 'Intermediate', color: '#F59E0B' }
  if (raw === 'hard') return { label: 'Hard', color: '#EF4444' }
  const state = data.state
  if (state === 'green') return { label: 'Easy', color: '#10B981' }
  if (state === 'yellow') return { label: 'Intermediate', color: '#F59E0B' }
  return { label: 'Hard', color: '#EF4444' }
}

export const ConceptNode = memo(({ data, selected }) => {
  const { setLearningMode, setActiveRecommendation } = useStore()
  const config = STATE_CONFIG[data.state] || STATE_CONFIG.red
  const isFading = data.state === 'fading'
  const isGlow = data.state === 'glow'
  const size = 80 + (data.importance || 0) * 25
  const difficulty = getDifficulty(data)

  const handleClick = () => {
    if (data.recommendation) {
      setActiveRecommendation(data.recommendation)
    }
    if (data.mode) {
      setLearningMode(data.mode, data)
    }
  }

  return (
    <motion.div
      onClick={handleClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      style={{ position: 'relative', cursor: 'pointer', userSelect: 'none' }}
    >
      {(isFading || isGlow) && (
        <motion.div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            background: config.glow,
            filter: 'blur(12px)',
          }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: isFading ? 2.5 : 1.2, repeat: Infinity }}
        />
      )}

      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: config.bg,
          border: `2px solid ${selected ? '#fff' : 'rgba(255,255,255,0.15)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          boxShadow: selected
            ? `0 0 0 3px ${config.ring}, 0 0 24px ${config.glow}`
            : `0 4px 20px ${config.glow}`,
          position: 'relative',
        }}
      >
        {difficulty && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 7,
              color: difficulty.color,
              fontWeight: 700,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {difficulty.label}
          </span>
        )}
        <span
          style={{
            fontSize: size < 90 ? 9 : 11,
            color: 'white',
            textAlign: 'center',
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: size - 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: difficulty ? 8 : 0,
          }}
        >
          {data.concept}
        </span>
        {data.retention != null && (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
            {Math.round(data.retention * 100)}%
          </span>
        )}

        {data.state === 'fading' && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 8,
              background: 'rgba(107,114,128,0.9)',
              color: 'white',
              padding: '1px 6px',
              borderRadius: 8,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Fading
          </div>
        )}
      </div>

      {data.mode && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            fontSize: 14,
            background: '#0D1B2A',
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {MODE_ICONS[data.mode] || '\u2022'}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    </motion.div>
  )
})
