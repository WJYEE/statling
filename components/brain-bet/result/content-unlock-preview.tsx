import { BarChart3, Flame, Gamepad2, Heart, Music, Shirt, Trophy } from 'lucide-react'
import { GamePanel } from '@/components/brain-bet/result/game-panel'
import type { PetProfile } from '@/lib/pets/pet-profile'

/**
 * Copy grounded in real, already-shipped screens only (verified against
 * code before writing this, per this task's own instruction):
 * - 미니게임 -> Free Play (RoomScreen's "성장시키기" -> GrowScreen ->
 *   GAME_POOL, lib/game/game-registry.ts). "12개의 미니게임" is the real,
 *   exact total registered in GAME_POOL (2 games per ability × 6 abilities)
 *   — not rounded/invented. (An earlier pass here said "6개가 더
 *   추가됐어요," counting only the 6 games Assessment never plays; changed
 *   after feedback that framing it as an addition read like an update
 *   notice for existing users rather than "여기 12개가 통째로 열렸다" for
 *   someone who just got their first Statling — see this task's completion
 *   report.)
 * - Statling 꾸미기 -> the real "Statling" bottom-nav tab (nav-rail.tsx),
 *   which nav-rail.tsx's own comment confirms already hosts both character
 *   decoration AND room theme/deco (theme-screen.tsx nested inside it).
 * - 친구 랭킹 -> ranking-screen.tsx's real friend-scope toggle.
 * - 음악 -> real (useBgm / lib/audio/bgm-config.ts), but unlike the other 5
 *   this isn't its own nav destination — it's an ambient background
 *   feature controlled from a settings row inside 마이페이지, not a
 *   separate screen. Included because it's real, not because it's an
 *   equally-weighted destination; see this task's completion report for
 *   why this one is flagged differently from the rest.
 * - 스탯 키우기 -> the real "내 스탯" nav tab (mystats/StatusScreen), which
 *   is a genuinely different screen from Free Play itself (that tab shows
 *   the radar/growth trend; Free Play is the action that moves it) — not a
 *   duplicate of the 미니게임 tile despite both ultimately feeding the same
 *   underlying skill records.
 * - Statling 돌보기 -> RoomScreen's 6 real CARE_ACTIONS (lib/room.ts).
 *
 * None of these tiles are wired as onClick navigation — this component only
 * ever renders on RevealScreen, before Save/Naming/Birthday/Home even
 * exist for this session, so none of Room/Ranking/Statling/MyPage's phases
 * are reachable yet from here. Per this task's own instruction ("존재하지
 * 않는 route는 임의로 연결하지 않는다"), these are deliberately
 * non-interactive preview cards, not premature links to screens the user
 * hasn't unlocked by clicking the CTA below yet.
 */
const CONTENT_TILES = [
  { icon: Gamepad2, title: '미니게임', description: '12개의 게임을 플레이하고 XP를 모아요' },
  { icon: Shirt, title: 'Statling 꾸미기', description: '아이템으로 나만의 Statling을 꾸며요' },
  { icon: Trophy, title: '랭킹', description: '친구들과 성장 기록과 순위를 비교해요' },
  { icon: Music, title: '음악', description: 'Statling과 함께 음악을 즐겨요' },
  { icon: BarChart3, title: '스탯 키우기', description: '활동하면서 Statling의 능력치를 성장시켜요' },
  { icon: Heart, title: 'Statling 돌보기', description: '함께할수록 Statling과 더 가까워져요' },
] as const

/** "반짝벌과" / "바다고래와" — same technique as save-screen.tsx's withObjectParticle (을/를), just the 와/과 pair instead. */
export function withCompanionParticle(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${word}와`
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return `${word}${hasBatchim ? '과' : '와'}`
}

interface ContentUnlockPreviewProps {
  petProfile: PetProfile
}

/**
 * "궁합까지 다 봤으니 끝인 줄 알았는데, 새로운 세계가 열렸다" transition
 * section — sits between StatlingCompatibility(궁합) and NextJourneyPreview
 * (성장 현황) in reveal-screen.tsx. Same GamePanel language every other
 * result section uses (not a foreign ad-banner style), but with a
 * `border-primary/40` accent (vs the other panels' neutral
 * `border-foreground/15`) so it reads as a deliberately stronger beat while
 * scrolling — per this task's own instruction that this transition point
 * should carry slightly more visual weight than 특징/잘 맞는 환경, without
 * becoming its own different design language.
 */
export function ContentUnlockPreview({ petProfile }: ContentUnlockPreviewProps) {
  return (
    <GamePanel icon={<span aria-hidden="true">🔓</span>} label="콘텐츠 해금" className="border-primary/40">
      <p className="text-center font-display text-lg font-extrabold leading-snug text-foreground">
        Statling을 획득해서
        <br />
        <span className="text-primary">새로운 기능이 열렸어요!</span>
      </p>

      <div className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 toy-border">
        <Flame size={14} strokeWidth={3} className="text-primary-foreground" aria-hidden="true" />
        <span className="font-display text-xs font-extrabold text-primary-foreground">
          NEW · 12개의 미니게임이 열렸어요!
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {CONTENT_TILES.map((tile) => (
          <div key={tile.title} className="flex items-center gap-1.5 rounded-xl bg-secondary/50 px-2.5 py-2.5 toy-border">
            <tile.icon size={15} strokeWidth={2.4} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="text-xs font-extrabold leading-tight text-foreground">{tile.title}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
        {withCompanionParticle(petProfile.name)} 함께할수록 더 많은 경험이 기다리고 있어요 ✨
      </p>
    </GamePanel>
  )
}
