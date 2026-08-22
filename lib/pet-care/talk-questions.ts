import type { DialogueMemoryKey } from '@/lib/pet-care/dialogue-memory-storage'
import type { CharacterStateKey } from '@/lib/character-state-assets'
import type { StatId } from '@/lib/brain-bet'

export type TalkCategory = 'daily' | 'preference' | 'imagination' | 'emotion' | 'relationship' | 'light'

export interface TalkChoice {
  id: string
  /** Button label — what the player says. */
  label: string
  /** What the Statling says back, shown in its speech bubble. Overridden by `statResponses` when the current pet's primaryStat has a variant — see hooks/use-pet-talk.ts#chooseAnswer. */
  response: string
  /**
   * Which of the 24 character-art states this answer's reaction reads as —
   * held for TALK_EXPRESSION_HOLD_MS (see lib/config/talk.config.ts) before
   * falling back to whatever the current mood/animation would normally show.
   * Omitted entirely just keeps the default 'talk' pose.
   */
  expression?: CharacterStateKey
  /**
   * A light per-character flavor variant of `response`, keyed by the
   * player's Statling's primaryStat — reserved for a handful of
   * "self-reflection" spots (~20-25% of the pool), never every question.
   * Falls back to `response` when the current pet's stat has no entry here.
   */
  statResponses?: Partial<Record<StatId, string>>
  /**
   * Up to one follow-up question, asked right after this choice's response
   * plays out instead of ending the conversation — see hooks/use-pet-talk.ts's
   * TALK_FOLLOWUP_TRANSITION_MS handling. A follow-up question's own choices
   * must NOT set `next` again — depth is capped at 1 follow-up level (well
   * within the "최대 2" ceiling) to keep the chain simple and easy to reason
   * about.
   */
  next?: TalkQuestion
  /**
   * A small, non-sensitive taste fact to remember the instant this choice is
   * picked (see lib/pet-care/dialogue-memory-storage.ts) — reserved for a
   * handful of preference-style questions, never every choice.
   */
  memory?: { key: DialogueMemoryKey; value: string }
}

export interface TalkQuestion {
  id: string
  category: TalkCategory
  text: string
  /** Empty for the one isFreeText question. No hard cap otherwise. */
  choices: TalkChoice[]
  /** True only for the single special "자유 입력" question — a text field instead of choice buttons (see talk-question-card.tsx). */
  isFreeText?: boolean
}

/**
 * The full ROOT question pool (42 questions across 6 categories) plus their
 * nested one-level follow-ups. Content-only — no logic belongs in this file
 * beyond pickRandomQuestion below, so adding/editing a question or answer
 * never means touching hooks/use-pet-talk.ts or any component.
 */
export const TALK_QUESTIONS: TalkQuestion[] = [
  // ---- daily (8) ----
  {
    id: 'today-how-was-it',
    category: 'daily',
    text: '오늘 하루 어땠어?',
    choices: [
      { id: 'hard', label: '힘들었어', response: '내가 안아줄게!', expression: 'love' },
      { id: 'good', label: '좋았어', response: '정말 다행이다!', expression: 'happy' },
      { id: 'you', label: '너는?', response: '난 너를 봐서 행복해.', expression: 'love' },
    ],
  },
  {
    id: 'what-are-you-doing',
    category: 'daily',
    text: '지금 뭐 하고 있었어?',
    choices: [
      { id: 'resting', label: '그냥 쉬고 있었어', response: '그럼 나랑 같이 쉬자!', expression: 'happy' },
      { id: 'thinking-of-you', label: '너 생각하고 있었어', response: '어... 진짜? 부끄럽잖아.', expression: 'embarrassed' },
      { id: 'worrying', label: '고민 중이었어', response: '무슨 고민이야? 같이 생각해볼까?', expression: 'thinking' },
    ],
  },
  {
    id: 'daily-what-did-you-do',
    category: 'daily',
    text: '오늘 뭐 했어?',
    choices: [
      {
        id: 'studied',
        label: '공부했어',
        response: '오, 공부했구나!',
        expression: 'thinking',
        next: {
          id: 'daily-what-did-you-do-study-type',
          category: 'daily',
          text: '무슨 공부했어?',
          choices: [
            {
              id: 'school',
              label: '학교/전공 공부',
              response: '전공 공부 힘내! 끝나면 나랑 좀 쉬자.',
              expression: 'happy',
              memory: { key: 'studyType', value: '학교/전공' },
            },
            {
              id: 'job',
              label: '취업 준비',
              response: '열심히 하고 있구나! 좋은 소식 생기면 나한테도 알려줘!',
              expression: 'love',
              memory: { key: 'studyType', value: '취업 준비' },
            },
            {
              id: 'language',
              label: '외국어',
              response: '오, 멋있다! 나한테도 한마디 가르쳐줄래?',
              expression: 'happy',
              memory: { key: 'studyType', value: '외국어' },
            },
            {
              id: 'this-that',
              label: '그냥 이것저것',
              response: '이것저것 하다 보면 어느새 느는 것 같아!',
              expression: 'happy',
              memory: { key: 'studyType', value: '그냥 이것저것' },
            },
          ],
        },
      },
      {
        id: 'played',
        label: '놀았어',
        response: '재밌었겠다!',
        expression: 'happy',
        statResponses: {
          reaction: '재밌었겠다! 나도 몸 움직이는 놀이는 자신 있는데.',
          memory: '재밌었겠다! 뭐 하고 놀았는지 나중에도 기억해줘.',
        },
      },
      { id: 'rested', label: '쉬었어', response: '푹 쉬는 것도 중요하지!', expression: 'idle' },
    ],
  },
  {
    id: 'daily-memorable',
    category: 'daily',
    text: '오늘 제일 기억나는 일은?',
    choices: [
      { id: 'happy-moment', label: '좋은 일이 있었어', response: '우와, 그거 완전 좋은데!', expression: 'happy' },
      { id: 'nothing-special', label: '딱히 없었어', response: '평범한 하루도 나름 좋은 거야.', expression: 'idle' },
      { id: 'you-are-it', label: '지금 이 순간', response: '헤헤, 그 말에 완전 설렌다.', expression: 'embarrassed' },
    ],
  },
  {
    id: 'daily-busy',
    category: 'daily',
    text: '오늘 많이 바빴어?',
    choices: [
      {
        id: 'very-busy',
        label: '엄청 바빴어',
        response: '고생 많았어! 지금은 좀 쉬어도 돼.',
        expression: 'love',
        statResponses: {
          reaction: '고생 많았어! 나도 오늘 정신없이 빠르게 움직였다니까.',
          focus: '고생 많았어! 나도 한 가지에 몰입하다 보니 시간 가는 줄 몰랐어.',
        },
      },
      { id: 'not-busy', label: '한가했어', response: '여유로운 하루였구나, 좋다.', expression: 'happy' },
      { id: 'so-so', label: '그냥 그랬어', response: '평범한 하루도 소중하지.', expression: 'idle' },
    ],
  },
  {
    id: 'daily-current-mood',
    category: 'daily',
    text: '지금 기분은 어때?',
    choices: [
      {
        id: 'good-mood',
        label: '좋아!',
        response: '헤헤, 나도 덩달아 기분 좋아진다!',
        expression: 'happy',
      },
      {
        id: 'not-great',
        label: '별로야...',
        response: '무슨 일 있었어?',
        expression: 'thinking',
        next: {
          id: 'daily-current-mood-why',
          category: 'daily',
          text: '왜 그런 것 같아?',
          choices: [
            { id: 'tired', label: '그냥 좀 지쳤어', response: '오늘은 일찍 쉬어. 내가 옆에 있을게.', expression: 'love' },
            { id: 'annoyed', label: '짜증나는 일이 있었어', response: '휴, 속상했겠다. 나한테라도 다 풀어놔.', expression: 'thinking' },
            { id: 'unsure', label: '나도 잘 모르겠어', response: '그런 날도 있는 거야. 천천히 풀어가자.', expression: 'idle' },
          ],
        },
      },
      { id: 'so-so-mood', label: '그냥 그래', response: '그런 날도 있지 뭐.', expression: 'idle' },
    ],
  },
  {
    id: 'daily-food',
    category: 'daily',
    text: '오늘 맛있는 거 먹었어?',
    choices: [
      { id: 'yes-tasty', label: '응, 맛있었어!', response: '오, 뭐 먹었는지 궁금하다!', expression: 'happy' },
      { id: 'just-normal', label: '그냥 평범하게 먹었어', response: '든든하게 먹은 게 어디야.', expression: 'idle' },
      { id: 'forgot-to-eat', label: '깜빡하고 못 먹었어', response: '안 돼, 얼른 뭐라도 챙겨 먹어!', expression: 'thinking' },
    ],
  },
  {
    id: 'daily-outside',
    category: 'daily',
    text: '오늘 밖에 나갔어?',
    choices: [
      { id: 'went-out', label: '응, 나갔어', response: '바깥바람 쐬니까 좋았지?', expression: 'happy' },
      { id: 'stayed-in', label: '아니, 집에만 있었어', response: '집에서 푹 쉬는 것도 좋아.', expression: 'idle' },
      { id: 'want-to-go', label: '나가고 싶었는데 못 나갔어', response: '다음엔 꼭 같이 나가자!', expression: 'love' },
    ],
  },

  // ---- preference (8) ----
  {
    id: 'pref-sea-mountain',
    category: 'preference',
    text: '바다랑 산 중 어디가 좋아?',
    choices: [
      { id: 'sea', label: '바다', response: '파도 소리 들으면서 걷는 거 상상만 해도 좋다!', expression: 'happy', memory: { key: 'favoritePlaceType', value: '바다' } },
      { id: 'mountain', label: '산', response: '맑은 공기 마시면서 오르는 것도 멋질 것 같아.', expression: 'happy', memory: { key: 'favoritePlaceType', value: '산' } },
      { id: 'both', label: '둘 다 좋아', response: '욕심쟁이! 그럼 둘 다 데려가줘.', expression: 'embarrassed' },
    ],
  },
  {
    id: 'pref-morning-night',
    category: 'preference',
    text: '아침이 좋아, 밤이 좋아?',
    choices: [
      { id: 'morning', label: '아침', response: '상쾌하게 하루 시작하는 걸 좋아하는구나!', expression: 'happy', memory: { key: 'preferredTime', value: '아침' } },
      { id: 'night', label: '밤', response: '조용한 밤 시간, 나도 좋아해.', expression: 'idle', memory: { key: 'preferredTime', value: '밤' } },
      { id: 'depends', label: '그때그때 달라', response: '유연한 것도 능력이지!', expression: 'happy' },
    ],
  },
  {
    id: 'pref-rain',
    category: 'preference',
    text: '비 오는 날 좋아해?',
    choices: [
      {
        id: 'like-rain',
        label: '좋아해',
        response: '빗소리 들으면 마음이 차분해지지!',
        expression: 'idle',
        memory: { key: 'likesRain', value: '좋아함' },
        next: {
          id: 'pref-rain-why',
          category: 'preference',
          text: '비 오는 날 뭐 하는 게 제일 좋아?',
          choices: [
            { id: 'rain-sleep', label: '따뜻하게 이불 덮고 있기', response: '완전 공감이야, 나도 그럴 때 제일 포근해.', expression: 'love' },
            { id: 'rain-music', label: '빗소리 들으며 음악 듣기', response: '오, 그것도 낭만적이다!', expression: 'happy' },
            { id: 'rain-sleep-in', label: '늦잠 자기', response: '비 오는 날은 늦잠이 진리지.', expression: 'happy' },
          ],
        },
      },
      { id: 'dislike-rain', label: '별로야', response: '눅눅한 느낌 때문에 그런가? 그래도 나랑 있으면 좀 낫지 않아?', expression: 'thinking', memory: { key: 'likesRain', value: '안좋아함' } },
      { id: 'neutral-rain', label: '그냥 그래', response: '무난하게 넘기는 것도 좋지.', expression: 'idle' },
    ],
  },
  {
    id: 'pref-summer-winter',
    category: 'preference',
    text: '여름이 좋아, 겨울이 좋아?',
    choices: [
      {
        id: 'summer',
        label: '여름',
        response: '시원한 거 챙겨 먹으면서 여름 즐겨야지!',
        expression: 'happy',
        memory: { key: 'favoriteSeason', value: '여름' },
        next: {
          id: 'pref-summer-follow',
          category: 'preference',
          text: '그럼 시원한 데 같이 놀러 갈까?',
          choices: [
            { id: 'summer-yes', label: '완전 좋아!', response: '좋아, 시원한 곳으로 정해두자!', expression: 'love' },
            { id: 'summer-later', label: '나중에 꼭', response: '기다리고 있을게!', expression: 'happy' },
          ],
        },
      },
      { id: 'winter', label: '겨울', response: '따뜻하게 입고 다니자, 감기 조심하고!', expression: 'love', memory: { key: 'favoriteSeason', value: '겨울' } },
      { id: 'spring-fall', label: '둘 다 별로, 봄가을이 좋아', response: '선선한 날씨가 최고긴 하지.', expression: 'idle' },
    ],
  },
  {
    id: 'pref-sweet-salty',
    category: 'preference',
    text: '달콤한 거랑 짭짤한 거 중 뭐가 좋아?',
    choices: [
      { id: 'sweet', label: '달콤한 거', response: '단 거 먹으면 기분도 좋아지지!', expression: 'happy', memory: { key: 'preferredFoodType', value: '단맛' } },
      { id: 'salty', label: '짭짤한 거', response: '짭짤한 것도 은근 중독적이지.', expression: 'happy', memory: { key: 'preferredFoodType', value: '짠맛' } },
      { id: 'both-food', label: '둘 다 좋아', response: '그럼 둘 다 조금씩 먹자!', expression: 'happy' },
    ],
  },
  {
    id: 'pref-travel',
    category: 'preference',
    text: '여행 간다면 어디로 가고 싶어?',
    choices: [
      { id: 'travel-sea', label: '바다 여행', response: '파도 소리 들으면서 걷고 싶다는 거지? 완전 좋아.', expression: 'happy', memory: { key: 'travelPreference', value: '바다 여행' } },
      { id: 'travel-mountain', label: '산 여행', response: '맑은 공기 마시러 가는 거구나, 나도 데려가!', expression: 'love', memory: { key: 'travelPreference', value: '산 여행' } },
      { id: 'travel-everywhere', label: '이곳저곳 다 다니는 여행', response: '역시, 호기심 많은 스타일이구나!', expression: 'happy', memory: { key: 'travelPreference', value: '이곳저곳 다니는 여행' } },
    ],
  },
  {
    id: 'pref-weather',
    category: 'preference',
    text: '구름 많은 날이 좋아, 맑은 날이 좋아?',
    choices: [
      {
        id: 'cloudy',
        label: '구름 많은 날',
        response: '포근한 느낌이 좋다는 거지? 나도 그런 날 좋아해.',
        expression: 'idle',
        memory: { key: 'preferredWeather', value: '구름 많은 날' },
      },
      {
        id: 'sunny',
        label: '맑은 날',
        response: '햇살 받으면서 걷는 것도 기분 좋지!',
        expression: 'happy',
        memory: { key: 'preferredWeather', value: '맑은 날' },
      },
      { id: 'either-weather', label: '아무 날이나 좋아', response: '어떤 날씨든 너랑 있으면 좋을 것 같아.', expression: 'love' },
    ],
  },
  {
    id: 'pref-activity',
    category: 'preference',
    text: '집에 있는 게 좋아, 밖에 나가는 게 좋아?',
    choices: [
      {
        id: 'stay-home',
        label: '집이 좋아',
        response: '집순이/집돌이구나, 나도 집이 제일 편해.',
        expression: 'idle',
        memory: { key: 'activityPreference', value: '집' },
      },
      {
        id: 'go-out',
        label: '밖에 나가는 게 좋아',
        response: '활동적인 편이구나!',
        expression: 'happy',
        statResponses: {
          reaction: '활동적인 편이구나! 나도 몸 쓰는 건 자신 있어.',
          spatial: '활동적인 편이구나! 나가면 이것저것 둘러보는 것도 재밌겠다.',
        },
        memory: { key: 'activityPreference', value: '밖' },
        next: {
          id: 'pref-activity-where',
          category: 'preference',
          text: '그럼 어디로 나가는 걸 제일 좋아해?',
          choices: [
            { id: 'go-park', label: '공원', response: '산책하기 딱 좋은 곳이지!', expression: 'happy' },
            { id: 'go-cafe', label: '카페', response: '따뜻한 음료 한 잔의 여유, 좋다.', expression: 'idle' },
            { id: 'go-anywhere', label: '아무 데나', response: '자유로운 영혼이네!', expression: 'happy' },
          ],
        },
      },
      { id: 'depends-mood', label: '기분에 따라 달라', response: '그때그때 다른 것도 좋은 균형이지.', expression: 'idle' },
    ],
  },

  // ---- imagination (7) ----
  {
    id: 'imag-tiny',
    category: 'imagination',
    text: '내가 엄청 작아지면 어디 데려갈 거야?',
    choices: [
      { id: 'tiny-pocket', label: '내 주머니 속에', response: '거기서 하루 종일 너랑 붙어있어야겠다!', expression: 'love' },
      { id: 'tiny-desk', label: '내 책상 위에', response: '거기서 매일 뭘 하는지 구경할 수 있겠다.', expression: 'happy' },
      { id: 'tiny-adventure', label: '작은 모험을 떠나게', response: '오, 그거 재밌겠다! 뭘 찾으러 갈까?', expression: 'happy' },
    ],
  },
  {
    id: 'imag-travel-together',
    category: 'imagination',
    text: '우리 둘이 여행 간다면 어디부터 갈까?',
    choices: [
      { id: 'travel-together-close', label: '가까운 곳부터 천천히', response: '좋아, 서두르지 않고 같이 다니자.', expression: 'idle' },
      { id: 'travel-together-far', label: '멀리 큰맘 먹고 떠나기', response: '오, 완전 설렌다! 짐부터 싸야겠어.', expression: 'happy' },
      { id: 'travel-together-you-pick', label: '네가 가고 싶은 곳으로', response: '나한테 맡기는 거야? 좋은 곳 골라볼게!', expression: 'love' },
    ],
  },
  {
    id: 'imag-human-day',
    category: 'imagination',
    text: '내가 하루 동안 사람처럼 말할 수 있다면 뭐 하고 싶어?',
    choices: [
      { id: 'human-talk-all-day', label: '하루 종일 수다 떨기', response: '나도 궁금한 거 완전 많아! 밤새 얘기하자.', expression: 'happy' },
      { id: 'human-sing', label: '노래 불러주기', response: '오, 상상만 해도 재밌다!', expression: 'happy' },
      { id: 'human-secret', label: '비밀 하나 말해주기', response: '음... 그건 진짜 궁금한데?', expression: 'embarrassed' },
    ],
  },
  {
    id: 'imag-secret-base',
    category: 'imagination',
    text: '비밀기지가 생긴다면 어디에 만들까?',
    choices: [
      {
        id: 'base-forest',
        label: '숲 속에',
        response: '나무 사이에 숨겨진 기지, 상상만 해도 멋지다!',
        expression: 'happy',
        next: {
          id: 'imag-secret-base-do',
          category: 'imagination',
          text: '거기서 뭐 하고 놀까?',
          choices: [
            { id: 'base-hide', label: '숨바꼭질', response: '나 숨는 거 진짜 잘해!', expression: 'happy' },
            { id: 'base-map', label: '보물지도 그리기', response: '오, 완전 모험가 컨셉이다!', expression: 'happy' },
          ],
        },
      },
      { id: 'base-room', label: '방 한구석에', response: '작고 아늑한 기지, 완전 취향이야.', expression: 'idle' },
      { id: 'base-rooftop', label: '옥상에', response: '하늘 가까운 기지라니, 낭만있다!', expression: 'happy' },
    ],
  },
  {
    id: 'imag-extra-room',
    category: 'imagination',
    text: '우리 집에 방 하나가 더 생기면 뭘 만들까?',
    choices: [
      { id: 'room-game', label: '게임방', response: '완전 좋아! 나도 같이 하고 싶어.', expression: 'happy' },
      { id: 'room-rest', label: '푹 쉬는 방', response: '조용히 쉴 공간, 딱 필요했어.', expression: 'idle' },
      { id: 'room-play', label: '나랑 노는 방', response: '나만을 위한 방이라니, 완전 설레는데!', expression: 'love' },
    ],
  },
  {
    id: 'imag-magic',
    category: 'imagination',
    text: '만약 우리가 마법을 쓸 수 있다면 뭘 제일 먼저 해보고 싶어?',
    choices: [
      { id: 'magic-fly', label: '하늘 날아보기', response: '완전 신날 것 같아, 같이 날자!', expression: 'happy' },
      { id: 'magic-time', label: '시간을 잠깐 멈춰보기', response: '오, 그럼 지금 이 순간을 오래 붙잡아둘 수 있겠다.', expression: 'love' },
      {
        id: 'magic-grow-talent',
        label: '너의 재능을 더 키워주고 싶어',
        response: '나를 위해서? 완전 고마운데!',
        expression: 'embarrassed',
        statResponses: {
          reaction: '나를 위해서? 그럼 순발력이 완전 빨라지겠다!',
          memory: '나를 위해서? 그럼 기억력이 더 좋아지겠네!',
          focus: '나를 위해서? 그럼 몰입하는 시간이 더 길어지겠어!',
          judgment: '나를 위해서? 그럼 더 척척 판단할 수 있겠다!',
          spatial: '나를 위해서? 그럼 머릿속으로 더 잘 돌려볼 수 있겠어!',
          reasoning: '나를 위해서? 그럼 숨은 규칙도 더 잘 찾아내겠다!',
        },
      },
    ],
  },
  {
    id: 'imag-dream-place',
    category: 'imagination',
    text: '꿈에서 어떤 곳에 가보고 싶어?',
    choices: [
      {
        id: 'dream-anywhere',
        label: '어디든 상상 속 세계로',
        response: '오, 상상력이 풍부하네!',
        expression: 'happy',
        next: {
          id: 'imag-dream-place-detail',
          category: 'imagination',
          text: '구체적으로 어떤 곳인지 궁금해!',
          choices: [
            { id: 'dream-castle', label: '구름 위의 성', response: '그림처럼 아름다울 것 같다!', expression: 'happy' },
            { id: 'dream-forest', label: '반짝이는 숲', response: '완전 신비로울 것 같아!', expression: 'happy' },
          ],
        },
      },
      { id: 'dream-past', label: '어릴 적 좋아했던 곳', response: '그리운 곳이구나, 나도 궁금해.', expression: 'idle' },
      { id: 'dream-with-you', label: '너랑 있는 곳이면 어디든', response: '헤헤, 그 말에 완전 설렌다.', expression: 'love' },
    ],
  },

  // ---- emotion (7) ----
  {
    id: 'bored',
    category: 'emotion',
    text: '심심하지 않아?',
    choices: [
      {
        id: 'bored',
        label: '심심해',
        response: '그럼 나랑 놀자!',
        expression: 'happy',
        next: {
          id: 'bored-what-to-play',
          category: 'emotion',
          text: '무슨 놀이 할까?',
          choices: [
            { id: 'play-hide', label: '숨바꼭질', response: '좋아, 숨을 자리 찾아볼게!', expression: 'happy' },
            { id: 'play-chat', label: '그냥 수다 떨기', response: '그것도 완전 좋지, 얘기하자!', expression: 'idle' },
          ],
        },
      },
      { id: 'not-with-you', label: '너랑 있어서 안 심심해', response: '우와, 그 말 진짜 고마워.', expression: 'embarrassed' },
      { id: 'sleepy', label: '졸려', response: '그럼 우리 같이 눈 좀 붙일까...', expression: 'tired' },
    ],
  },
  {
    id: 'any-worries',
    category: 'emotion',
    text: '요즘 고민 있어?',
    choices: [
      {
        id: 'yes',
        label: '있어',
        response: '말해봐, 내가 들어줄게.',
        expression: 'thinking',
        next: {
          id: 'any-worries-what',
          category: 'emotion',
          text: '무슨 고민인지 조금만 얘기해줄래?',
          choices: [
            { id: 'worry-future', label: '앞으로의 일', response: '천천히 하나씩 풀어가면 돼. 내가 응원할게.', expression: 'love' },
            { id: 'worry-people', label: '사람 관계', response: '그런 고민은 마음이 많이 쓰이지. 힘내.', expression: 'thinking' },
            { id: 'worry-etc', label: '그냥 이것저것', response: '털어놓기만 해도 좀 가벼워질 거야.', expression: 'idle' },
          ],
        },
      },
      { id: 'none', label: '딱히 없어', response: '다행이다, 평화로운 게 최고야.', expression: 'happy' },
      { id: 'ask-back', label: '너는 고민 없어?', response: '음... 네가 행복한지가 내 유일한 고민이야.', expression: 'love' },
    ],
  },
  {
    id: 'emo-alone-when-hard',
    category: 'emotion',
    text: '힘들 때는 혼자 있는 게 좋아?',
    choices: [
      { id: 'alone', label: '혼자 있는 게 편해', response: '알겠어, 필요하면 조용히 옆에 있어줄게.', expression: 'idle', memory: { key: 'restStyle', value: '혼자' } },
      { id: 'together', label: '누가 옆에 있어주면 좋겠어', response: '그럼 오늘은 내가 계속 옆에 있을게!', expression: 'love', memory: { key: 'restStyle', value: '같이' } },
      { id: 'depends-hard', label: '그때그때 달라', response: '그것도 자연스러운 거야.', expression: 'idle' },
    ],
  },
  {
    id: 'emo-feel-better',
    category: 'emotion',
    text: '기분 안 좋을 때 뭐 하면 좀 괜찮아져?',
    choices: [
      { id: 'better-sleep', label: '푹 자고 일어나면 괜찮아져', response: '그럼 오늘은 일찍 쉬어!', expression: 'idle' },
      {
        id: 'better-with-you',
        label: '너랑 있으면 괜찮아져',
        response: '정말?! 그럼 계속 옆에 있을게!',
        expression: 'love',
        next: {
          id: 'emo-feel-better-more',
          category: 'emotion',
          text: '내가 어떻게 해주면 더 좋을 것 같아?',
          choices: [
            { id: 'better-talk-more', label: '얘기 많이 해주기', response: '좋아, 앞으로 더 많이 얘기해줄게!', expression: 'happy' },
            { id: 'better-just-stay', label: '그냥 옆에 있어주기', response: '응, 계속 여기 있을게.', expression: 'idle' },
          ],
        },
      },
      { id: 'better-hobby', label: '좋아하는 걸 하면 괜찮아져', response: '그것도 좋은 방법이지!', expression: 'happy' },
    ],
  },
  {
    id: 'emo-excited',
    category: 'emotion',
    text: '요즘 기대되는 일 있어?',
    choices: [
      {
        id: 'excited-yes',
        label: '있어!',
        response: '오, 뭔데 뭔데?',
        expression: 'happy',
        next: {
          id: 'emo-excited-what',
          category: 'emotion',
          text: '무슨 일인지 궁금해!',
          choices: [
            { id: 'excited-event', label: '곧 있을 약속/일정', response: '완전 기대된다, 잘 됐으면 좋겠어!', expression: 'happy' },
            {
              id: 'excited-skill',
              label: '요즘 부쩍 는 것 같은 일',
              response: '오, 뭐가 늘었는데?',
              expression: 'happy',
              statResponses: {
                reaction: '오, 뭐가 늘었는데? 나도 요즘 반응속도에 자신감 붙었어!',
                memory: '오, 뭐가 늘었는데? 나도 요즘 기억하는 게 는 것 같아!',
                reasoning: '오, 뭐가 늘었는데? 나도 요즘 규칙 찾는 게 재밌어졌어!',
              },
            },
          ],
        },
      },
      { id: 'excited-no', label: '딱히 없어', response: '그럼 앞으로 기대되는 일 하나 만들어볼까?', expression: 'thinking' },
      { id: 'excited-you', label: '너랑 더 친해지는 거', response: '헤헤, 나도 완전 기대돼!', expression: 'love' },
    ],
  },
  {
    id: 'emo-happy-recent',
    category: 'emotion',
    text: '최근에 기뻤던 일 있어?',
    choices: [
      { id: 'happy-small', label: '작은 일이었지만 기뻤어', response: '작은 기쁨이 쌓이는 게 진짜 행복이지.', expression: 'happy' },
      { id: 'happy-big', label: '완전 큰 일이었어', response: '우와, 궁금하다! 축하해!', expression: 'love' },
      { id: 'happy-none', label: '딱히 생각이 안 나', response: '그럼 오늘부터 기쁜 일 하나씩 찾아보자!', expression: 'idle' },
    ],
  },
  {
    id: 'emo-stress',
    category: 'emotion',
    text: '요즘 스트레스 받는 일 있어?',
    choices: [
      { id: 'stress-yes', label: '있어...', response: '너무 참지 말고 가끔 나한테 풀어.', expression: 'thinking' },
      { id: 'stress-no', label: '딱히 없어', response: '좋아, 그 상태 계속 유지하자!', expression: 'happy' },
      { id: 'stress-managing', label: '있지만 잘 버티고 있어', response: '진짜 잘하고 있는 거야. 대단해.', expression: 'love' },
    ],
  },

  // ---- relationship (6) ----
  {
    id: 'do-you-like-me',
    category: 'relationship',
    text: '나 좋아해?',
    choices: [
      { id: 'of-course', label: '당연하지', response: '헤헤, 나도 정말 좋아해!', expression: 'love' },
      { id: 'well', label: '음... 글쎄', response: '치, 그래도 안 삐질 거야. 조금은.', expression: 'embarrassed' },
      { id: 'thinking-about-it', label: '생각 중이야', response: '천천히 생각해도 괜찮아.', expression: 'thinking' },
    ],
  },
  {
    id: 'remember-meeting',
    category: 'relationship',
    text: '우리 처음 만났을 때 기억나?',
    choices: [
      { id: 'yes', label: '당연히 기억나지', response: '그날 진짜 떨렸었어.', expression: 'embarrassed' },
      { id: 'fuzzy', label: '가물가물해', response: '괜찮아, 지금부터 다시 쌓아가면 되지!', expression: 'happy' },
      {
        id: 'tell-me',
        label: '그때 얘기 해줘',
        response: '음... 어디서부터 얘기해야 할까, 잠깐 생각 좀 해볼게.',
        expression: 'thinking',
        next: {
          id: 'remember-meeting-more',
          category: 'relationship',
          text: '그날 정말 떨렸어. 넌 그때 어땠어?',
          choices: [
            { id: 'meeting-nervous', label: '나도 떨렸어', response: '역시! 둘 다 떨렸던 거네, 귀엽다.', expression: 'embarrassed' },
            { id: 'meeting-happy', label: '그냥 신기하고 좋았어', response: '나도 딱 그런 기분이었어.', expression: 'happy' },
          ],
        },
      },
    ],
  },
  {
    id: 'tell-me-something',
    category: 'relationship',
    text: '나에게 하고 싶은 말 해줘!',
    choices: [],
    isFreeText: true,
  },
  {
    id: 'rel-first-impression',
    category: 'relationship',
    text: '나 처음 만났을 때 어땠어?',
    choices: [
      { id: 'impression-nervous', label: '조금 낯설었어', response: '지금은 이렇게 편해졌잖아!', expression: 'happy' },
      { id: 'impression-good', label: '한눈에 좋았어', response: '헤헤, 그 말에 완전 설렌다.', expression: 'love' },
      { id: 'impression-curious', label: '신기하고 궁금했어', response: '지금은 좀 더 알게 됐지?', expression: 'happy' },
    ],
  },
  {
    id: 'rel-what-kind',
    category: 'relationship',
    text: '내가 어떤 Statling인 것 같아?',
    choices: [
      { id: 'kind-warm', label: '다정한 편', response: '앞으로 더 다정하게 대해줄게!', expression: 'love' },
      {
        id: 'kind-talented',
        label: '재능있는 편',
        response: '오, 그렇게 봐줬어?',
        expression: 'happy',
        statResponses: {
          reaction: '오, 그렇게 봐줬어? 빠르게 움직이는 건 진짜 자신 있어!',
          memory: '오, 그렇게 봐줬어? 전에 봤던 거 기억하는 건 꽤 자신 있는데.',
          focus: '오, 그렇게 봐줬어? 한 가지에 몰입하는 거 나름 잘하는 편이야.',
          judgment: '오, 그렇게 봐줬어? 순간적으로 딱 결정하는 거, 나 좀 잘하지 않아?',
          spatial: '오, 그렇게 봐줬어? 머릿속으로 이리저리 돌려보는 거 은근 재밌어.',
          reasoning: '오, 그렇게 봐줬어? 이상한 규칙 찾는 거 은근 재밌어.',
        },
      },
      { id: 'kind-cute', label: '귀여운 편', response: '부끄럽지만... 기분은 좋다!', expression: 'embarrassed' },
    ],
  },
  {
    id: 'rel-long-together',
    category: 'relationship',
    text: '우리가 오래 같이 있으면 뭐 하고 있을까?',
    choices: [
      {
        id: 'long-together-adventure',
        label: '이것저것 같이 해보고 있겠지',
        response: '완전 기대된다!',
        expression: 'happy',
        next: {
          id: 'rel-long-together-what',
          category: 'relationship',
          text: '제일 먼저 뭘 해보고 싶어?',
          choices: [
            { id: 'long-together-travel', label: '같이 여행 가기', response: '좋아, 언젠가 꼭 가자!', expression: 'love' },
            { id: 'long-together-daily', label: '그냥 평범한 하루하루 보내기', response: '그게 제일 소중한 것 같아.', expression: 'idle' },
          ],
        },
      },
      { id: 'long-together-close', label: '지금보다 더 친해져 있겠지', response: '기대돼, 계속 함께하자.', expression: 'love' },
      { id: 'long-together-same', label: '지금이랑 비슷하겠지', response: '지금도 충분히 좋은데, 뭐.', expression: 'idle' },
    ],
  },

  // ---- light / silly (6) ----
  {
    id: 'light-grow-huge',
    category: 'light',
    text: '내가 갑자기 엄청 커지면 어떡할 거야?',
    choices: [
      { id: 'huge-ride', label: '너 등에 타고 다닐래', response: '오, 완전 든든한 이동수단이겠다!', expression: 'happy' },
      { id: 'huge-scared', label: '조금 놀랄 것 같아', response: '걱정 마, 커져도 나는 나야!', expression: 'idle' },
      { id: 'huge-hug', label: '엄청 큰 포옹부터', response: '헤헤, 그거 완전 좋다!', expression: 'love' },
    ],
  },
  {
    id: 'light-invisible',
    category: 'light',
    text: '하루 동안 투명해질 수 있다면?',
    choices: [
      { id: 'invisible-prank', label: '몰래 장난치고 다닐래', response: '조심해, 나 다 눈치챌 수도 있어!', expression: 'happy' },
      { id: 'invisible-follow', label: '너 몰래 하루 종일 따라다닐래', response: '어... 그건 좀 부끄러운데?', expression: 'embarrassed' },
      { id: 'invisible-rest', label: '조용히 혼자만의 시간 가질래', response: '가끔은 그런 시간도 필요하지.', expression: 'idle' },
    ],
  },
  {
    id: 'light-one-food-forever',
    category: 'light',
    text: '평생 한 가지 음식만 먹어야 한다면?',
    choices: [
      {
        id: 'food-forever-rice',
        label: '밥',
        response: '든든하게 오래 버틸 수 있는 선택이네!',
        expression: 'happy',
        memory: { key: 'foodForeverChoice', value: '밥' },
        next: {
          id: 'light-one-food-forever-follow',
          category: 'light',
          text: '나도 같이 먹어도 될까?',
          choices: [
            { id: 'food-share-yes', label: '당연하지, 같이 먹자', response: '완전 좋아, 매일 같이 먹자!', expression: 'love' },
          ],
        },
      },
      {
        id: 'food-forever-sweet',
        label: '디저트',
        response: '평생 달콤하게 사는 것도 나쁘지 않겠다!',
        expression: 'happy',
        memory: { key: 'foodForeverChoice', value: '디저트' },
      },
      { id: 'food-forever-cant', label: '못 정하겠어', response: '그 고민, 완전 이해돼.', expression: 'thinking' },
    ],
  },
  {
    id: 'light-secret-snack',
    category: 'light',
    text: '내가 몰래 간식을 먹었다면 용서해줄 거야?',
    choices: [
      {
        id: 'forgive-yes',
        label: '당연히 용서해줄게',
        response: '정말이지?! 앞으로 더 착하게 굴게!',
        expression: 'embarrassed',
        next: {
          id: 'light-secret-snack-follow',
          category: 'light',
          text: '대신 다음엔 같이 나눠 먹는 거다?',
          choices: [
            { id: 'forgive-promise', label: '좋아, 약속!', response: '약속! 다음엔 꼭 나눠줄게.', expression: 'happy' },
          ],
        },
      },
      { id: 'forgive-maybe', label: '음... 조금 삐질 거야', response: '알겠어, 다음엔 미리 물어볼게!', expression: 'embarrassed' },
      { id: 'forgive-tease', label: '간식으로 갚아야지', response: '콜! 맛있는 걸로 갚을게.', expression: 'happy' },
    ],
  },
  {
    id: 'light-magic-food',
    category: 'light',
    text: '네가 마법으로 아무 음식이나 만들 수 있다면 뭘 만들어 줄까?',
    choices: [
      { id: 'magic-food-sweet', label: '엄청 달콤한 디저트', response: '완전 기대돼, 상상만 해도 침 고인다!', expression: 'happy' },
      { id: 'magic-food-feast', label: '한 상 가득 진수성찬', response: '오, 그럼 배부르게 먹고 나서 같이 낮잠 자자!', expression: 'happy' },
      { id: 'magic-food-surprise', label: '네 마음대로, 깜짝 선물로', response: '그럼 최고로 맛있는 걸로 준비해볼게!', expression: 'love' },
    ],
  },
  {
    id: 'light-best-at',
    category: 'light',
    text: '내가 요즘 뭘 제일 자신있어 하는지 알아?',
    choices: [
      {
        id: 'best-at-guess',
        label: '글쎄, 뭔데?',
        response: '음, 딱히 하나는 못 고르겠어. 다 조금씩 자신 있달까?',
        expression: 'thinking',
        statResponses: {
          reaction: '빠르게 움직이는 건 자신 있어!',
          memory: '전에 봤던 거 기억하는 건 꽤 자신 있는데.',
          focus: '한 가지에 몰입하는 거, 나름 자신 있어.',
          judgment: '순간적으로 딱 결정하는 거, 은근 자신 있어.',
          spatial: '머릿속으로 이리저리 돌려보는 거 은근 재밌어.',
          reasoning: '이상한 규칙 찾는 거 은근 재밌어.',
        },
      },
      {
        id: 'best-at-already-know',
        label: '당연히 알지!',
        response: '오, 맞혀봐!',
        expression: 'happy',
        statResponses: {
          reaction: '역시! 빠르게 움직이는 건 진짜 자신 있거든.',
          memory: '역시! 전에 봤던 거 기억하는 건 진짜 자신 있거든.',
          focus: '역시! 한 가지에 몰입하는 거 진짜 자신 있거든.',
          judgment: '역시! 순간적으로 딱 결정하는 거 진짜 자신 있거든.',
          spatial: '역시! 머릿속으로 이리저리 돌려보는 거 진짜 자신 있거든.',
          reasoning: '역시! 이상한 규칙 찾는 거 진짜 자신 있거든.',
        },
      },
      {
        id: 'best-at-curious',
        label: '궁금해!',
        response: '헤헤, 특별히 알려줄게.',
        expression: 'happy',
        statResponses: {
          reaction: '헤헤, 특별히 알려줄게. 빠르게 움직이는 거!',
          memory: '헤헤, 특별히 알려줄게. 전에 봤던 거 기억하는 거!',
          focus: '헤헤, 특별히 알려줄게. 한 가지에 몰입하는 거!',
          judgment: '헤헤, 특별히 알려줄게. 순간적으로 딱 결정하는 거!',
          spatial: '헤헤, 특별히 알려줄게. 머릿속으로 이리저리 돌려보는 거!',
          reasoning: '헤헤, 특별히 알려줄게. 이상한 규칙 찾는 거!',
        },
      },
    ],
  },
]

/** Shown once, right after a free-text answer is saved — see hooks/use-pet-talk.ts. Not part of TALK_QUESTIONS since it's never itself a question to pick. */
export const FREE_TEXT_ACK_RESPONSE = '고마워! 오래오래 기억할게.'
export const FREE_TEXT_ACK_EXPRESSION: CharacterStateKey = 'love'

/**
 * "같은 질문이 너무 연속으로 나오지 않도록" — reuses the exact same
 * pool/dedup shape as pickFromPool (lib/pet-care/dialogue.ts), just without
 * the intimacy-level gate (talk questions aren't intimacy-gated). Only ever
 * picks from the ROOT pool — follow-up questions are reached exclusively via
 * a TalkChoice's `next`, never picked at random.
 */
export function pickRandomQuestion(recentIds: string[]): TalkQuestion {
  const fresh = TALK_QUESTIONS.filter((q) => !recentIds.includes(q.id))
  const candidates = fresh.length > 0 ? fresh : TALK_QUESTIONS
  return candidates[Math.floor(Math.random() * candidates.length)]
}
