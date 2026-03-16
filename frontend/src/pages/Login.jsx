import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { api, setAuthToken, storeUser } from '../api/client'
import { Sparkles, LogIn, UserPlus, Mail, Lock, User } from 'lucide-react'
import { GoogleSignIn } from '../components/auth/GoogleSignIn'

export function Login() {
  const navigate = useNavigate()
  const setAuth = useStore((s) => s.setAuth)
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const payload = isRegister
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password }

      const res = await api.post(endpoint, payload)
      const { access_token, user } = res.data

      setAuthToken(access_token)
      storeUser(user)
      setAuth(user, access_token)

      if (user.has_onboarded) {
        navigate('/canvas')
      } else {
        navigate('/onboarding')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-cogni-bg flex items-center justify-center p-4">
      {/* Background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-cogni-accent/20"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [0, -30, 0], opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 6 + Math.random() * 6, repeat: Infinity, delay: Math.random() * 3 }}
          />
        ))}
      </div>

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cogni-accent to-cogni-teal flex items-center justify-center mb-4">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black">
            <span className="cogni-gradient-text">Pondr</span>
          </h1>
          <p className="text-white/40 mt-2">
            {isRegister ? 'Create your learning account' : 'Welcome back, learner'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="cogni-card space-y-4">
          {isRegister && (
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Full name"
                className="w-full cogni-input pl-10"
                required
              />
            </div>
          )}

          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full cogni-input pl-10"
              required
            />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full cogni-input pl-10"
              required
              minLength={6}
            />
          </div>

          {error && (
            <motion.p
              initial={{ y: -5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-sm text-cogni-danger bg-cogni-danger/10 border border-cogni-danger/20 rounded-xl px-4 py-2"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="cogni-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : isRegister ? (
              <>
                <UserPlus size={16} />
                Create Account
              </>
            ) : (
              <>
                <LogIn size={16} />
                Sign In
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <GoogleSignIn onError={(msg) => setError(msg)} />

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister)
                setError('')
              }}
              className="text-sm text-cogni-accent hover:text-cogni-accent-light transition-colors"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
