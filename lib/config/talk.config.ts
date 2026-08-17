/**
 * Tuning knobs for the choice-based 대화 system (see lib/pet-care/talk-
 * questions.ts for the actual question/answer content and
 * hooks/use-pet-talk.ts for the flow this drives). Kept separate from
 * lib/config/pet-care.config.ts's action-effect constants — nothing here
 * changes a stat, only how the conversation UI behaves.
 */

/**
 * How many of the most-recently-shown ROOT questions are excluded from the
 * next random pick — persisted now (lib/pet-care/dialogue-memory-storage.ts),
 * not just a session-only ref, so a refresh/reconnect doesn't immediately
 * repeat one. Never a permanent ban — once the pool is exhausted,
 * pickRandomQuestion falls back to the full 42-question pool.
 */
export const RECENT_QUESTION_HISTORY_SIZE = 10

/** How long a follow-up choice's reaction line stays up before the next question in the chain appears — the "짧은 자연스러운 transition" beat between steps. */
export const TALK_FOLLOWUP_TRANSITION_MS = 1400

/** Odds that a given ambient chatter tick (hooks/use-pet-initiated-dialogue.ts) references a previously-saved DialogueMemory answer instead of its normal line, whenever at least one is saved — kept low ("가끔") so it never reads as mechanical. */
export const DIALOGUE_MEMORY_REFERENCE_CHANCE = 0.15

/** How long a choice's forced expression (see TalkChoice.expression) holds the character art before falling back to the normal mood/animation read. Roughly matches the speech bubble's own hold so the face and the line clear together. */
export const TALK_EXPRESSION_HOLD_MS = 2800

/** "최근 입력 문구 몇 개만 보관" — oldest entries drop off once a new one pushes past this. */
export const MAX_USER_NOTES = 5

/** Free-text 답변 입력창 길이 제한 — generous enough for a real note, short enough to still fit the speech bubble later when echoed back. */
export const USER_NOTE_MAX_LENGTH = 60

/** Odds that a given ambient chatter tick (hooks/use-pet-initiated-dialogue.ts) echoes a saved user note instead of its normal idle line, whenever at least one note exists — "가끔". */
export const USER_NOTE_ECHO_CHANCE = 0.3
