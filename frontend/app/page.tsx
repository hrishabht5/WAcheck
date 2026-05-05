'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getSocket } from '../lib/socket'
import EngineSelector from '../components/EngineSelector'
import QRModal from '../components/QRModal'
import UploadZone from '../components/UploadZone'
import ProgressBar from '../components/ProgressBar'
import TerminalLog from '../components/TerminalLog'
import ExportButton from '../components/ExportButton'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || ''

type Engine = 'scraping' | 'waba'

interface LogEntry {
  id: number
  text: string
  type: 'success' | 'error' | 'info' | 'warn'
  timestamp: string
}

interface ProgressData {
  verified: number
  invalid: number
  pending: number
  total: number
  current: number
}

function nowStamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DashboardPage() {
  const [engine, setEngine] = useState<Engine>('scraping')
  const [wabaConfig, setWabaConfig] = useState({ phoneNumberId: '', accessToken: '' })
  const [showQR, setShowQR] = useState(false)
  const [scrapingReady, setScrapingReady] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [numberCount, setNumberCount] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validationDone, setValidationDone] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<ProgressData>({ verified: 0, invalid: 0, pending: 0, total: 0, current: 0 })

  const addLog = useCallback((text: string, type: LogEntry['type']) => {
    setLogs((prev) => [
      ...prev.slice(-199),
      { id: Date.now() + Math.random(), text, type, timestamp: nowStamp() },
    ])
  }, [])

  useEffect(() => {
    const socket = getSocket()

    socket.on('log', ({ text, type }: { text: string; type: LogEntry['type'] }) => {
      addLog(text, type)
    })

    socket.on('progress', (data: ProgressData) => {
      setProgress(data)
    })

    socket.on('validation_done', () => {
      setValidating(false)
      setValidationDone(true)
    })

    socket.on('client_ready', (ready: boolean) => {
      setScrapingReady(ready)
    })

    return () => {
      socket.off('log')
      socket.off('progress')
      socket.off('validation_done')
      socket.off('client_ready')
    }
  }, [addLog])

  const handleQRConnected = useCallback(() => {
    setShowQR(false)
    setScrapingReady(true)
  }, [])

  const handleDisconnect = useCallback(() => {
    const socket = getSocket()
    socket.emit('disconnect_scraping')
    setScrapingReady(false)
    addLog('Disconnecting WhatsApp session...', 'info')
  }, [addLog])

  function handleUpload(id: string, count: number) {
    setJobId(id)
    setNumberCount(count)
    setValidationDone(false)
    setProgress({ verified: 0, invalid: 0, pending: count, total: count, current: 0 })
    addLog(`CSV loaded — ${count} valid numbers extracted`, 'info')
  }

  async function startValidation() {
    if (!jobId) return
    setValidating(true)
    setValidationDone(false)
    addLog('Initiating validation sequence...', 'info')

    const socket = getSocket()

    // Credentials are already bound to the job server-side — send only job metadata
    await fetch(`${API_URL}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ jobId, engine, socketId: socket.id }),
    })
  }

  const canStart =
    !!jobId &&
    !validating &&
    (engine === 'waba'
      ? !!wabaConfig.phoneNumberId && !!wabaConfig.accessToken
      : scrapingReady)

  return (
    <div className="min-h-screen text-slate-200 px-4 py-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-6xl mx-auto mb-10 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-glow">
            <span className="text-lg">✓</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight glow-text">CheckWA</h1>
            <p className="text-xs text-slate-500 font-mono">WhatsApp Number Validator</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {engine === 'scraping' && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono ${
              scrapingReady
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-white/10 bg-white/[0.03] text-slate-500'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${scrapingReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {scrapingReady ? 'Client Connected' : 'Not Connected'}
            </div>
          )}

          {engine === 'scraping' && !scrapingReady && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowQR(true)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/40 transition-colors"
            >
              Connect WhatsApp
            </motion.button>
          )}

          {engine === 'scraping' && scrapingReady && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDisconnect}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 transition-colors"
            >
              Disconnect
            </motion.button>
          )}
        </div>
      </motion.header>

      {/* Main grid */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-5"
        >
          <EngineSelector
            engine={engine}
            onChange={(e) => { setEngine(e); setScrapingReady(false) }}
            wabaConfig={wabaConfig}
            onWabaChange={(field, value) => setWabaConfig((prev) => ({ ...prev, [field]: value }))}
          />

          <UploadZone onUpload={handleUpload} engine={engine} wabaConfig={wabaConfig} />

          {/* Job summary */}
          {jobId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-xs text-slate-500 font-mono">Job ready</p>
                <p className="text-sm font-semibold text-slate-200">{numberCount.toLocaleString()} numbers loaded</p>
              </div>
              <div className="text-xs font-mono text-slate-600 truncate max-w-[140px]">{jobId}</div>
            </motion.div>
          )}

          {/* Start button */}
          <motion.button
            onClick={startValidation}
            disabled={!canStart}
            whileHover={canStart ? { scale: 1.02 } : {}}
            whileTap={canStart ? { scale: 0.98 } : {}}
            className={`w-full rounded-xl px-6 py-4 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
              canStart
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border border-indigo-500/40 shadow-glow'
                : 'bg-white/[0.03] text-slate-600 border border-white/[0.06] cursor-not-allowed'
            }`}
          >
            {validating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <span>⚡</span>
                Start Validation
              </>
            )}
          </motion.button>

          <ExportButton jobId={jobId} disabled={!validationDone} />
        </motion.div>

        {/* Right column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-5"
        >
          <ProgressBar data={progress} />
          <TerminalLog logs={logs} />

          {/* Stats footer */}
          {validationDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card gradient-border p-5 text-center space-y-1"
            >
              <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest">Session Complete</p>
              <p className="text-2xl font-bold text-slate-100">
                {progress.verified.toLocaleString()}{' '}
                <span className="text-emerald-400">valid</span> /{' '}
                {progress.total.toLocaleString()} total
              </p>
              <p className="text-xs text-slate-500">
                {progress.total > 0 ? Math.round((progress.verified / progress.total) * 100) : 0}% success rate
              </p>
            </motion.div>
          )}
        </motion.div>
      </main>

      {showQR && <QRModal onConnected={handleQRConnected} />}
    </div>
  )
}
