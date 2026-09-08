# Changelog

All notable changes to Statling are documented in this file.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):

- **PATCH** — a bug fix in an already-shipped version, no new user-facing behavior.
- **MINOR** — a new feature or a meaningful user experience change.
- **MAJOR** — a change that breaks compatibility with the existing product structure.

Versions correspond to git tags on `main`; see `git tag -l` and `git show <tag>` for the exact commit each one points to.

## [1.2.0] - 2026-09-08

### Added
- First-visit Home onboarding guide (`HomeOnboardingGuide`), auto-shown once on the very first real Room entry — spotlights actual Room/NavRail UI in place rather than a separate modal or mock screen
- Guide steps navigate through the real My Stats / Ranking / Statling / My Page screens (actual `setPhase` tab switches), not fake previews
- "Statling 가이드" entry in My Page to manually reopen the guide at any time, restarting from Step 1
- `onboarding_viewed` / `onboarding_skipped` / `onboarding_completed` analytics events (PostHog)

### Changed
- Onboarding "seen" state is now scoped per Statling (keyed by the confirmed pet's `confirmedAt`) instead of a single global flag, so a newly created Statling is correctly treated as never-seen

## [1.1.0] - 2026-09-07

### Added
- Reveal (result) screen now previews what happens after the result: a "콘텐츠 해금" section (mini-games, 꾸미기, 랭킹, 음악, 스탯, 돌보기) and a "성장 현황" section showing the Statling's starting Lv./XP
- Reveal's primary CTA rewritten toward "내 Statling 키우기", with the share button demoted to a secondary action
- SaveScreen copy reframed from loss-framing to gain-framing (what logging in unlocks, not what's lost by skipping it)

### Changed
- The original auto-shown first-visit onboarding modal no longer appears automatically on first Home entry (manual reopen only) — superseded by v1.2.0's new guide

### Fixed
- Duplicate "다음 단계 →" eyebrow above the Reveal CTA button removed
- BirthdayScreen no longer advances to the next screen when saving birth date/gender fails — only a successful save (or nothing to save) continues
- Guest users (no login) no longer see the Birthday/Profile step — Naming now leads straight to Home for guests, matching the signed-in flow's intent of asking for profile info only when it can actually be saved

## [1.0.1] - 2026-09-06

### Fixed
- Open Graph share image now uses the real Statling logo instead of a placeholder shape

## [1.0.0] - 2026-09-06

### Added
- Initial public version: 6-stat Assessment, Statling hatch/Reveal, Save/Naming, Home (Room) care loop, Free Play mini-games, ranking, My Page
