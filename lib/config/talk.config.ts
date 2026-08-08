/**
 * Tuning knobs for the choice-based 대화 system (see lib/pet-care/talk-
 * questions.ts for the actual question/answer content and
 * hooks/use-pet-talk.ts for the flow this drives). Kept separate from
 * lib/config/pet-care.config.ts's action-effect constants — nothing here
 * changes a stat, only how the conversation UI behaves.
 */

/** How many of the most-recently-shown questions are excluded from the next random pick — "간단한 최근 질문 회피", not a hard history log. */
export const RECENT_QUESTION_HISTORY_SIZE = 3

/** How long a choice's forced expression (see TalkChoice.expression) holds the character art before falling back to the normal mood/animation read. Roughly matches the speech bubble's own hold so the face and the line clear together. */
export const TALK_EXPRESSION_HOLD_MS = 2800

/** How long the talk popup keeps showing the chosen answer before auto-closing itself (see hooks/use-pet-talk.ts) — the player can also close it early via the X button or by tapping the card. */
export const TALK_ANSWER_AUTO_CLOSE_MS = 3200

/** "최근 입력 문구 몇 개만 보관" — oldest entries drop off once a new one pushes past this. */
export const MAX_USER_NOTES = 5

/** Free-text 답변 입력창 길이 제한 — generous enough for a real note, short enough to still fit the speech bubble later when echoed back. */
export const USER_NOTE_MAX_LENGTH = 60

/** Odds that a given ambient chatter tick (hooks/use-pet-initiated-dialogue.ts) echoes a saved user note instead of its normal idle line, whenever at least one note exists — "가끔". */
export const USER_NOTE_ECHO_CHANCE = 0.3
