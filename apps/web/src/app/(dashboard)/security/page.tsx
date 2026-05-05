'use client'

/**
 * Security Page (ThreatGuard)
 *
 * Security overview, threat detection, and policy management.
 */

import { useState, useEffect } from 'react'

interface SecurityOverview {
  threatCount: number
  anomalyCount: number
  resolvedToday: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

interface Threat {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  source: string
  agentId?: string
  agentName?: string
  dismissed: boolean
  createdAt: string
}

interface Anomaly {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  detectedValue: number
  expectedRange: string
  agentId?: string
  resolved: boolean
  createdAt: string
}

interface Policy {
  id: string
  name: string
  description: string
  type: string
  enabled: boolean
  config: Record<string, unknown>
}

export default function SecurityPage() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [threats, setThreats] = useState<Threat[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'threats' | 'anomalies' | 'policies'>('threats')

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [overviewRes, threatsRes, anomaliesRes, policiesRes] = await Promise.all([
        fetch('/api/security/overview', { credentials: 'include' }),
        fetch('/api/security/threats', { credentials: 'include' }),
        fetch('/api/security/anomalies', { credentials: 'include' }),
        fetch('/api/security/policies', { credentials: 'include' }),
      ])

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data.data)
      }
      if (threatsRes.ok) {
        const data = await threatsRes.json()
        setThreats(data.data || [])
      }
      if (anomaliesRes.ok) {
        const data = await anomaliesRes.json()
        setAnomalies(data.data || [])
      }
      if (policiesRes.ok) {
        const data = await policiesRes.json()
        setPolicies(data.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleDismissThreat = async (threatId: string) => {
    try {
      const response = await fetch(`/api/security/threats/${threatId}/dismiss`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to dismiss threat')
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to dismiss')
    }
  }

  const handleResolveAnomaly = async (anomalyId: string) => {
    try {
      const response = await fetch(`/api/security/anomalies/${anomalyId}/resolve`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to resolve anomaly')
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resolve')
    }
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  const getRiskLevelColor = (level: string): string => {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-50'
      case 'high': return 'text-orange-600 bg-orange-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-green-600 bg-green-50'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading security data...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Security</h1>
        <p className="text-gray-500">ThreatGuard - Monitor and protect your AI agents</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className={`rounded-lg shadow p-6 ${getRiskLevelColor(overview?.riskLevel || 'low')}`}>
          <p className="text-sm font-medium opacity-80">Risk Level</p>
          <p className="text-2xl font-bold uppercase">{overview?.riskLevel || 'Low'}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Active Threats</p>
          <p className="text-2xl font-bold text-red-600">{overview?.threatCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Anomalies</p>
          <p className="text-2xl font-bold text-orange-600">{overview?.anomalyCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Resolved Today</p>
          <p className="text-2xl font-bold text-green-600">{overview?.resolvedToday || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('threats')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'threats'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Threats ({threats.filter(t => !t.dismissed).length})
            </button>
            <button
              onClick={() => setActiveTab('anomalies')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'anomalies'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Anomalies ({anomalies.filter(a => !a.resolved).length})
            </button>
            <button
              onClick={() => setActiveTab('policies')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'policies'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Policies ({policies.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'threats' && (
            <div>
              {threats.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-2">✅</span>
                  <p className="font-medium">No threats detected</p>
                  <p className="text-sm">Your agents are operating normally</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {threats.map((threat) => (
                    <div
                      key={threat.id}
                      className={`p-4 rounded-lg border ${getSeverityColor(threat.severity)} ${threat.dismissed ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium uppercase">{threat.severity}</span>
                            <span className="text-xs">•</span>
                            <span className="text-xs">{threat.type}</span>
                          </div>
                          <p className="font-medium">{threat.message}</p>
                          <p className="text-sm opacity-80 mt-1">Source: {threat.source}</p>
                          {threat.agentName && (
                            <p className="text-sm opacity-80">Agent: {threat.agentName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-60">{new Date(threat.createdAt).toLocaleString()}</span>
                          {!threat.dismissed && (
                            <button
                              onClick={() => handleDismissThreat(threat.id)}
                              className="px-3 py-1 text-xs bg-white rounded border hover:bg-gray-50"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'anomalies' && (
            <div>
              {anomalies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-2">📊</span>
                  <p className="font-medium">No anomalies detected</p>
                  <p className="text-sm">All metrics are within normal ranges</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {anomalies.map((anomaly) => (
                    <div
                      key={anomaly.id}
                      className={`p-4 rounded-lg border ${getSeverityColor(anomaly.severity)} ${anomaly.resolved ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium uppercase">{anomaly.severity}</span>
                            <span className="text-xs">•</span>
                            <span className="text-xs">{anomaly.type}</span>
                          </div>
                          <p className="font-medium">{anomaly.message}</p>
                          <p className="text-sm opacity-80 mt-1">
                            Detected: {anomaly.detectedValue} (Expected: {anomaly.expectedRange})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-60">{new Date(anomaly.createdAt).toLocaleString()}</span>
                          {!anomaly.resolved && (
                            <button
                              onClick={() => handleResolveAnomaly(anomaly.id)}
                              className="px-3 py-1 text-xs bg-white rounded border hover:bg-gray-50"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'policies' && (
            <div>
              {policies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl block mb-2">📋</span>
                  <p className="font-medium">No security policies configured</p>
                  <p className="text-sm">Contact admin to set up security policies</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {policies.map((policy) => (
                    <div key={policy.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{policy.name}</p>
                            <span className={`px-2 py-0.5 text-xs rounded ${policy.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                              {policy.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{policy.description}</p>
                          <p className="text-xs text-gray-500 mt-1">Type: {policy.type}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
