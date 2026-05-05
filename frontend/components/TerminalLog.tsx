'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LogEntry {
  id: number
  text: string
  type: 'success' | 'error' | 'info' | 'warn'
  timestamp: string
}

interface Props {
  logs: LogEntry[]
}

export default function TerminalLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const colorMap = {
    success: 'text-emerald-400',
    error: 'text-rose-400',
    info: 'text-indigo-300',
    warn: 'text-amber-400',
  }

  const prefixMap = {
    success: '✓',
    error: '✗',
    info: '›',
    warn: '⚠',
  }

  return (
    <div className="glass-card gradient-border p-0 overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-xs text-slate-500 font-mono ml-2">checkwa — validation log</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-600 font-mono">live</span>
        </div>
      </div>

      {/* Log entries */}
      <div className="h-64 overflow-y-auto terminal-scroll p-4 font-mono text-xs space-y-1">
        {logs.length === 0 ? (
          <p className="text-slate-600">
            <span className="text-indigo-500">›</span> Ready. Upload a CSV and start validation to see logs here.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex gap-2 leading-relaxed"
              >
                <span className="text-slate-700 shrink-0 select-none">{log.timestamp}</span>
                <span className={`${colorMap[log.type]} shrink-0`}>{prefixMap[log.type]}</span>
                <span className={`${colorMap[log.type]}`}>{log.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
