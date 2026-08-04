import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, type Transition, type Variants } from 'framer-motion'
import {
  LayoutDashboard,
  PenLine,
  CalendarDays,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react'
import { invoke } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首页仪表盘' },
  { to: '/editor', icon: PenLine, label: '记录梦境' },
  { to: '/calendar', icon: CalendarDays, label: '日历回顾' },
  { to: '/insights', icon: BarChart3, label: '洞察可视化' },
  { to: '/settings', icon: Settings, label: '设置' },
]

const sidebarVariants: Variants = {
  hidden: { x: -40, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: 'easeOut' } as Transition,
  },
}

const itemTransition: Transition = { duration: 0.4, ease: 'easeOut' }

type AiStatus = 'loading' | 'ready' | 'unconfigured' | 'error'

export function Sidebar() {
  const [aiStatus, setAiStatus] = useState<AiStatus>('loading')

  useEffect(() => {
    checkStatus()
    const id = setInterval(checkStatus, 15000)
    return () => clearInterval(id)
  }, [])

  async function checkStatus() {
    try {
      const config = await invoke<{provider: string; model_name: string}>('get_ai_config')
      if (!config.model_name) { setAiStatus('unconfigured'); return }
      if (config.provider === 'builtin') {
        const loaded = await invoke<boolean>('is_local_model_loaded')
        setAiStatus(loaded ? 'ready' : 'unconfigured')
      } else {
        setAiStatus('ready')
      }
    } catch {
      setAiStatus('error')
    }
  }

  const statusConfig = {
    loading: { color: 'bg-yellow-500/60 animate-pulse', text: '检测中…' },
    ready: { color: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]', text: 'AI 就绪' },
    unconfigured: { color: 'bg-[#64748b]', text: '点击设置 AI' },
    error: { color: 'bg-red-500/60', text: '连接异常' },
  }[aiStatus]

  return (
    <motion.aside
      initial="hidden"
      animate="visible"
      variants={sidebarVariants}
      className="fixed left-0 top-0 h-screen w-[220px] bg-[#0f172a]/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col z-50"
    >
      <div className="px-6 py-6">
        <h1 className="text-xl font-medium text-[#f8fafc] tracking-tight">
          梦潮汐
          <span className="block text-xs text-[#8b5cf6] font-normal mt-1">
            MindTide
          </span>
        </h1>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {navItems.map((item, i) => (
            <motion.li
              key={item.to}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.05, ...itemTransition }}
            >
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
                    isActive
                      ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] shadow-[0_0_20px_rgba(139,92,246,0.1)]'
                      : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5',
                  )
                }
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <item.icon className="w-4 h-4" />
                </motion.div>
                {item.label}
              </NavLink>
            </motion.li>
          ))}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-white/[0.06] space-y-2">
        <NavLink
          to="/settings"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group"
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusConfig.color)} />
          <div className="min-w-0">
            <p className="text-[11px] text-[#64748b] group-hover:text-[#94a3b8] transition-colors">
              {statusConfig.text}
            </p>
          </div>
          <Sparkles className={cn(
            'w-3 h-3 ml-auto shrink-0 transition-all',
            aiStatus === 'ready' ? 'text-[#8b5cf6]' : 'text-[#64748b]/30',
          )} />
        </NavLink>
        <p className="text-[10px] text-[#64748b]/50 px-3">
          记录梦境起伏，看见潜意识潮汐
        </p>
      </div>
    </motion.aside>
  )
}
