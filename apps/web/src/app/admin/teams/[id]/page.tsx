// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Team Detail Page
 *
 * View and edit team details, manage members.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateTeamSchema } from '@/schemas/team'
import { AddMemberModal } from './AddMemberModal'

interface Team {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

interface Member {
  id: string
  userId: string
  email: string
  name?: string
  role: 'admin' | 'member'
  joinedAt: string
}

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.id as string

  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Member modal
  const [showAddMember, setShowAddMember] = useState(false)

  const fetchTeam = async () => {
    try {
      const response = await fetch(`/api/admin/teams/${teamId}`, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Failed to fetch team')
      }
      const data = await response.json()
      setTeam(data.data)
      setEditName(data.data.name)
      setEditDescription(data.data.description || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/admin/teams/${teamId}/members`, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Failed to fetch members')
      }
      const data = await response.json()
      setMembers(data.data)
    } catch (err) {
      console.error('Failed to fetch members:', err)
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchTeam(), fetchMembers()]).finally(() => setLoading(false))
  }, [teamId])

  const handleSave = async () => {
    const result = updateTeamSchema.safeParse({
      name: editName,
      description: editDescription || undefined,
    })

    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const error of result.error.errors) {
        errors[error.path[0] as string] = error.message
      }
      setEditErrors(errors)
      return
    }

    setSaving(true)
    setEditErrors({})

    try {
      const response = await fetch(`/api/admin/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update team')
      }

      const data = await response.json()
      setTeam(data.data)
      setIsEditing(false)
    } catch (err) {
      setEditErrors({
        server: err instanceof Error ? err.message : 'An error occurred',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangeRole = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      const response = await fetch(`/api/admin/teams/${teamId}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      })

      if (!response.ok) {
        throw new Error('Failed to update member role')
      }

      fetchMembers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member from the team?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to remove member')
      }

      fetchMembers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'Team not found'}
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin/teams" className="text-blue-600 hover:text-blue-800 text-sm">
          ← Back to Teams
        </Link>
      </div>

      {/* Team Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Team' : team.name}
          </h1>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            {editErrors.server && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {editErrors.server}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={`w-full max-w-md px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
                  editErrors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {editErrors.name && (
                <p className="mt-1 text-sm text-red-600">{editErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 bg-white"
                rows={3}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditName(team.name)
                  setEditDescription(team.description || '')
                  setEditErrors({})
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 mb-4">
              {team.description || 'No description'}
            </p>
            <div className="text-sm text-gray-500">
              Created: {new Date(team.createdAt).toLocaleDateString()}
              {' · '}
              Updated: {new Date(team.updatedAt).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <button
            onClick={() => setShowAddMember(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Add Member
          </button>
        </div>

        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No members yet
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">
                        {member.name || member.email}
                      </div>
                      {member.name && (
                        <div className="text-sm text-gray-500">{member.email}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      onChange={(e) => handleChangeRole(member.id, e.target.value as 'admin' | 'member')}
                      className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <AddMemberModal
          teamId={teamId}
          onClose={() => setShowAddMember(false)}
          onAdded={() => {
            setShowAddMember(false)
            fetchMembers()
          }}
        />
      )}
    </div>
  )
}
