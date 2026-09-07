'use client'

import { BarChart3, Home, Shirt, Trophy, User, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 'theme' (방 꾸미기) is no longer a top-level tab — the tab bar is capped
 * at 5, so it moved to a nested view inside 'statling' (see
 * components/brain-bet/screens/statling-screen.tsx), alongside the deco
 * equip UI and the 도감 (dex). 'statling' replaced it here.
 */
export type NavTab = 'room' | 'mystats' | 'ranking' | 'statling' | 'mypage'

interface NavItem {
  id: NavTab
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'room', label: '홈', icon: Home },
  { id: 'mystats', label: '내 스탯', icon: BarChart3 },
  { id: 'ranking', label: '랭킹', icon: Trophy },
  { id: 'statling', label: 'Statling', icon: Shirt },
  { id: 'mypage', label: '마이페이지', icon: User },
]

interface NavRailProps {
  active: NavTab
  onSelect: (tab: NavTab) => void
}

/** Bottom tab bar shown on every post-hatch (Room and onward) screen. */
export function NavRail({ active, onSelect }: NavRailProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-[color:var(--line)] bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              data-onboarding-target={`nav-${item.id}`}
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-bold transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-2xl',
                  isActive && 'bg-accent text-accent-foreground toy-border',
                )}
              >
                <Icon size={20} strokeWidth={2.4} />
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
