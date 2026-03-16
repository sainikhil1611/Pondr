import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Zap, Brain, BarChart3, ArrowRight, Globe, Settings } from 'lucide-react'

const LANDING_SEARCH_KEY = 'pondr_landing_search'

const fadeUp = (delay = 0) => ({
  initial: { y: 30, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
})

export function Landing() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState('')

  const handleHeroSearch = (e) => {
    e?.preventDefault()
    if (heroSearch.trim()) {
      try {
        sessionStorage.setItem(LANDING_SEARCH_KEY, heroSearch.trim())
      } catch (_) {}
    }
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-cogni-bg text-white overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-cogni-accent/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-cogni-teal/[0.05] rounded-full blur-[100px]" />
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-[2px] h-[2px] rounded-full bg-cogni-accent/30"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [0, -40, 0], opacity: [0.1, 0.5, 0.1] }}
            transition={{ duration: 6 + Math.random() * 8, repeat: Infinity, delay: Math.random() * 4 }}
          />
        ))}
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cogni-accent to-cogni-teal flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Pondr</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Features</a>
          <a href="#methodology" className="text-sm text-white/60 hover:text-white transition-colors">Methodology</a>
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2 rounded-xl bg-cogni-accent hover:bg-cogni-accent-light text-white text-sm font-semibold transition-all hover:shadow-lg hover:shadow-cogni-accent/25"
          >
            Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center pt-24 pb-20 px-6">
        <motion.div {...fadeUp(0.1)}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cogni-accent/10 border border-cogni-accent/20 text-xs font-bold uppercase tracking-wider text-cogni-accent">
            <Zap size={12} /> Next-Gen Learning
          </span>
        </motion.div>

        <motion.h1 {...fadeUp(0.2)} className="font-display font-extrabold text-6xl md:text-7xl leading-[1.05] mt-8 max-w-3xl mx-auto">
          Master Any Skill with{' '}
          <span className="bg-gradient-to-r from-cogni-accent via-cogni-accent-light to-cogni-teal bg-clip-text text-transparent">
            Pondr
          </span>
        </motion.h1>

        <motion.p {...fadeUp(0.35)} className="text-lg text-white/50 mt-6 max-w-xl mx-auto leading-relaxed">
          Unlock your cognitive potential through our advanced neural learning
          pathways and AI-driven acceleration.
        </motion.p>

        {/* Search bar */}
        <motion.form {...fadeUp(0.45)} onSubmit={handleHeroSearch} className="mt-10 max-w-xl mx-auto">
          <div className="flex items-center bg-cogni-card border border-cogni-border rounded-2xl px-5 py-3 gap-3 shadow-xl shadow-black/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 flex-shrink-0">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={heroSearch}
              onChange={(e) => setHeroSearch(e.target.value)}
              placeholder="What do you want to master today?"
              className="flex-1 bg-transparent text-white placeholder-white/30 outline-none text-sm"
              onFocus={() => navigate('/login')}
            />
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cogni-accent hover:bg-cogni-accent-light text-white text-sm font-semibold transition-all"
            >
              Search <ArrowRight size={14} />
            </button>
          </div>
        </motion.form>

        {/* Tags */}
        <motion.div {...fadeUp(0.55)} className="flex items-center justify-center gap-6 mt-6">
          {['Neural Pathways', 'Adaptive AI', 'Spaced Recall'].map((tag) => (
            <span key={tag} className="flex items-center gap-2 text-sm text-white/40">
              <div className="w-2 h-2 rounded-full bg-cogni-teal" />
              {tag}
            </span>
          ))}
        </motion.div>
      </section>

      {/* Divider glow line */}
      <div className="relative h-px max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cogni-accent/30 to-transparent" />
      </div>

      {/* Features */}
      <section id="features" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <motion.div {...fadeUp(0)} className="mb-16">
          <h2 className="font-display font-extrabold text-4xl md:text-5xl">
            The Future of Learning
          </h2>
          <p className="text-white/50 mt-4 max-w-lg text-lg">
            Pondr utilizes cutting-edge methodology to accelerate your mastery of
            complex subjects through bio-adaptive algorithms.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: Brain,
              title: 'Adaptive Paths',
              desc: 'Dynamic curriculum that evolves based on your personal cognitive load and real-time performance.',
              color: '#8B5CF6',
            },
            {
              icon: Globe,
              title: 'Neural Recall',
              desc: 'Spaced repetition powered by deep-learning models that predict when your brain is about to forget.',
              color: '#2DD4BF',
            },
            {
              icon: BarChart3,
              title: 'Deep Analytics',
              desc: 'Visualize your knowledge graph and track cognitive growth with professional-grade data visualization.',
              color: '#06B6D4',
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.6 }}
              className="group p-6 rounded-2xl bg-cogni-card border border-cogni-border hover:border-cogni-accent/30 transition-all duration-300"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: `${feature.color}15` }}
              >
                <feature.icon size={24} style={{ color: feature.color }} />
              </div>
              <h3 className="font-display font-bold text-xl mb-3">{feature.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="methodology" className="relative z-10 py-24 px-6 text-center">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="font-display font-extrabold text-4xl md:text-5xl max-w-2xl mx-auto">
            Ready to begin your journey?
          </h2>
          <p className="text-white/50 mt-4 text-lg">
            Join over 500,000 learners mastering the future of technology and human expertise.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl bg-cogni-accent hover:bg-cogni-accent-light text-white font-bold transition-all hover:shadow-xl hover:shadow-cogni-accent/25 flex items-center gap-2"
            >
              Get Started Now <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl bg-cogni-card border border-cogni-border text-white font-bold transition-all hover:border-cogni-accent/40"
            >
              View Demo
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cogni-accent to-cogni-teal flex items-center justify-center">
              <Brain size={14} className="text-white" />
            </div>
            <span className="font-display font-bold text-sm">Pondr</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Contact Us</span>
            <span>Careers</span>
          </div>
          <div className="flex items-center gap-3 text-white/30">
            <Globe size={18} />
            <Settings size={18} />
          </div>
        </div>
        <p className="text-center text-[11px] text-white/20 mt-6">
          &copy; 2026 Pondr. All rights reserved. Powered by Neural Pathway algorithms.
        </p>
      </footer>
    </div>
  )
}
