"use client";

import { ArrowRight, Clock, RotateCcw, Save } from "lucide-react";
import { Logo } from "@/components/brain-bet/logo";
import { StatBadge } from "@/components/brain-bet/stat-badge";
import { PLAY_ORDER, STATS, TOTAL_GAMES } from "@/lib/brain-bet";
import { useSound } from "@/hooks/use-sound";

export interface LandingScreenProps {
  onStart: () => void;
  /** 완료된 Intro 게임 수. 0이면 새 게임 시작 화면을 표시한다. */
  resumeCount?: number;
  onResume?: () => void;
  onRestart?: () => void;
  /**
   * True only for a device that has logged in before and is currently
   * signed out (see game-flow.tsx's isReturningLoggedOut) — never true for
   * a first-time visitor, so their existing "게임 시작하기" flow below is
   * completely unaffected. Swaps the primary CTA to "Statling 만나러 가기"
   * (routes to login instead of starting the game directly) and hides the
   * autosave notice, which doesn't make sense to show someone who already
   * has an account.
   */
  isReturningLoggedOut?: boolean;
  /**
   * Routes to the login/signup screen. Used by isReturningLoggedOut's own
   * primary CTA above, and — regardless of isReturningLoggedOut — by the
   * small "이미 계정이 있으신가요?" link in the default (first-time visitor)
   * branch below, so a completely fresh device still has a way to sign into
   * an existing account instead of only ever being offered a new Intro run.
   */
  onGoToLogin?: () => void;
}

export function LandingScreen({
  onStart,
  resumeCount = 0,
  onResume,
  onRestart,
  isReturningLoggedOut = false,
  onGoToLogin,
}: LandingScreenProps) {
  const { play } = useSound();
  const canResume = resumeCount > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center px-5 py-10 sm:py-16">
      {/* Brand */}
      <Logo size="md" />

      <p className="mt-2 text-center text-xs font-bold text-muted-foreground sm:text-sm">
        당신의 플레이로 태어나는{" "}
        <span className="font-bold text-primary">성장형 펫</span>
      </p>

      {/* Hero */}
      <div className="mt-10 flex flex-col items-center text-center sm:mt-14">
        <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-6xl">
          나의 숨겨진
          <br />
          <span className="text-primary">스탯</span>을 발견해보세요.
        </h1>

        <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          6개의 짧은 미니게임을 플레이하고
          <br />
          <span className="font-bold text-foreground">
            나만의 <span className="text-primary">Statling</span>을 깨워보세요.
          </span>
        </p>
      </div>

      {/* Stat preview */}
      <div className="mt-8 w-full">
        <p className="mb-3 text-center text-xs font-bold tracking-wide text-muted-foreground">
          발견하게 될 6가지 능력
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-2.5">
          {PLAY_ORDER.map((id) => {
            const stat = STATS[id];

            return (
              <li
                key={id}
                className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 toy-border"
              >
                <StatBadge stat={stat} size="xs" />

                <span className="font-display text-sm font-extrabold leading-none text-foreground">
                  {stat.name}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* CTA */}
      <div className="mt-8 flex flex-col items-center gap-4">
        {canResume ? (
          <>
            <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground toy-border toy-shadow-sm">
              진단 {resumeCount}/{TOTAL_GAMES}개 완료
            </div>

            <button
              type="button"
              data-sfx-skip
              onClick={() => {
                play("ui-confirm");
                onResume?.();
              }}
              className="group inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 font-display text-xl font-extrabold text-primary-foreground toy-border toy-shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              이어서 하기
              <ArrowRight
                size={22}
                strokeWidth={2.8}
                className="transition-transform duration-150 group-hover:translate-x-1"
              />
            </button>

            <button
              type="button"
              data-sfx-skip
              onClick={() => {
                play("ui-back");
                onRestart?.();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-card px-4 py-2 text-sm font-bold text-muted-foreground toy-border"
            >
              <RotateCcw size={14} strokeWidth={2.4} />
              처음부터 다시 하기
            </button>
          </>
        ) : isReturningLoggedOut ? (
          <button
            type="button"
            data-sfx-skip
            onClick={() => {
              play("ui-confirm");
              onGoToLogin?.();
            }}
            className="group inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 font-display text-xl font-extrabold text-primary-foreground toy-border toy-shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            Statling 만나러 가기
            <ArrowRight
              size={22}
              strokeWidth={2.8}
              className="transition-transform duration-150 group-hover:translate-x-1"
            />
          </button>
        ) : (
          <>
            {/*
              Phase 2C-2 Follow-up — the one login entry point a completely
              fresh device (no local pet, hasLoggedInEver never set) had no
              way to reach at all: this branch's only CTA used to be "게임
              시작하기", with no path to LoginScreen short of first hatching a
              pet. Always rendered here regardless of hasLoggedInEver (unlike
              the isReturningLoggedOut branch's own login CTA above) — reuses
              the exact same onGoToLogin -> phase 'login' -> LoginScreen ->
              AuthForm -> useAuth() path every other login entry point
              already goes through, so SupabaseAuthProvider's session-sync /
              Phase 2C restore flow runs completely unchanged. Deliberately
              styled as a quiet text link (see save-screen.tsx's "나중에
              하기" for the same convention) so it never competes with the
              primary "게임 시작하기" CTA below.
            */}
            <button
              type="button"
              data-sfx-skip
              onClick={() => {
                play("ui-click-soft");
                onGoToLogin?.();
              }}
              className="text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
            >
              이미 계정이 있으신가요?{" "}
              <span className="text-primary">로그인하기</span>
            </button>

            <button
              type="button"
              data-sfx-skip
              onClick={() => {
                play("ui-confirm");
                onStart();
              }}
              className="group inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 font-display text-xl font-extrabold text-primary-foreground toy-border toy-shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              게임 시작하기
              <ArrowRight
                size={22}
                strokeWidth={2.8}
                className="transition-transform duration-150 group-hover:translate-x-1"
              />
            </button>

            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Clock size={15} strokeWidth={2.4} />
              약 2~3분
            </span>
          </>
        )}
      </div>

      {/* Autosave notice — hidden for a returning-logged-out visitor (see isReturningLoggedOut doc comment above). */}
      {!isReturningLoggedOut && (
        <div className="mt-6 flex w-full max-w-sm items-center gap-3 rounded-2xl bg-card px-4 py-3 toy-border toy-shadow-sm">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground toy-border"
            aria-hidden="true"
          >
            <Save size={17} strokeWidth={2.4} />
          </span>

          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold leading-tight text-foreground">
              자동 저장 지원
            </p>

            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              게임을 완료할 때마다 저장돼요.
              <br />
              언제든 돌아와 이어서 할 수 있어요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}