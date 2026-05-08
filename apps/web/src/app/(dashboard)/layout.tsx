'use client'

/**
 * Arkon Workspace Layout
 *
 * Dark-themed authenticated shell with:
 *   - Sectioned sidebar (MONITOR / OPERATE / KNOWLEDGE)
 *   - Topbar grouping Admin · Help · Logout next to the user avatar
 *   - iOS-friendly mobile drawer (safe-area, h-dvh, ≥44px touch targets)
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChatWidget } from '@/components/chat'

type NavItem = {
  href: string
  label: string
  icon: string
  hint?: string
}

type NavSection = {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'MONITOR',
    items: [
      { href: '/dashboard',      label: 'Dashboard',      icon: '◉', hint: 'Live overview' },
      { href: '/events',         label: 'Events',         icon: '⌁', hint: 'Activity stream' },
      { href: '/analytics',      label: 'Analytics',      icon: '▤', hint: 'Usage & trends' },
      { href: '/security',       label: 'Security',       icon: '◈', hint: 'Threats & policy' },
      { href: '/incidents',      label: 'Incidents',      icon: '◇', hint: 'Open issues' },
    ],
  },
  {
    label: 'OPERATE',
    items: [
      { href: '/agents',         label: 'Agents',         icon: '⬡', hint: 'Registered agents' },
      { href: '/workflows',      label: 'Workflows',      icon: '⇄', hint: 'Automation' },
      { href: '/costs',          label: 'Costs',          icon: '⌗', hint: 'Spend tracking' },
      { href: '/infrastructure', label: 'Infrastructure', icon: '⌬', hint: 'Nodes & health' },
    ],
  },
  {
    label: 'KNOWLEDGE',
    items: [
      { href: '/chat',           label: 'Chat',           icon: '◖', hint: 'RAG-backed chat' },
      { href: '/journal',        label: 'Journal',        icon: '✎', hint: 'Agent memory' },
    ],
  },
]

interface User {
  id: string
  email: string
  name?: string
  role: string
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminBlockedOpen, setAdminBlockedOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          // /api/auth/me returns { user, tenant, teams, createdAt } — NOT wrapped in `data`.
          // Tolerate both shapes in case a future response-wrapper middleware lands.
          setUser(data.user ?? data.data?.user ?? data.data ?? null)
        } else {
          router.push('/login')
        }
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [router])

  // Lock body scroll while drawer is open (mobile)
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Auto-close drawer on route change
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    document.cookie = 'auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore — cookie already cleared
    }
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-ark-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-ark-text-dim">
          <span className="h-2 w-2 rounded-full bg-ark-accent animate-pulse" />
          Loading workspace…
        </div>
      </div>
    )
  }

  // Admins (any *_ADMIN role) get the "Go to Admin" shortcut.
  // Plain MEMBERs (created by an admin via the future create-user page) do not.
  const isAdmin =
    user?.role === 'TENANT_ADMIN' ||
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'TEAM_ADMIN'

  return (
    <div className="min-h-dvh bg-ark-bg text-ark-text">
      {/* Mobile drawer scrim */}
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ====================== Sidebar ====================== */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-dvh w-72 bg-ark-surface border-r border-ark-border
          transform transition-transform duration-300 ease-out
          lg:translate-x-0 lg:w-64
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-ark-border-soft">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ark-accent to-ark-accent-2 text-ark-bg font-black">
              ◆
              <span className="absolute -inset-0.5 rounded-lg bg-ark-accent/20 blur-md -z-10" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Arkon <span className="text-ark-text-dim font-normal">Workspace</span>
            </span>
          </Link>
          <button
            className="lg:hidden h-11 w-11 -mr-2 grid place-items-center text-ark-text-dim hover:text-ark-text active:scale-95 transition"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Workspace status pill */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 rounded-lg bg-ark-surface-2 border border-ark-border-soft px-3 py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-ark-accent-2 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ark-accent-2" />
            </span>
            <span className="text-xs text-ark-text-dim">
              All systems <span className="text-ark-accent-2 font-medium">operational</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="mt-4 px-3 overflow-y-auto"
          style={{ height: 'calc(100dvh - 4rem - 1rem - 56px - var(--safe-top) - var(--safe-bottom))' }}
        >
          {navSections.map((section) => (
            <div key={section.label} className="mb-5">
              <div className="px-3 pb-2 text-[10px] font-semibold tracking-[0.18em] text-ark-text-muted">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        group relative flex items-center gap-3 rounded-lg px-3 py-2.5 min-h-[44px]
                        transition-colors active:scale-[0.98]
                        ${active
                          ? 'bg-ark-surface-3 text-ark-text shadow-ark'
                          : 'text-ark-text-dim hover:bg-ark-surface-2 hover:text-ark-text'}
                      `}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-ark-accent" />
                      )}
                      <span className={`
                        grid place-items-center h-7 w-7 rounded-md text-sm
                        ${active ? 'bg-ark-accent/15 text-ark-accent' : 'bg-ark-surface-2 text-ark-text-dim group-hover:text-ark-text'}
                      `}>
                        {item.icon}
                      </span>
                      <span className="flex flex-col leading-tight min-w-0">
                        <span className="text-sm font-medium truncate">{item.label}</span>
                        {item.hint && (
                          <span className="text-[11px] text-ark-text-muted truncate">{item.hint}</span>
                        )}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ====================== Main column ====================== */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 bg-ark-bg/80 backdrop-blur-md border-b border-ark-border"
          style={{ paddingTop: 'var(--safe-top)' }}
        >
          <div className="flex items-center gap-3 h-16 px-3 sm:px-5">
            {/* Hamburger */}
            <button
              className="lg:hidden h-11 w-11 -ml-1 grid place-items-center rounded-lg text-ark-text-dim hover:text-ark-text hover:bg-ark-surface-2 active:scale-95 transition"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Page label */}
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-ark-text-muted">Workspace</span>
              <span className="text-ark-text-muted">/</span>
              <span className="text-ark-text font-medium capitalize">
                {pathname.split('/').filter(Boolean)[0] || 'dashboard'}
              </span>
            </div>

            <div className="flex-1" />

            {/* Notifications */}
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative h-10 w-10 grid place-items-center rounded-lg text-ark-text-dim hover:text-ark-text hover:bg-ark-surface-2 active:scale-95 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-ark-danger ring-2 ring-ark-bg" />
            </Link>

            {/* Help (?) */}
            <Link
              href="/docs"
              aria-label="Help & tutorial"
              className="h-10 w-10 grid place-items-center rounded-lg text-ark-text-dim hover:text-ark-text hover:bg-ark-surface-2 active:scale-95 transition"
              title="Help & tutorial"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Link>

            {/* Admin shortcut — always visible. If the user is an admin, navigates to /admin.
                Otherwise, opens a modal asking them to register a new (admin-by-default) account. */}
            <div className="hidden sm:block h-6 w-px bg-ark-border mx-1" />
            {isAdmin ? (
              <Link
                href="/admin"
                title="Go to Admin"
                aria-label="Go to Admin"
                className="group flex items-center gap-2.5 pl-1 pr-1 rounded-lg hover:bg-ark-surface-2 active:scale-95 transition"
              >
                <AdminAvatar user={user} variant="admin" />
                <div className="hidden md:flex flex-col leading-tight">
                  <span className="text-sm font-medium text-ark-text truncate max-w-[10rem]">
                    Go to Admin
                  </span>
                  <span className="text-[11px] text-ark-text-muted capitalize">{user?.role}</span>
                </div>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setAdminBlockedOpen(true)}
                title="Go to Admin"
                aria-label="Go to Admin"
                className="group flex items-center gap-2.5 pl-1 pr-1 rounded-lg hover:bg-ark-surface-2 active:scale-95 transition"
              >
                <AdminAvatar user={user} variant="member" />
                <div className="hidden md:flex flex-col leading-tight">
                  <span className="text-sm font-medium text-ark-text truncate max-w-[10rem]">
                    Go to Admin
                  </span>
                  <span className="text-[11px] text-ark-text-muted capitalize">{user?.role}</span>
                </div>
              </button>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium text-ark-text-dim hover:text-ark-text hover:bg-ark-surface-2 active:scale-95 transition"
              aria-label="Sign out"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ paddingBottom: 'calc(2rem + var(--safe-bottom))' }}>
          {children}
        </main>
      </div>

      {/* Floating chat */}
      <ChatWidget />

      {/* Admin-required modal — shown when a non-admin clicks "Go to Admin" */}
      {adminBlockedOpen && (
        <AdminBlockedModal
          role={user?.role}
          onClose={() => setAdminBlockedOpen(false)}
          onCreateAccount={async () => {
            // Clear the current session, then send them to /register so the
            // freshly-created account gets the default admin role.
            document.cookie = 'auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
            try {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            } catch {
              // cookie already cleared
            }
            router.push('/register')
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Admin avatar (small reusable bit so the markup stays readable)             */
/* -------------------------------------------------------------------------- */

function AdminAvatar({
  user,
  variant,
}: {
  user: User | null
  variant: 'admin' | 'member'
}) {
  const initial = (user?.name?.[0] || user?.email?.[0] || '?').toUpperCase()
  return (
    <div
      className={`relative h-9 w-9 rounded-full grid place-items-center text-sm font-bold ring-1 transition
        ${variant === 'admin'
          ? 'bg-gradient-to-br from-ark-accent to-ark-accent-2 text-ark-bg ring-ark-border group-hover:ring-ark-accent'
          : 'bg-ark-surface-2 text-ark-text-dim ring-ark-border group-hover:ring-ark-text-dim'
        }`}
    >
      {initial}
      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-ark-surface border border-ark-border grid place-items-center">
        {variant === 'admin' ? (
          <svg className="h-2 w-2 text-ark-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10.325 4.317a1.724 1.724 0 013.35 0c.21.969 1.31 1.45 2.169.901a1.724 1.724 0 012.371 2.371c-.55.86-.069 1.96.9 2.17a1.724 1.724 0 010 3.35c-.969.21-1.45 1.31-.9 2.17.55.86-.012 1.82-.872 2.371-.86.55-1.96.069-2.17-.9a1.724 1.724 0 00-3.35 0c-.21.969-1.31 1.45-2.17.9a1.724 1.724 0 01-2.371-2.371c.55-.86.069-1.96-.9-2.17a1.724 1.724 0 010-3.35c.969-.21 1.45-1.31.9-2.17a1.724 1.724 0 012.372-2.371c.859.55 1.959.069 2.17-.9z" />
          </svg>
        ) : (
          // Padlock badge for non-admins
          <svg className="h-2.5 w-2.5 text-ark-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 11c-1.1 0-2 .9-2 2v3h4v-3c0-1.1-.9-2-2-2zm6 5V9a6 6 0 10-12 0v7" />
          </svg>
        )}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Admin-required modal                                                       */
/* -------------------------------------------------------------------------- */

function AdminBlockedModal({
  role,
  onClose,
  onCreateAccount,
}: {
  role?: string
  onClose: () => void
  onCreateAccount: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-blocked-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-ark-surface border border-ark-border shadow-ark p-6 text-ark-text"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
      >
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 grid place-items-center rounded-lg bg-ark-warn/15 text-ark-warn shrink-0">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 id="admin-blocked-title" className="text-base font-semibold">
              Admin access required
            </h3>
            <p className="text-sm text-ark-text-dim mt-1">
              Your current account
              {role ? <> (role: <span className="font-mono text-ark-text">{role}</span>)</> : null}
              {' '}does not have admin privileges.
            </p>
            <p className="text-sm text-ark-text-dim mt-3">
              <span className="text-ark-text font-medium">Please create a new account</span> to get
              the default admin role — every new self-registered user is provisioned as a tenant
              admin automatically.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg text-sm font-medium text-ark-text-dim hover:text-ark-text hover:bg-ark-surface-2 active:scale-95 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateAccount}
            className="h-10 px-4 rounded-lg text-sm font-semibold bg-ark-accent text-ark-bg hover:bg-ark-accent-2 active:scale-95 transition"
          >
            Create new admin account
          </button>
        </div>
      </div>
    </div>
  )
}
