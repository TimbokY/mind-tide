import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
}

export function GlowCard({ children, className, glowColor = 'rgba(139, 92, 246, 0.15)' }: GlowCardProps) {
  return (
    <motion.div
      whileHover={{ boxShadow: `0 0 30px ${glowColor}, 0 0 60px ${glowColor}` }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm',
        'before:absolute before:inset-0 before:rounded-2xl before:opacity-0 before:transition-opacity before:duration-500 before:pointer-events-none',
        'hover:before:opacity-100',
        className,
      )}
      style={
        {
          '--glow-color': glowColor,
        } as React.CSSProperties
      }
    >
      <div className="relative z-[1]">{children}</div>
    </motion.div>
  )
}
