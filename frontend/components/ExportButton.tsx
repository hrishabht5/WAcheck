'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  jobId: string | null
  disabled: boolean
}

export default function ExportButton({ jobId, disabled }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (!jobId) return
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:3001/export/${jobId}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Cleaned_Numbers.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.button
      onClick={handleExport}
      disabled={disabled || loading}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      className={`w-full rounded-xl px-6 py-3.5 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
        disabled
          ? 'bg-white/[0.04] text-slate-600 border border-white/[0.06] cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/40 shadow-glow'
      }`}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <span>↓</span>
          Export Cleaned_Numbers.csv
        </>
      )}
    </motion.button>
  )
}
