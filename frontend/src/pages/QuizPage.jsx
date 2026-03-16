import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { api } from '../api/client'
import {
  Brain, ChevronRight, CheckCircle, XCircle,
  ArrowLeft, RotateCcw, Sparkles, Trophy, Unlock, BookOpen,
} from 'lucide-react'

function QuestionCard({ question, index, total, onAnswer, answered, selectedAnswer }) {
  const isMultipleChoice = question.type === 'multiple_choice' || question.type === 'code_trace'
  const isTrueFalse = question.type === 'true_false'

  const correct = answered && String(selectedAnswer).toLowerCase() === String(question.correct_answer).toLowerCase()
  const showResult = answered

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0 }}
      className="cogni-card max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-cogni-accent bg-cogni-accent/10 px-2.5 py-1 rounded-lg">
            {index + 1} / {total}
          </span>
          <span className="text-xs text-white/30 uppercase tracking-wider">{question.type.replace('_', ' ')}</span>
        </div>
        <span className="text-xs text-white/30">{question.difficulty}</span>
      </div>

      {question.code_snippet && (
        <pre className="bg-black/40 border border-white/10 rounded-xl p-4 mb-4 text-sm font-mono text-cogni-teal overflow-x-auto">
          {question.code_snippet}
        </pre>
      )}

      <p className="text-lg font-semibold mb-6 leading-relaxed">{question.question}</p>

      {isMultipleChoice && (
        <div className="space-y-2.5">
          {question.options.map((opt, i) => {
            const letter = opt.charAt(0)
            const isSelected = selectedAnswer === letter
            const isCorrectOpt = letter === question.correct_answer
            let borderClass = 'border-white/10 hover:border-white/30'
            if (showResult && isCorrectOpt) borderClass = 'border-emerald-500/60 bg-emerald-500/10'
            else if (showResult && isSelected && !correct) borderClass = 'border-red-500/60 bg-red-500/10'
            else if (isSelected && !showResult) borderClass = 'border-cogni-accent bg-cogni-accent/10'

            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => onAnswer(letter)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${borderClass} ${answered ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  isSelected ? 'bg-cogni-accent text-white' : 'bg-white/5 text-white/40'
                }`}>
                  {letter}
                </span>
                <span className="text-sm">{opt.slice(3)}</span>
                {showResult && isCorrectOpt && <CheckCircle size={18} className="ml-auto text-emerald-400" />}
                {showResult && isSelected && !correct && <XCircle size={18} className="ml-auto text-red-400" />}
              </button>
            )
          })}
        </div>
      )}

      {isTrueFalse && (
        <div className="flex gap-3">
          {['true', 'false'].map((val) => {
            const isSelected = selectedAnswer === val
            const isCorrectOpt = val === question.correct_answer
            let cls = 'border-white/10 hover:border-white/30'
            if (showResult && isCorrectOpt) cls = 'border-emerald-500/60 bg-emerald-500/10'
            else if (showResult && isSelected && !correct) cls = 'border-red-500/60 bg-red-500/10'
            else if (isSelected && !showResult) cls = 'border-cogni-accent bg-cogni-accent/10'

            return (
              <button
                key={val}
                disabled={answered}
                onClick={() => onAnswer(val)}
                className={`flex-1 p-4 rounded-xl border text-center font-semibold transition-all ${cls} ${answered ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {val === 'true' ? 'True' : 'False'}
              </button>
            )
          })}
        </div>
      )}

      {showResult && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`mt-5 p-4 rounded-xl border ${correct ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}
        >
          <p className={`text-sm font-semibold mb-1 ${correct ? 'text-emerald-400' : 'text-red-400'}`}>
            {correct ? 'Correct!' : 'Not quite.'}
          </p>
          <p className="text-sm text-white/60">{question.explanation}</p>
        </motion.div>
      )}
    </motion.div>
  )
}

export function QuizPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { invalidateGraph } = useStore()
  const [loading, setLoading] = useState(true)
  const [quiz, setQuiz] = useState(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [startTime] = useState(Date.now())
  const [finished, setFinished] = useState(false)
  const [results, setResults] = useState(null)

  const nodeId = location.state?.nodeId
  const concept = location.state?.concept

  useEffect(() => {
    if (!nodeId) {
      api.post('/assess/quiz/generate', { difficulty: 'mixed' })
        .then((res) => { setQuiz(res.data); setLoading(false) })
        .catch(() => setLoading(false))
      return
    }

    api.post('/assess/quiz/node', { node_id: nodeId })
      .then((res) => { setQuiz(res.data); setLoading(false) })
      .catch((err) => {
        console.error('Failed to generate quiz:', err)
        setLoading(false)
      })
  }, [nodeId])

  const handleAnswer = useCallback((answer) => {
    if (!quiz) return
    const q = quiz.questions[currentQ]
    const isCorrect = String(answer).toLowerCase() === String(q.correct_answer).toLowerCase()
    setAnswers((prev) => ({ ...prev, [currentQ]: { answer, correct: isCorrect } }))
  }, [quiz, currentQ])

  const nextQuestion = () => {
    if (currentQ < quiz.questions.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      finishQuiz()
    }
  }

  const finishQuiz = async () => {
    const correctCount = Object.values(answers).filter((a) => a.correct).length
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const concepts = [...new Set(quiz.questions.map((q) => q.concept))]

    try {
      const res = await api.post('/assess/quiz/complete', {
        total_questions: quiz.questions.length,
        correct_answers: correctCount,
        time_seconds: elapsed,
        concepts_tested: concepts,
      })
      setResults(res.data)
      if (res.data.passed) {
        invalidateGraph()
      }
    } catch {
      const scorePct = Math.round((correctCount / quiz.questions.length) * 100)
      setResults({
        score_pct: scorePct,
        correct: correctCount,
        total: quiz.questions.length,
        passed: scorePct >= 80,
        nodes_unlocked: [],
        review_recommendations: [],
      })
    }
    setFinished(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cogni-bg flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Brain size={48} className="mx-auto text-cogni-accent" />
          </motion.div>
          <p className="mt-4 text-white/50 font-semibold">
            {concept ? `Generating quiz for ${concept}...` : 'Crafting your personalized quiz...'}
          </p>
          <p className="text-xs text-white/25 mt-1">Powered by Gemini AI</p>
        </motion.div>
      </div>
    )
  }

  if (!quiz || !quiz.questions?.length) {
    return (
      <div className="min-h-screen bg-cogni-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50">Could not generate quiz. Please try again.</p>
          <button onClick={() => navigate('/canvas')} className="cogni-btn-primary mt-4">Back to Graph</button>
        </div>
      </div>
    )
  }

  if (finished && results) {
    const scorePct = results.score_pct || 0
    const passed = results.passed
    const gradeColor = passed ? '#10B981' : '#EF4444'
    const recommendations = results.review_recommendations || []

    return (
      <div className="min-h-screen bg-cogni-bg p-8">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-2xl mx-auto text-center">
          {/* Score circle */}
          <div className="relative w-36 h-36 mx-auto mb-6">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <motion.circle
                cx="60" cy="60" r="52" fill="none"
                stroke={gradeColor} strokeWidth="8" strokeLinecap="round"
                initial={{ strokeDasharray: '0 326.7' }}
                animate={{ strokeDasharray: `${(scorePct / 100) * 326.7} 326.7` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black" style={{ color: gradeColor }}>{scorePct}%</span>
              <span className="text-xs text-white/40">{results.correct}/{results.total}</span>
            </div>
          </div>

          <h1 className="text-2xl font-black mb-2">
            {passed ? 'Quiz Passed!' : 'Not Yet — Keep Learning'}
          </h1>
          {concept && <p className="text-white/60 font-semibold mb-2">{concept}</p>}
          <p className="text-white/40 mb-6">
            {passed
              ? 'You scored 80% or higher. This concept is now mastered!'
              : `You need 80% (4/5) to pass. You got ${results.correct}/${results.total}.`}
          </p>

          {/* Unlocked nodes on pass */}
          {passed && results.nodes_unlocked?.length > 0 && (
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cogni-teal/10 border border-cogni-teal/20">
                <Unlock size={16} className="text-cogni-teal" />
                <span className="text-sm text-cogni-teal font-semibold">
                  Unlocked: {results.nodes_unlocked.map(n => n.concept).join(', ')}
                </span>
              </div>
            </motion.div>
          )}

          {/* Recommendations on failure */}
          {!passed && recommendations.length > 0 && (
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mb-6 text-left max-w-lg mx-auto"
            >
              <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={16} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-400">Recommended Review</h3>
                </div>
                <p className="text-xs text-white/40 mb-3">
                  Review these concepts before retrying the quiz:
                </p>
                <div className="space-y-2">
                  {recommendations.map((rec, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/learn/${rec.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          rec.state === 'green' ? 'bg-emerald-500' :
                          rec.state === 'yellow' ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <p className="text-sm font-semibold text-white/70">{rec.concept}</p>
                          <p className="text-[10px] text-white/30">{rec.reason}</p>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-white/20" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex justify-center gap-3">
            <button onClick={() => navigate('/canvas')} className="cogni-btn-secondary flex items-center gap-2">
              <ArrowLeft size={16} /> Back to Graph
            </button>
            {!passed && (
              <button onClick={() => window.location.reload()} className="cogni-btn-primary flex items-center gap-2">
                <RotateCcw size={16} /> Retry Quiz
              </button>
            )}
            {!passed && nodeId && (
              <button
                onClick={() => navigate(`/learn/${nodeId}`)}
                className="px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 font-semibold text-sm hover:bg-amber-500/30 transition-colors flex items-center gap-2"
              >
                <BookOpen size={16} /> Review Concept
              </button>
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  const currentQuestion = quiz.questions[currentQ]
  const isAnswered = answers[currentQ] !== undefined
  const progressPct = ((currentQ + (isAnswered ? 1 : 0)) / quiz.questions.length) * 100

  return (
    <div className="min-h-screen bg-cogni-bg p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-white/30 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-bold">{quiz.quiz_title}</h1>
              <p className="text-xs text-white/30">{quiz.total_questions} questions &middot; 80% to pass</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Sparkles size={14} className="text-cogni-accent" />
            Gemini AI
          </div>
        </div>

        <div className="h-1.5 bg-white/5 rounded-full mb-8 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cogni-accent to-cogni-teal"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <QuestionCard
            key={currentQ}
            question={currentQuestion}
            index={currentQ}
            total={quiz.questions.length}
            onAnswer={handleAnswer}
            answered={isAnswered}
            selectedAnswer={answers[currentQ]?.answer}
          />
        </AnimatePresence>

        {isAnswered && (
          <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex justify-center mt-6">
            <button onClick={nextQuestion} className="cogni-btn-primary flex items-center gap-2">
              {currentQ < quiz.questions.length - 1 ? (
                <>Next Question <ChevronRight size={16} /></>
              ) : (
                <>Finish Quiz <Trophy size={16} /></>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
