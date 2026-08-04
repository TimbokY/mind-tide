import { useEffect, useRef } from 'react'

interface AuroraBackgroundProps {
  className?: string
  children?: React.ReactNode
}

export function AuroraBackground({ className, children }: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = [
      'rgba(139, 92, 246, 0.15)',  // purple
      'rgba(99, 102, 241, 0.08)',   // indigo
      'rgba(59, 130, 246, 0.06)',   // blue
      'rgba(168, 85, 247, 0.1)',    // violet
      'rgba(139, 92, 246, 0.05)',   // light purple
    ]

    const animate = () => {
      time += 0.002
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = 0; i < 5; i++) {
        const x = canvas.width * 0.5 + Math.sin(time + i * 1.5) * canvas.width * 0.4
        const y = canvas.height * 0.3 + Math.cos(time * 0.7 + i * 1.2) * canvas.height * 0.2
        const rx = canvas.width * (0.5 + Math.sin(time * 0.5 + i) * 0.3)

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, rx * 0.8)
        gradient.addColorStop(0, colors[i])
        gradient.addColorStop(0.5, colors[i].replace('0.1', '0.03').replace('0.15', '0.04').replace('0.08', '0.02'))
        gradient.addColorStop(1, 'transparent')

        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className={className} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {children}
    </div>
  )
}
