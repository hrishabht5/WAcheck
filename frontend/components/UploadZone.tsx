'use client'

import { useState, useRef, DragEvent } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onUpload: (jobId: string, count: number) => void
}

export default function UploadZone({ onUpload }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file')
      return
    }
    setUploading(true)
    setError(null)
    setFileName(file.name)

    const formData = new FormData()
    formData.append('csv', file)

    try {
      const res = await fetch('http://localhost:3001/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpload(data.jobId, data.count)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      setFileName(null)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div className="glass-card gradient-border p-6 space-y-3">
      <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest">Upload CSV</p>

      <motion.div
        animate={dragging ? { scale: 1.01 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed px-6 py-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 ${
          dragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }}
        />

        {uploading ? (
          <>
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-mono">Parsing CSV...</p>
          </>
        ) : fileName ? (
          <>
            <span className="text-3xl">✅</span>
            <p className="text-sm font-semibold text-emerald-400">{fileName}</p>
            <p className="text-xs text-slate-500">Click to replace</p>
          </>
        ) : (
          <>
            <span className="text-3xl opacity-40">📄</span>
            <p className="text-sm text-slate-400">Drop your CSV here, or click to browse</p>
            <p className="text-xs text-slate-600 font-mono">Numbers must be in E.164 format (+CountryCodeNumber)</p>
          </>
        )}
      </motion.div>

      {error && (
        <p className="text-xs text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          ⚠ {error}
        </p>
      )}
    </div>
  )
}
