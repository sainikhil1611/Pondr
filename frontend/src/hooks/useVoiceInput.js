import { useState, useRef, useCallback } from 'react'
import { api } from '../api/client'

/**
 * Voice input using ElevenLabs Speech-to-Text.
 * MediaRecorder captures mic audio, then POST to /api/speech/transcribe.
 *
 * @param {function} onTranscript - Callback with transcribed text
 * @returns {{ isRecording, isTranscribing, startRecording, stopRecording, toggleRecording, error }}
 */
export function useVoiceInput(onTranscript) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const sendAudioToBackend = useCallback(
    async (blob) => {
      setIsTranscribing(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')

        const res = await api.post('/speech/transcribe', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30000,
        })

        const text = res.data?.text
        if (text && onTranscript) {
          onTranscript(text)
        }
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || 'Transcription failed'
        setError(msg)
      } finally {
        setIsTranscribing(false)
      }
    },
    [onTranscript]
  )

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 48000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorderOptions = { audioBitsPerSecond: 128000 }
      if (mimeType) recorderOptions.mimeType = mimeType

      const recorder = new MediaRecorder(stream, recorderOptions)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const chunks = [...chunksRef.current]
        const blobType = mimeType || 'audio/webm'
        cleanup()
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: blobType })
          if (blob.size > 0) sendAudioToBackend(blob)
        }
      }

      recorder.onerror = () => {
        setError('Recording failed')
        setIsRecording(false)
        cleanup()
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied')
      } else {
        setError('Could not access microphone')
      }
      cleanup()
    }
  }, [cleanup, sendAudioToBackend])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    setIsRecording(false)
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    toggleRecording,
    error,
  }
}
