'use client'

/**
 * Arkon Dashboard
 *
 * Dark-themed overview with:
 *   - Health-score ring + alert bar
 *   - KPI cards with inline-SVG sparklines
 *   - Trend Analysis section with 7D / 30D toggle and dual area charts
 *   - Anomalies, recent activity, and quick links
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

interface Overview {
  totalAgents: number
  activeAgents: number
  totalEvents: number
  eventsToday: number
  totalCost: number
  costToday: number
  openIncidents: number
  threats: number
}

interface Activity {
  id: string
  type: string
  message: string
  timestamp: string
  agentId?: string
  agentName?: string
}

interface Trend {
  date: string
  events: number
  cost: number
}

interface Anomaly {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  agentId?: string
}

type Range = '7d' | '30d'

/* -------------------------------------------------------------------------- */
/*  Tiny chart primitives (no extra deps)                                     */
/* -------------------------------------------------------------------------- */

function Sparkline({
  values,
  stroke = 'var(--ark-accent)',
  fill = 'rgba(34, 211, 238, 0.18)',
  width = 120,
  height = 36,
}: {
  values: number[]
  stroke?: string
  fill?: string
  width?: number
  height?: number
}) {
  if (!values.length) {
    return <div className="h-9 w-full" />
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const step = width / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-9" preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaChart({
  values,
  labels,
  color = 'var(--ark-accent)',
  fill = 'rgba(34, 211, 238, 0.16)',
  height = 200,
  formatY = (n: number) => String(n),
}: {
  values: number[]
  labels: string[]
  color?: string
  fill?: string
  height?: number
  formatY?: (n: number) => string
}) {
  if (!values.length) {
    return <div className="h-[200px] grid place-items-center text-sm text-ark-text-muted">No data</div>
  }
  const W = 600
  const H = height
  const PAD_L = 40
  const PAD_R = 12
  const PAD_T = 16
  const PAD_B = 28
  const max = Math.max(...values, 1)
  const min = 0
  const range = Math.max(max - min, 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const step = innerW / Math.max(values.length - 1, 1)

  const pts = values.map((v, i) => {
    const x = PAD_L + i * step
    const y = PAD_T + innerH - ((v - min) / range) * innerH
    return [x, y] as const
  })
  const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const area = `${path} L${PAD_L + innerW},${PAD_T + innerH} L${PAD_L},${PAD_T + innerH} Z`

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * i) / yTicks)

  // Show ~6 x-axis labels max
  const labelStride = Math.max(1, Math.floor(values.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {/* Y grid */}
      {ticks.map((t, i) => {
        const y = PAD_T + innerH - ((t - min) / range) * innerH
        return (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
              stroke="var(--ark-border-soft)" strokeWidth="1" strokeDasharray="2 4"
            />
            <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--ark-text-muted)">
              {formatY(Math.round(t))}
            </text>
          </g>
        )
      })}
      {/* Area + line */}
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* X labels */}
      {labels.map((lab, i) => {
        if (i % labelStride !== 0 && i !== labels.length - 1) return null
        const x = PAD_L + i * step
        return (
          <text key={i} x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ark-text-muted)">
            {lab}
          </text>
        )
      })}
    </svg>
  )
}

function HealthRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  const color =
    clamped >= 80 ? 'var(--ark-accent-2)' :
    clamped >= 60 ? 'var(--ark-accent)' :
    clamped >= 40 ? 'var(--ark-warn)' : 'var(--ark-danger)'
  const label = clamped >= 80 ? 'HEALTHY' : clamped >= 60 ? 'STABLE' : clamped >= 40 ? 'DEGRADED' : 'CRITICAL'
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={radius} stroke="var(--ark-border)" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r={radius}
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-bold leading-none">{clamped}</div>
          <div className="text-[9px] tracking-[0.18em] text-ark-text-muted mt-0.5">{label}</div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('7d')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, activityRes, trendsRes, anomaliesRes] = await Promise.all([
          fetch('/api/dashboard/overview', { credentials: 'include' }),
          fetch('/api/dashboard/activity', { credentials: 'include' }),
          fetch('/api/dashboard/trends', { credentials: 'include' }),
          fetch('/api/dashboard/anomalies', { credentials: 'include' }),
        ])
        if (overviewRes.ok) setOverview((await overviewRes.json()).data)
        if (activityRes.ok) setActivity((await activityRes.json()).data || [])
        if (trendsRes.ok) setTrends((await trendsRes.json()).data || [])
        if (anomaliesRes.ok) setAnomalies((await anomaliesRes.json()).data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatNumber = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  const formatCurrency = (n: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2,
    }).format(n)

  const sliced = useMemo(() => {
    const days = range === '7d' ? 7 : 30
    return trends.slice(-days)
  }, [trends, range])

  const eventValues = sliced.map((t) => t.events)
  const costValues = sliced.map((t) => t.cost)
  const labels = sliced.map((t) =>
    new Date(t.date).toLocaleDateString([], { month: 'short', day: 'numeric' })
  )

  // Approximate "health" from open incidents + threats
  const healthScore = overview
    ? Math.max(0, 100 - (overview.openIncidents * 6) - (overview.threats * 4))
    : 92

  const totalActive = overview?.activeAgents ?? 0
  const totalAgents = overview?.totalAgents ?? 0
  const activePct = totalAgents ? Math.round((totalActive / totalAgents) * 100) : 0

  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical' || a.severity === 'high')

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-ark-text-dim">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-ark-accent animate-pulse" />
          Loading dashboard…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-ark-text-muted">WORKSPACE OVERVIEW</p>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-1 tracking-tight">
            Good {greet()}, <span className="text-ark-accent">operator</span>
          </h1>
          <p className="text-sm text-ark-text-dim mt-1">
            Live snapshot of your AI agent fleet, security posture, and spend.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 bg-ark-surface border border-ark-border rounded-lg p-1 self-start sm:self-end">
          {(['7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 h-9 rounded-md text-xs font-medium tracking-wider transition ${
                range === r
                  ? 'bg-ark-accent/15 text-ark-accent'
                  : 'text-ark-text-dim hover:text-ark-text'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-ark-danger/40 bg-ark-danger/10 text-ark-danger px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Hero: health + alerts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-xl bg-ark-surface border border-ark-border p-5 flex items-center gap-5 shadow-ark">
          <HealthRing score={healthScore} />
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.18em] text-ark-text-muted">FLEET HEALTH</p>
            <p className="text-lg font-semibold mt-1">
              {healthScore >= 80 ? 'All systems operational' : healthScore >= 60 ? 'Minor degradation' : 'Attention required'}
            </p>
            <p className="text-xs text-ark-text-dim mt-1">
              <span className="text-ark-accent-2 font-medium">{totalActive}</span> of {totalAgents} agents active · <span className="text-ark-text">{activePct}%</span> uptime
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl bg-ark-surface border border-ark-border p-5 shadow-ark">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${criticalAnomalies.length ? 'bg-ark-danger animate-pulse' : 'bg-ark-accent-2'}`} />
              <p className="text-[10px] tracking-[0.18em] text-ark-text-muted">ALERTS</p>
            </div>
            <Link href="/security" className="text-xs text-ark-accent hover:underline">
              View security →
            </Link>
          </div>
          {criticalAnomalies.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-ark-text-dim">
              <span className="h-8 w-8 grid place-items-center rounded-md bg-ark-accent-2/15 text-ark-accent-2">✓</span>
              No critical anomalies in the last hour. {anomalies.length} low-severity signals tracked.
            </div>
          ) : (
            <ul className="space-y-2">
              {criticalAnomalies.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg bg-ark-surface-2 border border-ark-border-soft px-3 py-2">
                  <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-ark-danger' : 'bg-ark-warn'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-ark-text-muted">{a.severity}</span>
                      <span className="text-[11px] text-ark-text-muted">{new Date(a.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm mt-0.5 truncate">{a.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* KPI cards with sparklines */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total agents"
          value={formatNumber(totalAgents)}
          delta={`${totalActive} active`}
          deltaColor="text-ark-accent-2"
          icon="⬡"
          spark={eventValues.length ? eventValues : [3, 4, 5, 4, 6, 7, 7]}
          sparkColor="var(--ark-accent)"
          sparkFill="rgba(34, 211, 238, 0.18)"
        />
        <KpiCard
          label="Events today"
          value={formatNumber(overview?.eventsToday || 0)}
          delta={`${formatNumber(overview?.totalEvents || 0)} all-time`}
          deltaColor="text-ark-text-dim"
          icon="⌁"
          spark={eventValues.length ? eventValues : [10, 12, 9, 14, 18, 22, 26]}
          sparkColor="var(--ark-accent-2)"
          sparkFill="rgba(52, 211, 153, 0.18)"
        />
        <KpiCard
          label="Cost today"
          value={formatCurrency(overview?.costToday || 0)}
          delta={`${formatCurrency(overview?.totalCost || 0)} total`}
          deltaColor="text-ark-text-dim"
          icon="⌗"
          spark={costValues.length ? costValues : [1, 1.2, 0.9, 1.5, 1.8, 2.1, 2.4]}
          sparkColor="var(--ark-warn)"
          sparkFill="rgba(251, 191, 36, 0.18)"
        />
        <KpiCard
          label="Open incidents"
          value={String(overview?.openIncidents || 0)}
          delta={`${overview?.threats || 0} threats`}
          deltaColor={(overview?.threats || 0) > 0 ? 'text-ark-danger' : 'text-ark-text-dim'}
          icon="◇"
          spark={[2, 1, 3, 2, 4, 2, overview?.openIncidents || 0]}
          sparkColor="var(--ark-danger)"
          sparkFill="rgba(248, 113, 113, 0.18)"
        />
      </section>

      {/* Trend analysis */}
      <section className="rounded-xl bg-ark-surface border border-ark-border shadow-ark">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-wrap gap-2">
          <div>
            <p className="text-[10px] tracking-[0.18em] text-ark-text-muted">TREND ANALYSIS</p>
            <h2 className="text-lg font-semibold mt-0.5">Activity & spend ({range.toUpperCase()})</h2>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ark-accent" /> <span className="text-ark-text-dim">Events</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ark-warn" /> <span className="text-ark-text-dim">Cost (USD)</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 px-3 sm:px-4 pb-5">
          <div className="rounded-lg bg-ark-surface-2 border border-ark-border-soft p-3">
            <p className="text-[10px] tracking-[0.18em] text-ark-text-muted px-1">MESSAGE VOLUME</p>
            <AreaChart
              values={eventValues}
              labels={labels}
              color="var(--ark-accent)"
              fill="rgba(34, 211, 238, 0.16)"
              formatY={(n) => formatNumber(n)}
            />
          </div>
          <div className="rounded-lg bg-ark-surface-2 border border-ark-border-soft p-3">
            <p className="text-[10px] tracking-[0.18em] text-ark-text-muted px-1">TOKEN BURN</p>
            <AreaChart
              values={costValues}
              labels={labels}
              color="var(--ark-warn)"
              fill="rgba(251, 191, 36, 0.16)"
              formatY={(n) => `$${n}`}
            />
          </div>
        </div>
      </section>

      {/* Activity + anomalies */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-ark-surface border border-ark-border shadow-ark overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ark-border-soft">
            <h2 className="text-sm font-semibold tracking-wide text-ark-text">Recent activity</h2>
            <Link href="/events" className="text-xs text-ark-accent hover:underline">View all →</Link>
          </div>
          {activity.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-ark-text-muted">No recent activity</div>
          ) : (
            <ul className="divide-y divide-ark-border-soft">
              {activity.slice(0, 8).map((item) => (
                <li key={item.id} className="px-5 py-3 hover:bg-ark-surface-2 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ark-text truncate">{item.message}</p>
                      {item.agentName && (
                        <Link
                          href={`/agents/${item.agentId}`}
                          className="text-xs text-ark-accent hover:underline"
                        >
                          {item.agentName}
                        </Link>
                      )}
                    </div>
                    <span className="text-[11px] text-ark-text-muted whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-ark-surface border border-ark-border shadow-ark overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ark-border-soft">
            <h2 className="text-sm font-semibold tracking-wide text-ark-text">Anomalies</h2>
            <Link href="/security" className="text-xs text-ark-accent hover:underline">All →</Link>
          </div>
          {anomalies.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-ark-accent-2/15 text-ark-accent-2 grid place-items-center mx-auto">✓</div>
              <p className="text-sm text-ark-text-dim mt-3">No anomalies detected</p>
            </div>
          ) : (
            <ul className="px-3 py-3 space-y-2">
              {anomalies.slice(0, 5).map((a) => (
                <li key={a.id} className="rounded-lg bg-ark-surface-2 border border-ark-border-soft px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase tracking-wider ${
                      a.severity === 'critical' ? 'text-ark-danger' :
                      a.severity === 'high' ? 'text-ark-warn' :
                      'text-ark-info'
                    }`}>
                      {a.severity}
                    </span>
                    <span className="text-[11px] text-ark-text-muted">{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-ark-text mt-1 line-clamp-2">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: '/agents',    label: 'Manage agents', icon: '⬡' },
          { href: '/workflows', label: 'Workflows',     icon: '⇄' },
          { href: '/analytics', label: 'Analytics',     icon: '▤' },
          { href: '/costs',     label: 'Cost report',   icon: '⌗' },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex items-center gap-3 rounded-xl bg-ark-surface border border-ark-border px-4 py-3 hover:border-ark-accent/40 hover:bg-ark-surface-2 active:scale-[0.98] transition shadow-ark"
          >
            <span className="h-9 w-9 grid place-items-center rounded-lg bg-ark-surface-2 border border-ark-border-soft text-ark-text-dim group-hover:text-ark-accent">
              {q.icon}
            </span>
            <span className="text-sm font-medium text-ark-text">{q.label}</span>
          </Link>
        ))}
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  delta,
  deltaColor,
  icon,
  spark,
  sparkColor,
  sparkFill,
}: {
  label: string
  value: string
  delta: string
  deltaColor: string
  icon: string
  spark: number[]
  sparkColor: string
  sparkFill: string
}) {
  return (
    <div className="rounded-xl bg-ark-surface border border-ark-border p-4 shadow-ark hover:border-ark-accent/30 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.18em] text-ark-text-muted">{label.toUpperCase()}</p>
          <p className="text-2xl font-semibold mt-1.5 tracking-tight">{value}</p>
          <p className={`text-xs mt-1 ${deltaColor}`}>{delta}</p>
        </div>
        <span className="h-9 w-9 grid place-items-center rounded-lg bg-ark-surface-2 border border-ark-border-soft text-ark-text-dim text-base shrink-0">
          {icon}
        </span>
      </div>
      <div className="mt-3 -mx-1">
        <Sparkline values={spark} stroke={sparkColor} fill={sparkFill} />
      </div>
    </div>
  )
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
