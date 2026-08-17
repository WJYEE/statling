const ARCHIEVE_BASE_PATH = '/assets/statling/audio/bgm/Archieve'
const DEFAULT_BASE_PATH = '/assets/statling/audio/bgm/default'

function archieveSrc(file: string): string {
  return `${ARCHIEVE_BASE_PATH}/${file}`
}

export const MAIN_THEME_TRACK_ID = 'main-theme'

/**
 * 30 rotation tracks from public/assets/statling/audio/bgm/Archieve, plus the
 * dedicated Main Theme (a separate file under .../bgm/default). `id` is
 * derived from each file's embedded "(BGM NN)" track number so it stays
 * stable even if a title gets retouched later; `title` strips that numbering
 * for display. `as const` gives every id a literal type, so BgmTrackId below
 * is a real 31-member union instead of a bare `string` — see
 * hooks/use-bgm.ts / bgm-settings-storage.ts for how it's validated at the
 * localStorage boundary.
 */
export const BGM_TRACKS = [
  { id: MAIN_THEME_TRACK_ID, title: 'A New Beginning (Main Theme)', src: `${DEFAULT_BASE_PATH}/A New Beginning (Main Theme).mp3` },
  { id: 'bgm-01', title: 'Puddle Hop', src: archieveSrc('1)Puddle Hop (BGM 01).mp3') },
  { id: 'bgm-02', title: 'Hidden Pathway', src: archieveSrc('2.Hidden Pathway (BGM 02).mp3') },
  { id: 'bgm-03', title: 'Breezy Path', src: archieveSrc('3)Breezy Path (BGM 03).mp3') },
  { id: 'bgm-04', title: 'Glowing Night Friends', src: archieveSrc('4)Glowing Night Friends (BGM 04).mp3') },
  { id: 'bgm-05', title: "Tomorrow's Promise", src: archieveSrc("5)Tomorrow's Promise (BGM 05).mp3") },
  { id: 'bgm-06', title: 'Morning High-Five', src: archieveSrc('6)Morning High-Five (BGM 06).mp3') },
  { id: 'bgm-07', title: 'Busy Cave Trot', src: archieveSrc('7)Busy Cave Trot (BGM 07).mp3') },
  { id: 'bgm-08', title: 'Toy Soldier Quest', src: archieveSrc('8)Toy Soldier Quest (BGM 08).mp3') },
  { id: 'bgm-09', title: 'Following the Fin', src: archieveSrc('9)Following the Fin (BGM 09).mp3') },
  { id: 'bgm-10', title: 'The Sleeping Titan', src: archieveSrc('10)The Sleeping Titan (BGM 10).mp3') },
  { id: 'bgm-11', title: 'Glade Serenade', src: archieveSrc('11)Glade Serenade (BGM 11).mp3') },
  { id: 'bgm-12', title: 'Home, Sweet Home', src: archieveSrc('12)Home, Sweet Home (BGM 12).mp3') },
  { id: 'bgm-13', title: 'Joyful Omen', src: archieveSrc('13)Joyful Omen (BGM 13).mp3') },
  { id: 'bgm-14', title: 'Silent Temple Haven', src: archieveSrc('14)Silent Temple Haven (BGM 14).mp3') },
  { id: 'bgm-15', title: 'Ocean Stone Hop', src: archieveSrc('15)Ocean Stone Hop (BGM 15).mp3') },
  { id: 'bgm-16', title: 'Pixel Wonderland', src: archieveSrc('16)Pixel Wonderland (BGM 16).mp3') },
  { id: 'bgm-17', title: 'First Step into the Wild', src: archieveSrc('17)First Step into the Wild (BGM 17).mp3') },
  { id: 'bgm-18', title: 'Peaceful Winter Night', src: archieveSrc('18)Peaceful Winter Night (BGM 18).mp3') },
  { id: 'bgm-19', title: 'Jungle Marimba Festival', src: archieveSrc('19)Jungle Marimba Festival (BGM 19).mp3') },
  { id: 'bgm-20', title: 'Moonlit Lullaby', src: archieveSrc('20)Moonlit Lullaby (BGM 20).mp3') },
  { id: 'bgm-21', title: 'Fairy Cave Chimes', src: archieveSrc('21)Fairy Cave Chimes (BGM 21).mp3') },
  { id: 'bgm-22', title: 'Silent Cavern Lake', src: archieveSrc('22)Silent Cavern Lake (BGM 22).mp3') },
  { id: 'bgm-23', title: 'Under the Leaf Umbrella', src: archieveSrc('23)Under the Leaf Umbrella (BGM 23).mp3') },
  { id: 'bgm-24', title: 'Rainy Doorstep', src: archieveSrc('24)Rainy Doorstep (BGM 24).mp3') },
  { id: 'bgm-25', title: 'Peaceful Pillow', src: archieveSrc('25)Peaceful Pillow (BGM 25).mp3') },
  { id: 'bgm-26', title: 'Curtain Call for Toys', src: archieveSrc('26)Curtain Call for Toys (BGM 26).mp3') },
  { id: 'bgm-27', title: 'Twinkling Prankster', src: archieveSrc('27)Twinkling Prankster (BGM 27).mp3') },
  { id: 'bgm-28', title: 'Hopeful Steps', src: archieveSrc('28)Hopeful Steps (BGM 28).mp3') },
  { id: 'bgm-29', title: 'Stick Sword Hero', src: archieveSrc('29)Stick Sword Hero (BGM 29).mp3') },
  { id: 'bgm-30', title: "Hero's Folktale", src: archieveSrc('30)Hero’s Folktale (BGM 30).mp3') },
  { id: 'bgm-31', title: "Bard's Flute Melody", src: archieveSrc('31)Bard’s Flute Melody (BGM 31).mp3') },
  { id: 'bgm-32', title: 'Sunny Afternoon Tea', src: archieveSrc('32)Sunny Afternoon Tea (BGM 32).mp3') },
  { id: 'bgm-33', title: 'Creaky Synth & Pinecones', src: archieveSrc('33)Creaky Synth & Pinecones (BGM 33).mp3') },
  { id: 'bgm-34', title: 'Twisted & Bouncy', src: archieveSrc('34)Twisted & Bouncy (BGM 34).mp3') },
  { id: 'bgm-35', title: 'Final Sunset & Memories', src: archieveSrc('35)Final Sunset & Memories (BGM 35).mp3') },
  { id: 'bgm-36', title: 'Wood Soup & Rolling Acorns', src: archieveSrc('36)Wood Soup & Rolling Acorns (BGM 36).mp3') },
  { id: 'bgm-37', title: 'The Lonely Guitarist', src: archieveSrc('37)The Lonely Guitarist (BGM 37).mp3') },
  { id: 'bgm-38', title: 'Sea of Lanterns', src: archieveSrc('38)Sea of Lanterns (BGM 38).mp3') },
  { id: 'bgm-39', title: 'Evening Storytime', src: archieveSrc('39)Evening Storytime (BGM 39).mp3') },
  { id: 'bgm-40', title: 'First Stop, Grand City', src: archieveSrc('40)First Stop, Grand City (BGM 40).mp3') },
  { id: 'bgm-41', title: "Jester's Town", src: archieveSrc("41)Jester's Town (BGM 41).mp3") },
  { id: 'bgm-42', title: 'Sparkling Contest', src: archieveSrc('42)Sparkling Contest (BGM 42).mp3') },
] as const

export type BgmTrack = (typeof BGM_TRACKS)[number]
export type BgmTrackId = BgmTrack['id']

export const BGM_TRACK_MAP: ReadonlyMap<BgmTrackId, BgmTrack> = new Map(BGM_TRACKS.map((track) => [track.id, track]))

export const ALL_BGM_TRACK_IDS: BgmTrackId[] = BGM_TRACKS.map((track) => track.id)

export const DEFAULT_BGM_TRACK_ID: BgmTrackId = MAIN_THEME_TRACK_ID

/** Sits noticeably under SFX (0.25~0.55, see audio-config.ts) so it never competes with a game sound. */
export const DEFAULT_BGM_VOLUME = 0.22
