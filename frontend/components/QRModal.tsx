'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSocket } from '../lib/socket'

interface Props {
  onConnected: () => void
}

export default function QRModal({ onConnected }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const socket = getSocket()

    socket.emit('init_scraping')
    setVisible(true)

    socket.on('qr', (dataUrl: string) => {
      setQrDataUrl(dataUrl)
    })

    socket.on('client_ready', (ready: boolean) => {
      if (ready) {
        setIsConnected(true)
        setTimeout(() => {
          setVisible(false)
          onConnected()
        }, 1200)
      }
    })

    return () => {
      socket.off('qr')
      socket.off('client_ready')
    }
  }, [onConnected])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="glass-card gradient-border p-8 max-w-sm w-full mx-4 text-center"
          >
            {isConnected ? (
              <div className="space-y-4 animate-fade-in">
                <div className="text-5xl">✅</div>
                <p className="text-lg font-semibold text-emerald-400">WhatsApp Connected!</p>
                <p className="text-sm text-slate-500">Returning to dashboard...</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-mono text-indigo-400 uppercase tracking-widest mb-1">
                    Mode A — Scraping Engine
                  </p>
                  <h3 className="text-xl font-bold text-slate-100">Scan QR Code</h3>
                  <p className="text-xs text-slate-500 mt-1">Open WhatsApp → Linked Devices → Link a Device</p>
                </div>

                <div className="flex items-center justify-center">
                  {qrDataUrl ? (
                    <motion.img
                      key={qrDataUrl}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={qrDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-52 h-52 rounded-xl border border-white/10 p-2 bg-white"
                    />
                  ) : (
                    <div className="w-52 h-52 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-slate-500 font-mono">Initializing client...</p>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-600 font-mono">
                  Session is saved locally. QR scan required only once.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
