'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  id: string
  title: string
  href?: string
}

interface TutorialNavProps {
  title: string
  items: NavItem[]
  activeSection?: string
}

export function TutorialNav({ title, items, activeSection }: TutorialNavProps) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-24 w-64 flex-shrink-0">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = item.href
            ? pathname === item.href
            : activeSection === item.id

          const Component = item.href ? Link : 'a'
          const props = item.href
            ? { href: item.href }
            : { href: `#${item.id}` }

          return (
            <Component
              key={item.id}
              {...props}
              className={`block px-4 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-green-500 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.title}
            </Component>
          )
        })}
      </nav>
    </aside>
  )
}
