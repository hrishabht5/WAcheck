'use client'

import { motion } from 'framer-motion'

interface ProgressData {
  verified: number
  invalid: number
  pending: number
  total: number
  current: number
}

interface Props {
  data: ProgressData
}

export default function ProgressBar({ data }: Props) {
  const { verified, invalid, pending, total, current } = data
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  const verifiedPct = total > 0 ? (verified / total) * 100 : 0
  const invalidPct = total > 0 ? (invalid / total) * 100 : 0
  const pendingPct = total > 0 ? (pending / total) * 100 : 0

  return (
    <div className="glass-card gradient-border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest">Validation Progress</p>
        <span className="text-sm font-mono text-slate-300">
          {current}/{total}{' '}
          <span className="text-indigo-400 font-bold">{pct}%</span>
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="absolute inset-0 flex">
          <motion.div
            className="h-full bg-emerald-500 rounded-l-full"
            animate={{ width: `${verifiedPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          <motion.div
            className="h-full bg-rose-500"
            animate={{ width: `${invalidPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          <motion.div
            className="h-full bg-indigo-500/40 rounded-r-full"
            animate={{ width: `${pendingPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Stat pills */}
      <div className="grid grid-cols-3 gap-3">
        <StatPill label="Verified" count={verified} color="emerald" icon="✓" />
        <StatPill label="Invalid" count={invalid} color="rose" icon="✗" />
        <StatPill label="Pending" count={pending} color="indigo" icon="◌" />
      </div>
    </div>
  )
}

function StatPill({
  label,
  count,
  color,
  icon,
}: {
  label: string
  count: number
  color: 'emerald' | 'rose' | 'indigo'
  icon: string
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  }

  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${colorMap[color]}`}>
      <p className="text-lg font-bold font-mono">{count.toLocaleString()}</p>
      <p className="text-xs opacity-70">
        {icon} {label}
      </p>
    </div>
  )
}
