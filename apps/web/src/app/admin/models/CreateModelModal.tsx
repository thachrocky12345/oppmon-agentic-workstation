// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Create Model Modal
 *
 * Provider selection, dynamic form, and connection testing.
 */

import { useState, useEffect } from 'react'

interface Provider {
  id: string
  displayName: string
  description: string
  category: 'cloud' | 'local' | 'compatible'
  icon: string
  fields: Field[]
  setupSteps: string[]
  defaultModel?: string
}

interface Field {
  key: string
  label: string
  type: 'text' | 'password' | 'select' | 'number' | 'textarea' | 'json'
  secret: boolean
  required: boolean
  options?: { value: string; label: string; description?: string }[]
  placeholder?: string
  help?: string
  default?: string | number
  showWhen?: { field: string; equals: string | number }
}

interface ConnectionTestResult {
  ok: boolean
  latencyMs: number
  modelInfo?: {
    name: string
    provider: string
    contextLength?: number
  }
  error?: {
    code: string
    message: string
    hint?: string
  }
}

interface CreateModelModalProps {
  onClose: () => void
  onCreated: () => void
}

const providerIcons: Record<string, string> = {
  anthropic: '🔮',
  bedrock: '☁️',
  'azure-openai': '🔷',
  openai: '🤖',
  ollama: '🦙',
  cerebras: '⚡',
  'openai-compatible': '🔌',
}

export function CreateModelModal({ onClose, onCreated }: CreateModelModalProps) {
  const [step, setStep] = useState<'provider' | 'configure' | 'test'>('provider')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [displayName, setDisplayName] = useState('')
  const [scope, setScope] = useState<'TENANT' | 'TEAM'>('TENANT')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/models/providers', { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch providers')
      const data = await response.json()
      setProviders(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    }
  }

  const handleSelectProvider = (provider: Provider) => {
    setSelectedProvider(provider)

    // Initialize form with defaults
    const defaults: Record<string, unknown> = {}
    provider.fields.forEach(field => {
      if (field.default !== undefined) {
        defaults[field.key] = field.default
      }
    })
    setFormData(defaults)

    // Auto-generate display name
    if (provider.defaultModel) {
      setDisplayName(`${provider.displayName} - ${provider.defaultModel}`)
    } else {
      setDisplayName(`${provider.displayName} Model`)
    }

    setStep('configure')
  }

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const isFieldVisible = (field: Field): boolean => {
    if (!field.showWhen) return true
    return formData[field.showWhen.field] === field.showWhen.equals
  }

  const handleTestConnection = async () => {
    if (!selectedProvider) return

    setTesting(true)
    setTestResult(null)
    setError(null)

    try {
      // Separate public and secret config
      const publicConfig: Record<string, unknown> = {}
      const secretConfig: Record<string, string> = {}

      selectedProvider.fields.forEach(field => {
        const value = formData[field.key]
        if (value !== undefined && value !== '') {
          if (field.secret) {
            secretConfig[field.key] = String(value)
          } else {
            publicConfig[field.key] = value
          }
        }
      })

      const response = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerTemplateId: selectedProvider.id,
          publicConfig,
          secretConfig,
        }),
      })

      const result = await response.json()
      setTestResult(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  const handleCreate = async () => {
    if (!selectedProvider) return

    setLoading(true)
    setError(null)

    try {
      // Separate public and secret config
      const publicConfig: Record<string, unknown> = {}
      const secretConfig: Record<string, string> = {}

      selectedProvider.fields.forEach(field => {
        const value = formData[field.key]
        if (value !== undefined && value !== '') {
          if (field.secret) {
            secretConfig[field.key] = String(value)
          } else {
            publicConfig[field.key] = value
          }
        }
      })

      const modelIdentifier = (publicConfig.model as string) || selectedProvider.defaultModel || 'custom'

      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName,
          providerTemplateId: selectedProvider.id,
          modelIdentifier,
          publicConfig,
          secretConfig,
          scope,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error?.message || 'Failed to create model')
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create model')
    } finally {
      setLoading(false)
    }
  }

  const renderProviderSelection = () => (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">Choose a Provider</h3>

      {/* Cloud Providers */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Cloud Providers</h4>
        <div className="grid grid-cols-2 gap-3">
          {providers
            .filter(p => p.category === 'cloud')
            .map(provider => (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider)}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <span className="text-2xl mr-3">{providerIcons[provider.id]}</span>
                <div>
                  <p className="font-medium text-gray-900">{provider.displayName}</p>
                  <p className="text-sm text-gray-500">{provider.description}</p>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Local Providers */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Local Providers</h4>
        <div className="grid grid-cols-2 gap-3">
          {providers
            .filter(p => p.category === 'local')
            .map(provider => (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider)}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <span className="text-2xl mr-3">{providerIcons[provider.id]}</span>
                <div>
                  <p className="font-medium text-gray-900">{provider.displayName}</p>
                  <p className="text-sm text-gray-500">{provider.description}</p>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Compatible Providers */}
      <div>
        <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Compatible APIs</h4>
        <div className="grid grid-cols-2 gap-3">
          {providers
            .filter(p => p.category === 'compatible')
            .map(provider => (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider)}
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
              >
                <span className="text-2xl mr-3">{providerIcons[provider.id]}</span>
                <div>
                  <p className="font-medium text-gray-900">{provider.displayName}</p>
                  <p className="text-sm text-gray-500">{provider.description}</p>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  )

  const renderConfigureForm = () => {
    if (!selectedProvider) return null

    return (
      <div>
        <div className="flex items-center mb-6">
          <button
            onClick={() => setStep('provider')}
            className="text-blue-600 hover:text-blue-800 mr-3"
          >
            ← Back
          </button>
          <span className="text-2xl mr-3">{providerIcons[selectedProvider.id]}</span>
          <h3 className="text-lg font-medium text-gray-900">{selectedProvider.displayName}</h3>
        </div>

        {/* Setup Steps */}
        {selectedProvider.setupSteps.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-blue-900 mb-2">Setup Steps</h4>
            <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
              {selectedProvider.setupSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="My Claude Model"
            />
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scope *
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'TENANT' | 'TEAM')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="TENANT">Tenant-wide</option>
              <option value="TEAM">Team-specific</option>
            </select>
          </div>

          {/* Dynamic Fields */}
          {selectedProvider.fields
            .filter(isFieldVisible)
            .map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && '*'}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={(formData[field.key] as string) || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  >
                    <option value="">Select...</option>
                    {field.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={(formData[field.key] as string) || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white font-mono text-sm"
                  />
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    value={(formData[field.key] as number) || ''}
                    onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value, 10))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                ) : (
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={(formData[field.key] as string) || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                )}
                {field.help && (
                  <p className="text-sm text-gray-500 mt-1">{field.help}</p>
                )}
              </div>
            ))}
        </div>

        {/* Test Connection */}
        <div className="mt-6 border-t pt-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            {testResult && (
              <div className={`flex items-center ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                <span className="text-xl mr-2">{testResult.ok ? '✓' : '✗'}</span>
                <span>
                  {testResult.ok
                    ? `Connected (${testResult.latencyMs}ms)`
                    : testResult.error?.message || 'Connection failed'}
                </span>
              </div>
            )}
          </div>

          {testResult?.error?.hint && (
            <p className="text-sm text-red-500 mt-2">
              Hint: {testResult.error.hint}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex justify-between items-center border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Add AI Model</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {step === 'provider' && renderProviderSelection()}
          {step === 'configure' && renderConfigureForm()}
        </div>

        {step === 'configure' && (
          <div className="border-t px-6 py-4 flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || !displayName}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Model'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
