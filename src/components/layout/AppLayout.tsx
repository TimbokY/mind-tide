import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { PageTransition } from './page-transition'
import { AuroraBackground } from '@/components/ui/aurora-background'
import { invoke } from '@/lib/tauri'

export function AppLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()

  useEffect(() => {
    invoke<boolean>('ensure_model_loaded')
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['aiReady'] })
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] font-sans relative">
      <AuroraBackground />
      <Sidebar />
      <main className="relative z-10 ml-[220px] min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
