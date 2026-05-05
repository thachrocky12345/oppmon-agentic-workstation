'use client'

/**
 * Create MCP Server Modal
 *
 * Modal form for creating a new MCP server.
 */

import { useState } from 'react'
import { z } from 'zod'

const createMcpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  command: z.string().min(1, 'Command is required'),
  args: z.string().optional(),
  scope: z.enum(['TENANT', 'TEAM']),
})

interface CreateMcpModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateMcpModal({ onClose, onCreated }: CreateMcpModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [scope, setScope] = useState<'TENANT' | 'TEAM'>('TENANT')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const result = createMcpSchema.safeParse({ name, description, command, args, scope })
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
      const argsArray = args.split(/\s+/).filter(Boolean)

      const response = await fetch('/api/admin/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || undefined,
          command,
          args: argsArray,
          env: {},
          scope,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create MCP server')
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Add MCP Server</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {errors.server && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {errors.server}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-gray-900 bg-white ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="my-mcp-server"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                placeholder="Brief description of this server"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Command <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg font-mono text-gray-900 bg-white ${errors.command ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="npx"
                disabled={loading}
              />
              {errors.command && <p className="mt-1 text-sm text-red-600">{errors.command}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arguments</label>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-gray-900 bg-white"
                placeholder="-y @modelcontextprotocol/server-filesystem"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">Space-separated arguments</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
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
              {loading ? 'Creating...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
