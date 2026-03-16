const MODE_MAP = {
  teach:    { icon: '\uD83C\uDFA4', label: 'Feynman', color: '#10B981' },
  defend:   { icon: '\u2694\uFE0F', label: 'Socratic', color: '#F59E0B' },
  connect:  { icon: '\uD83D\uDD17', label: 'Connect', color: '#8B5CF6' },
  quick:    { icon: '\u23F1\uFE0F', label: 'Quick', color: '#06B6D4' },
  struggle: { icon: '\uD83D\uDD25', label: 'Struggle', color: '#EF4444' },
}

export function NodeModeIcon({ mode, size = 'sm' }) {
  const config = MODE_MAP[mode]
  if (!config) return null

  const px = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${px}`}
      style={{ background: `${config.color}20`, color: config.color }}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  )
}
