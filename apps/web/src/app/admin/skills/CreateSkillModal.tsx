// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Create Skill Modal
 *
 * Modal form for creating a new skill with content editor.
 */

import { useState } from 'react'
import { z } from 'zod'

const createSkillSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  content: z.string().min(1, 'Content is required'),
  scope: z.enum(['TENANT', 'TEAM']),
  teamId: z.string().optional(),
})

interface CreateSkillModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateSkillModal({ onClose, onCreated }: CreateSkillModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [scope, setScope] = useState<'TENANT' | 'TEAM'>('TENANT')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const result = createSkillSchema.safeParse({ name, description, content, scope })
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.errors.forEach(err => {
        fieldErrors[err.path[0] as string] = err.message
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const response = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: description || undefined, content, scope }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create skill')
      }

      onCreated()
    } catch (err) {
      setErrors({ server: err instanceof Error ? err.message : 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Create Skill</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          {errors.server && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {errors.server}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg text-gray-900 bg-white ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="my-skill"
                disabled={loading}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'TENANT' | 'TEAM')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                disabled={loading}
              >
                <option value="TENANT">Tenant-wide</option>
                <option value="TEAM">Team-specific</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="A brief description of what this skill does"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg font-mono text-sm resize-none text-gray-900 bg-white ${
                errors.content ? 'border-red-500' : 'border-gray-300'
              }`}
              rows={12}
              placeholder="# Skill Title\n\nYour skill content here..."
              disabled={loading}
            />
            {errors.content && <p className="mt-1 text-sm text-red-600">{errors.content}</p>}
            <p className="mt-1 text-xs text-gray-500">Markdown supported. This will be shown to Claude Code.</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
