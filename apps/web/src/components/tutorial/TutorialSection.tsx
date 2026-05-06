'use client'

import { ReactNode } from 'react'

interface TutorialSectionProps {
  id: string
  icon: ReactNode
  iconBg?: string
  title: string
  description?: string
  children: ReactNode
}

export function TutorialSection({
  id,
  icon,
  iconBg = 'bg-blue-500/20',
  title,
  description,
  children
}: TutorialSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-start gap-4 mb-6">
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {description && (
            <p className="text-gray-400 mt-1">{description}</p>
          )}
        </div>
      </div>
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        {children}
      </div>
    </section>
  )
}
