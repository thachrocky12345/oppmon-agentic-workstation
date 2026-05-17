// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { ReactNode } from 'react'

interface Step {
  number: number
  title: string
  description?: string
  content?: ReactNode
}

interface StepListProps {
  steps: Step[]
}

export function StepList({ steps }: StepListProps) {
  return (
    <div className="space-y-6">
      {steps.map((step) => (
        <div key={step.number} className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">
              {step.number}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-lg font-semibold text-white mb-1">{step.title}</h4>
            {step.description && (
              <p className="text-gray-400 text-sm mb-3">{step.description}</p>
            )}
            {step.content && (
              <div className="mt-3">{step.content}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
