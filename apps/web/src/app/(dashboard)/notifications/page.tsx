'use client'

/**
 * Notifications Page
 *
 * User notifications and preferences.
 */

import { useState, useEffect } from 'react'

interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  read: boolean
  actionUrl?: string
  createdAt: string
}

interface NotificationPreferences {
  email: boolean
  push: boolean
  slack: boolean
  types: {
    security: boolean
    incidents: boolean
    budgets: boolean
    agents: boolean
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPreferences, setShowPreferences] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [notifRes, prefsRes] = await Promise.all([
        fetch('/api/notifications', { credentials: 'include' }),
        fetch('/api/notifications/preferences', { credentials: 'include' }),
      ])

      if (notifRes.ok) {
        const data = await notifRes.json()
        setNotifications(data.data || [])
      }
      if (prefsRes.ok) {
        const data = await prefsRes.json()
        setPreferences(data.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleMarkRead = async (notificationId?: string) => {
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(notificationId ? { ids: [notificationId] } : { all: true }),
      })
      if (!response.ok) throw new Error('Failed to mark as read')
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const handleDelete = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete notification')
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleSavePreferences = async () => {
    if (!preferences) return

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      })
      if (!response.ok) throw new Error('Failed to save preferences')
      setShowPreferences(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return 'ℹ️'
    }
  }

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'success': return 'border-l-green-500 bg-green-50'
      case 'warning': return 'border-l-yellow-500 bg-yellow-50'
      case 'error': return 'border-l-red-500 bg-red-50'
      default: return 'border-l-blue-500 bg-blue-50'
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading notifications...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => handleMarkRead()}
              className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowPreferences(true)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Preferences
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-6xl block mb-4">🔔</span>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No notifications</h2>
            <p className="text-gray-500">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-l-4 ${getTypeColor(notification.type)} ${notification.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getTypeIcon(notification.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{notification.title}</h3>
                      {!notification.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-gray-400">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                      {notification.actionUrl && (
                        <a
                          href={notification.actionUrl}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          View details
                        </a>
                      )}
                      {!notification.read && (
                        <button
                          onClick={() => handleMarkRead(notification.id)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notification.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      {showPreferences && preferences && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
              <button onClick={() => setShowPreferences(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Delivery Channels</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.email}
                      onChange={(e) => setPreferences({ ...preferences, email: e.target.checked })}
                      className="rounded"
                    />
                    <span>Email notifications</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.push}
                      onChange={(e) => setPreferences({ ...preferences, push: e.target.checked })}
                      className="rounded"
                    />
                    <span>Push notifications</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.slack}
                      onChange={(e) => setPreferences({ ...preferences, slack: e.target.checked })}
                      className="rounded"
                    />
                    <span>Slack notifications</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-3">Notification Types</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.types.security}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        types: { ...preferences.types, security: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Security alerts</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.types.incidents}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        types: { ...preferences.types, incidents: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Incident updates</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.types.budgets}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        types: { ...preferences.types, budgets: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Budget alerts</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={preferences.types.agents}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        types: { ...preferences.types, agents: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span>Agent status changes</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowPreferences(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreferences}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
