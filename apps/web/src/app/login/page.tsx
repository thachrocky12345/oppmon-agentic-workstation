'use client'

/**
 * Login Page
 *
 * Simple login form for authentication.
 */

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// Roles that should land on the admin console by default.
const ADMIN_ROLES = new Set(['SYSTEM_ADMIN', 'TENANT_ADMIN', 'TEAM_ADMIN'])

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // If the caller passed an explicit ?redirect=, honor it. Otherwise we pick
  // the destination after we know the user's role (admin → /admin,
  // everyone else → /dashboard).
  const explicitRedirect = searchParams.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Invalid credentials')
      }

      const data = await response.json()

      // Set cookie with token
      const expiresAt = new Date(data.expiresAt || Date.now() + 24 * 60 * 60 * 1000)
      document.cookie = `auth_token=${data.token}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`

      // Pick destination: explicit redirect param wins; otherwise route admins
      // to /admin and everyone else to /dashboard.
      const role = data?.user?.role as string | undefined
      const target =
        explicitRedirect ||
        (role && ADMIN_ROLES.has(role) ? '/admin' : '/dashboard')

      router.push(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-blue-600 hover:text-blue-500 font-medium">
          Create one
        </Link>
      </p>
    </form>
  )
}

function LoginFormFallback() {
  return (
    <div className="mt-8 space-y-6">
      <div className="space-y-4">
        <div>
          <div className="h-5 w-24 bg-gray-200 rounded mb-1" />
          <div className="h-12 w-full bg-gray-100 rounded-lg" />
        </div>
        <div>
          <div className="h-5 w-20 bg-gray-200 rounded mb-1" />
          <div className="h-12 w-full bg-gray-100 rounded-lg" />
        </div>
      </div>
      <div className="h-12 w-full bg-gray-200 rounded-lg" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            OppMon
          </h1>
          <h2 className="mt-6 text-center text-xl text-gray-600">
            Sign in to your account
          </h2>
        </div>

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        <div className="text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
