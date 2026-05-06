'use client'

import { ReactNode } from 'react'
import Link from 'next/link'

interface FeatureCardProps {
  icon: ReactNode
  iconColor?: string
  title: string
  description: string
  href?: string
  downloadHref?: string
}

export function FeatureCard({
  icon,
  iconColor = 'text-blue-400',
  title,
  description,
  href,
  downloadHref
}: FeatureCardProps) {
  const CardContent = () => (
    <>
      <div className={`w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-4 ${iconColor}`}>
        {icon}
      </div>
      <h4 className="text-lg font-semibold text-white mb-2">{title}</h4>
      <p className="text-gray-400 text-sm">{description}</p>
      {downloadHref && (
        <a
          href={downloadHref}
          download
          className="inline-flex items-center gap-2 mt-4 text-green-400 text-sm hover:text-green-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </a>
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block p-6 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all"
      >
        <CardContent />
      </Link>
    )
  }

  return (
    <div className="p-6 bg-white/5 rounded-xl border border-white/10">
      <CardContent />
    </div>
  )
}
