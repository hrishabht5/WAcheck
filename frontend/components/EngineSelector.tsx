'use client'

import { motion } from 'framer-motion'

type Engine = 'scraping' | 'waba'

interface Props {
  engine: Engine
  onChange: (e: Engine) => void
  wabaConfig: { phoneNumberId: string; accessToken: string }
  onWabaChange: (field: 'phoneNumberId' | 'accessToken', value: string) => void
}

export default function EngineSelector({ engine, onChange, wabaConfig, onWabaChange }: Props) {
  return (
    <div className="glass-card gradient-border p-6 space-y-4">
      <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest">Validation Engine</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange('scraping')}
          className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
            engine === 'scraping'
              ? 'border-indigo-500 bg-indigo-500/10 shadow-glow-sm'
              : 'border-white/10 bg-white/[0.03] hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📡</span>
            <span className="text-sm font-semibold text-slate-200">Mode A — Scraping</span>
          </div>
          <p className="text-xs text-slate-500">QR scan via whatsapp-web.js</p>
          {engine === 'scraping' && (
            <motion.div
              layoutId="engine-indicator"
              className="absolute inset-0 rounded-xl border border-indigo-500 pointer-events-none"
              initial={false}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
        </button>

        <button
          onClick={() => onChange('waba')}
          className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
            engine === 'waba'
              ? 'border-indigo-500 bg-indigo-500/10 shadow-glow-sm'
              : 'border-white/10 bg-white/[0.03] hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔑</span>
            <span className="text-sm font-semibold text-slate-200">Mode B — WABA API</span>
          </div>
          <p className="text-xs text-slate-500">Official Meta /contacts API</p>
          {engine === 'waba' && (
            <motion.div
              layoutId="engine-indicator"
              className="absolute inset-0 rounded-xl border border-indigo-500 pointer-events-none"
              initial={false}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      </div>

      {engine === 'waba' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-3 pt-1"
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-mono">Phone Number ID</label>
            <input
              type="text"
              value={wabaConfig.phoneNumberId}
              onChange={(e) => onWabaChange('phoneNumberId', e.target.value)}
              placeholder="e.g. 1234567890"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1 font-mono">Access Token</label>
            <input
              type="password"
              value={wabaConfig.accessToken}
              onChange={(e) => onWabaChange('accessToken', e.target.value)}
              placeholder="Bearer token from Meta Business"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>
        </motion.div>
      )}
    </div>
  )
}
