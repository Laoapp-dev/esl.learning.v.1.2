import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { VocabularyWord, CEFRLevel, StudySession, UserProfile, AppSettings, FilterLevel, SortOption, Achievement } from '@/types/vocabulary';
import { idbGet, idbSet, idbDelete } from '@/lib/idbStore';

function makeStorageKeys(prefix?: string) {
  const p = prefix || 'lexicon';
  return {
    words: `${p}_words`,
    sessions: `${p}_sessions`,
    profile: `${p}_profile`,
    settings: `${p}_settings`,
    achievements: `${p}_achievements`,
  };
}

// Keep for backward compat (unused now)
const STORAGE_KEYS = makeStorageKeys();

const DEFAULT_PROFILE: UserProfile = {
  username: 'Learner',
  email: '',
  cefrLevel: 'A2',
  dailyGoal: 10,
  joinDate: new Date().toISOString(),
  currentStreak: 0,
  longestStreak: 0,
};

const DEFAULT_SETTINGS: AppSettings = {
  showTranslations: true,
  autoPlayPronunciation: false,
  shuffleCards: true,
  showHints: true,
  theme: 'light',
  fontSize: 'medium',
  googleSheetUrl: '',
  autoSync: false,
};

const INITIAL_WORDS: VocabularyWord[] = [
  {
    id: uuidv4(),
    word: 'Serendipity',
    partOfSpeech: 'noun',
    definition: 'The occurrence of events by chance in a happy or beneficial way',
    exampleSentence: 'Finding this restaurant was pure serendipity.',
    synonym: 'chance, luck',
    antonym: 'misfortune',
    cefrLevel: 'C1',
    category: 'Abstract Nouns',
    dateAdded: new Date().toISOString(),
    studyCount: 3,
    correctCount: 2,
    isStarred: true,
    isLearned: false,
    difficulty: 'medium',
  },
  {
    id: uuidv4(),
    word: 'Ephemeral',
    partOfSpeech: 'adjective',
    definition: 'Lasting for a very short time',
    exampleSentence: 'Fashions are ephemeral; trends come and go overnight.',
    synonym: 'transient, fleeting',
    antonym: 'permanent, eternal',
    cefrLevel: 'C1',
    category: 'Describing Time',
    dateAdded: new Date(Date.now() - 86400000).toISOString(),
    studyCount: 5,
    correctCount: 4,
    isStarred: false,
    isLearned: true,
    difficulty: 'medium',
  },
  {
    id: uuidv4(),
    word: 'Ubiquitous',
    partOfSpeech: 'adjective',
    definition: 'Present, appearing, or found everywhere',
    exampleSentence: 'Smartphones have become ubiquitous in modern society.',
    synonym: 'omnipresent, pervasive',
    antonym: 'rare, scarce',
    cefrLevel: 'C1',
    category: 'Describing Presence',
    dateAdded: new Date(Date.now() - 172800000).toISOString(),
    studyCount: 2,
    correctCount: 1,
    isStarred: true,
    isLearned: false,
    difficulty: 'hard',
  },
  {
    id: uuidv4(),
    word: 'Resilience',
    partOfSpeech: 'noun',
    definition: 'The capacity to recover quickly from difficulties; toughness',
    exampleSentence: 'Her resilience in the face of adversity was inspiring.',
    synonym: 'toughness, flexibility',
    antonym: 'fragility, weakness',
    cefrLevel: 'B2',
    category: 'Personal Qualities',
    dateAdded: new Date(Date.now() - 259200000).toISOString(),
    studyCount: 4,
    correctCount: 4,
    isStarred: false,
    isLearned: true,
    difficulty: 'medium',
  },
  {
    id: uuidv4(),
    word: 'Eloquent',
    partOfSpeech: 'adjective',
    definition: 'Fluent or persuasive in speaking or writing',
    exampleSentence: 'She gave an eloquent speech that moved the audience.',
    synonym: 'articulate, expressive',
    antonym: 'inarticulate, hesitant',
    cefrLevel: 'B2',
    category: 'Communication',
    dateAdded: new Date(Date.now() - 345600000).toISOString(),
    studyCount: 6,
    correctCount: 5,
    isStarred: true,
    isLearned: true,
    difficulty: 'easy',
  },
  {
    id: uuidv4(),
    word: 'Pragmatic',
    partOfSpeech: 'adjective',
    definition: 'Dealing with things sensibly and realistically',
    exampleSentence: 'We need a pragmatic approach to solve this problem.',
    synonym: 'practical, realistic',
    antonym: 'idealistic, impractical',
    cefrLevel: 'B2',
    category: 'Describing People',
    dateAdded: new Date(Date.now() - 432000000).toISOString(),
    studyCount: 3,
    correctCount: 3,
    isStarred: false,
    isLearned: true,
    difficulty: 'easy',
  },
  {
    id: uuidv4(),
    word: 'Ambiguous',
    partOfSpeech: 'adjective',
    definition: 'Open to more than one interpretation; having a double meaning',
    exampleSentence: 'The contract was ambiguous about payment terms.',
    synonym: 'unclear, vague',
    antonym: 'clear, explicit',
    cefrLevel: 'B1',
    category: 'Communication',
    dateAdded: new Date(Date.now() - 518400000).toISOString(),
    studyCount: 7,
    correctCount: 6,
    isStarred: false,
    isLearned: true,
    difficulty: 'medium',
  },
  {
    id: uuidv4(),
    word: 'Candid',
    partOfSpeech: 'adjective',
    definition: 'Truthful and straightforward; frank',
    exampleSentence: 'She was candid about her reasons for leaving.',
    synonym: 'honest, frank',
    antonym: 'evasive, dishonest',
    cefrLevel: 'B1',
    category: 'Describing People',
    dateAdded: new Date(Date.now() - 604800000).toISOString(),
    studyCount: 2,
    correctCount: 2,
    isStarred: false,
    isLearned: true,
    difficulty: 'easy',
  },
  {
    id: uuidv4(),
    word: 'Diligent',
    partOfSpeech: 'adjective',
    definition: 'Having or showing care and conscientiousness in work or duties',
    exampleSentence: 'He was a diligent student who always completed his assignments.',
    synonym: 'hardworking, industrious',
    antonym: 'lazy, negligent',
    cefrLevel: 'A2',
    category: 'Personal Qualities',
    dateAdded: new Date(Date.now() - 691200000).toISOString(),
    studyCount: 8,
    correctCount: 7,
    isStarred: true,
    isLearned: true,
    difficulty: 'easy',
  },
  {
    id: uuidv4(),
    word: 'Gratitude',
    partOfSpeech: 'noun',
    definition: 'The quality of being thankful; readiness to show appreciation',
    exampleSentence: 'She expressed her gratitude for all the help she received.',
    synonym: 'thankfulness, appreciation',
    antonym: 'ingratitude, ungratefulness',
    cefrLevel: 'A2',
    category: 'Emotions',
    dateAdded: new Date(Date.now() - 777600000).toISOString(),
    studyCount: 5,
    correctCount: 5,
    isStarred: false,
    isLearned: true,
    difficulty: 'easy',
  },
  {
    id: uuidv4(),
    word: 'Nostalgia',
    partOfSpeech: 'noun',
    laoTranslation: 'ຄວາມຄິດຮອດ',
    thaiTranslation: 'ความคิดถึง',
    definition: 'A sentimental longing for the past',
    exampleSentence: 'Looking at old photos filled her with nostalgia.',
    synonym: 'remembrance, longing',
    antonym: '',
    cefrLevel: 'B1',
    category: 'Emotions',
    dateAdded: new Date(Date.now() - 86400000 * 2).toISOString(),
    studyCount: 1,
    correctCount: 1,
    isStarred: false,
    isLearned: false,
    difficulty: 'medium',
  },
  {
    id: uuidv4(),
    word: 'Meticulous',
    partOfSpeech: 'adjective',
    laoTranslation: 'ລະອຽດລະອຽດ',
    thaiTranslation: 'พิถีพิถัน',
    definition: 'Showing great attention to detail; very careful and precise',
    exampleSentence: 'The research was conducted with meticulous care.',
    synonym: 'precise, thorough',
    antonym: 'careless, sloppy',
    cefrLevel: 'C1',
    category: 'Describing People',
    dateAdded: new Date(Date.now() - 86400000 * 3).toISOString(),
    studyCount: 0,
    correctCount: 0,
    isStarred: false,
    isLearned: false,
    difficulty: 'hard',
  },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word', name: 'First Word', description: 'Add your first word', icon: 'badge-first-word', isUnlocked: true, unlockedDate: new Date().toISOString(), condition: 'word_count', threshold: 1 },
  { id: 'word_collector_10', name: 'Word Collector', description: 'Add 10 words', icon: 'badge-word-collector', isUnlocked: true, unlockedDate: new Date().toISOString(), condition: 'word_count', threshold: 10 },
  { id: 'word_collector_50', name: 'Vocabulary Builder', description: 'Add 50 words', icon: 'badge-vocab-builder', isUnlocked: false, condition: 'word_count', threshold: 50 },
  { id: 'word_collector_100', name: 'Word Master', description: 'Add 100 words', icon: 'badge-master-100', isUnlocked: false, condition: 'word_count', threshold: 100 },
  { id: 'streak_7', name: 'Week Warrior', description: 'Study 7 days in a row', icon: 'badge-streak-7', isUnlocked: false, condition: 'streak', threshold: 7 },
  { id: 'streak_30', name: 'Month Master', description: 'Study 30 days in a row', icon: 'badge-streak-30', isUnlocked: false, condition: 'streak', threshold: 30 },
  { id: 'master_50', name: 'Half Century', description: 'Master 50 words', icon: 'badge-half-century', isUnlocked: false, condition: 'master', threshold: 50 },
  { id: 'quiz_perfect', name: 'Perfect Score', description: 'Get 100% on a quiz', icon: 'badge-quiz-perfect', isUnlocked: false, condition: 'quiz', threshold: 100 },
  { id: 'import_pro', name: 'Import Pro', description: 'Import words from CSV', icon: 'badge-import-pro', isUnlocked: false, condition: 'import', threshold: 1 },
  { id: 'review_100', name: 'Reviewer', description: 'Review 100 words', icon: 'badge-reviewer', isUnlocked: false, condition: 'review', threshold: 100 },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Defensive sanitizer for any array of "word-like" objects coming from
 * localStorage, Google Sheets, GitHub, or CSV import.
 *
 * ROOT CAUSE OF THE "Cannot read properties of null (reading 'word')" CRASH:
 * every one of those sources can — through an old app version, a corrupted
 * localStorage write, a half-finished sync, or a malformed CSV row — end up
 * with a `null`/`undefined` element sitting in an otherwise valid array.
 * Every place in the app that later does `words.map(w => w.word)` (Quiz,
 * Flashcards, Matching, Dashboard, WordList, …) then throws the instant it
 * hits that hole, which crashes the whole render tree and trips the
 * ErrorBoundary. Filtering the array once, right where it enters app state,
 * makes every downstream `.word` access safe without having to defensively
 * guard dozens of call sites individually.
 */
function coerceWord(w: any): VocabularyWord {
  return {
    ...w,
    word: String(w.word),
    definition: typeof w.definition === 'string' ? w.definition : '',
    exampleSentence: typeof w.exampleSentence === 'string' ? w.exampleSentence : '',
    partOfSpeech: w.partOfSpeech || 'noun',
    cefrLevel: w.cefrLevel || 'B1',
    difficulty: w.difficulty || 'medium',
    studyCount: typeof w.studyCount === 'number' ? w.studyCount : 0,
    correctCount: typeof w.correctCount === 'number' ? w.correctCount : 0,
    isStarred: !!w.isStarred,
    isLearned: !!w.isLearned,
    dateAdded: typeof w.dateAdded === 'string' ? w.dateAdded : new Date().toISOString(),
  };
}

function sanitizeWords(arr: unknown): VocabularyWord[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (w): w is Record<string, unknown> =>
        !!w && typeof w === 'object' && typeof (w as any).word === 'string' && (w as any).word.trim() !== ''
    )
    .map(coerceWord);
}

function saveToStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage:`, error);
    return false;
  }
}

// Shared word list key written by Google Sheet sync (admin sets, all users read)
const GS_WORDS_KEY = 'moe_gsheet_words';

/**
 * Pure upsert: merges `incoming` rows into `base` by matching word text
 * (case-insensitive). Existing words are updated in place (content fields
 * only — study progress like studyCount/isStarred/isLearned is preserved).
 * New words are appended. Used by both the on-load cache merge and by
 * mergeSharedWords(), so every sync path in the app behaves identically and
 * nothing can ever be duplicated.
 */
function upsertWords(
  base: VocabularyWord[],
  incoming: Partial<VocabularyWord>[],
  defaultSource: 'shared' | 'manual' = 'shared'
): {
  result: VocabularyWord[]; added: number; updated: number;
} {
  // Defensive: strip any null/undefined/word-less entries before we touch
  // them. This is what prevents "Cannot read properties of null (reading
  // 'word')" — see sanitizeWords() above for the full explanation.
  const safeBase = sanitizeWords(base);
  const safeIncoming = Array.isArray(incoming)
    ? incoming.filter((w): w is Partial<VocabularyWord> => !!w && typeof w === 'object' && !!(w as any).word && String((w as any).word).trim() !== '')
    : [];

  const keyOf = (w: string) => w.toLowerCase().trim();
  const indexByKey = new Map(safeBase.map((w, i) => [keyOf(w.word), i]));
  // Single unified working array — every index ever stored in indexByKey
  // points into THIS array, always. (Previously new words were staged in a
  // separate `toAppend` array while indexByKey recorded positions as if it
  // were already merged with `next`; a word appearing a 3rd+ time in the
  // same import batch would then look up an index past the end of `next`,
  // get `undefined` back, and crash on `existing.source`.)
  const merged: VocabularyWord[] = [...safeBase];
  let added = 0, updated = 0;

  for (const raw of safeIncoming) {
    const w = raw as VocabularyWord;
    if (!w.word || !w.word.trim()) continue;
    const key = keyOf(w.word);
    const idx = indexByKey.get(key);

    if (idx !== undefined) {
      const existing = merged[idx];
      merged[idx] = {
        ...existing,
        word: w.word,
        partOfSpeech: w.partOfSpeech || existing.partOfSpeech,
        definition: w.definition || existing.definition,
        exampleSentence: w.exampleSentence || existing.exampleSentence,
        cefrLevel: w.cefrLevel || existing.cefrLevel,
        difficulty: w.difficulty || existing.difficulty,
        synonym: w.synonym ?? existing.synonym,
        antonym: w.antonym ?? existing.antonym,
        category: w.category ?? existing.category,
        laoTranslation: w.laoTranslation ?? existing.laoTranslation,
        thaiTranslation: w.thaiTranslation ?? existing.thaiTranslation,
        // Never demote a learner's own manually-added word to 'shared' just
        // because an incoming list happens to contain the same word text —
        // that would make a future curriculum reset delete something the
        // learner typed in themselves. Respect the incoming word's own tag
        // when it explicitly says 'manual' too (e.g. round-tripped from a
        // GitHub per-user backup) — either side saying manual wins.
        source: (existing.source === 'manual' || w.source === 'manual') ? 'manual' : (w.source ?? defaultSource),
      };
      updated++;
    } else {
      const stamped: VocabularyWord = {
        word: w.word,
        partOfSpeech: w.partOfSpeech || 'noun',
        definition: w.definition || '',
        exampleSentence: w.exampleSentence || '',
        cefrLevel: w.cefrLevel || 'B1',
        difficulty: w.difficulty || 'medium',
        id: w.id || uuidv4(),
        dateAdded: w.dateAdded || new Date().toISOString(),
        studyCount: 0, correctCount: 0, isStarred: false, isLearned: false,
        source: w.source ?? defaultSource,
        ...(w.synonym && { synonym: w.synonym }),
        ...(w.antonym && { antonym: w.antonym }),
        ...(w.category && { category: w.category }),
        ...(w.laoTranslation && { laoTranslation: w.laoTranslation }),
        ...(w.thaiTranslation && { thaiTranslation: w.thaiTranslation }),
      };
      indexByKey.set(key, merged.length);
      merged.push(stamped);
      added++;
    }
  }

  return { result: added + updated > 0 ? merged : safeBase, added, updated };
}

export function useVocabulary(dataKeyPrefix?: string) {
  const KEYS = useMemo(() => makeStorageKeys(dataKeyPrefix), [dataKeyPrefix]);

  // ── Storage architecture ─────────────────────────────────────────────────
  // Before this, EVERY word — a learner's own additions AND the entire
  // admin-pushed shared curriculum — lived together in one array that got
  // persisted under this user's OWN per-account key (KEYS.words). That meant
  // an 8,000-10,000 word curriculum was duplicated in full into every single
  // account's storage on the same browser (a classroom computer with 5
  // student accounts stored the same curriculum 5 times over). localStorage
  // is only good for ~5-10MB per ORIGIN, shared across every account on that
  // browser — so this reliably ran out ("Couldn't save your words — your
  // browser's storage is full") well before reaching the 8,000-10,000 word
  // scale this app is meant to support.
  //
  // Fix: split into three small, purpose-specific stores instead of one
  // big one:
  //   • manualWords    — words THIS learner typed in themselves. Persisted
  //                       per-account (KEYS.words), but stays small no
  //                       matter how big the curriculum gets.
  //   • sharedContent   — the admin curriculum (word/definition/example/etc).
  //                       Persisted ONCE, origin-wide (GS_WORDS_KEY) — every
  //                       account reads the same copy instead of storing its
  //                       own. This is the piece that actually scales to
  //                       8,000-10,000+ words, and now only exists once.
  //   • sharedProgress  — per-learner study progress (star/learned/study
  //                       count/etc) on curriculum words, keyed by word id.
  //                       Persisted per-account, but only ever holds entries
  //                       for words this learner has actually studied or
  //                       starred — typically a small fraction of the full
  //                       curriculum — so it stays small too.
  // The `words` array this hook returns is still the full combined list
  // (unchanged for every page that reads vocabulary.words), computed from
  // the three stores in memory rather than persisted as one giant blob.
  const initRef = useRef<{ manual: VocabularyWord[]; shared: VocabularyWord[]; legacyShared: VocabularyWord[] } | null>(null);
  function getInitialSplit() {
    if (initRef.current) return initRef.current;

    const rawPersonal = sanitizeWords(loadFromStorage<VocabularyWord[]>(KEYS.words, INITIAL_WORDS));
    // One-time migration for accounts that already have curriculum words
    // duplicated into their personal storage from before this split
    // existed: fold those into the shared store, then drop them from
    // personal storage below so they're never written there again.
    const legacyShared = rawPersonal.filter(w => w.source === 'shared');
    const manual = rawPersonal.filter(w => w.source !== 'shared');

    // Shared curriculum is no longer read here — localStorage has a small,
    // inconsistent per-origin quota (commonly ~5MB, sometimes measured in
    // UTF-16 code units) that caps out around 5,000 richly-tagged words,
    // well short of the 8,000-10,000+ this app is meant to support. It now
    // lives in IndexedDB instead (see the load+migrate effect below), which
    // is inherently asynchronous — so it starts empty here and fills in a
    // moment after mount. `legacyShared` (curriculum words found stuck in
    // personal storage) and any words still saved under the old
    // localStorage GS_WORDS_KEY are both migrated into IndexedDB there.
    initRef.current = { manual, shared: [], legacyShared };
    return initRef.current;
  }

  const [manualWords, setManualWords] = useState<VocabularyWord[]>(() => getInitialSplit().manual);
  const [sharedContent, setSharedContent] = useState<VocabularyWord[]>(() => getInitialSplit().shared);
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [sharedProgress, setSharedProgress] = useState<Record<string, Partial<VocabularyWord> & { hidden?: boolean }>>(() =>
    loadFromStorage<Record<string, Partial<VocabularyWord> & { hidden?: boolean }>>(KEYS.words + '_progress', {})
  );

  const [sessions, setSessions] = useState<StudySession[]>(() =>
    loadFromStorage(KEYS.sessions, [])
  );
  const [profile, setProfile] = useState<UserProfile>(() =>
    loadFromStorage(KEYS.profile, DEFAULT_PROFILE)
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadFromStorage(KEYS.settings, DEFAULT_SETTINGS)
  );
  const [achievements] = useState<Achievement[]>(() =>
    loadFromStorage(KEYS.achievements, ACHIEVEMENTS)
  );

  // ── Load the shared curriculum from IndexedDB (async) ────────────────────
  // Runs once per mount. Also handles one-time migration: any curriculum
  // words still sitting in the OLD localStorage key (from before this
  // moved to IndexedDB) or duplicated into this account's own personal
  // storage (legacyShared, from before the personal/shared split existed)
  // get folded in here, then the old localStorage key is cleared so its
  // quota is freed up for good.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromIdb = await idbGet<VocabularyWord[]>(GS_WORDS_KEY);
      let combined = sanitizeWords(fromIdb ?? []);

      let legacyRaw: string | null = null;
      try { legacyRaw = localStorage.getItem(GS_WORDS_KEY); } catch { /* ignore */ }
      const legacyFromLocalStorage = legacyRaw ? sanitizeWords(JSON.parse(legacyRaw)) : [];

      const { legacyShared } = initRef.current ?? { legacyShared: [] as VocabularyWord[] };
      const toMigrate = [...legacyFromLocalStorage, ...legacyShared];

      if (toMigrate.length > 0) {
        combined = upsertWords(combined, toMigrate, 'shared').result;
      }
      if (cancelled) return;

      setSharedContent(combined);
      setSharedLoaded(true);

      // Persist the migrated/combined result and clear the old localStorage
      // copy so it can never silently hit the small-quota wall again.
      if (toMigrate.length > 0 || fromIdb === null) {
        idbSet(GS_WORDS_KEY, combined).catch(() => {});
      }
      if (legacyRaw !== null) {
        try { localStorage.removeItem(GS_WORDS_KEY); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire-and-forget persist to IndexedDB — call after every sharedContent
  // update instead of localStorage.setItem. Never throws/blocks the caller;
  // IndexedDB's practical quota is large enough (tens of MB+) that this
  // realistically never fails at any word-list size this app supports.
  const sharedChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('esl_shared_vocab');
    sharedChannelRef.current = ch;
    ch.onmessage = (e) => {
      if (e?.data?.type !== 'shared-updated') return;
      idbGet<VocabularyWord[]>(GS_WORDS_KEY).then((fresh) => {
        if (!fresh) return;
        const incoming = sanitizeWords(fresh);
        setSharedContent(prev => {
          if (incoming.length !== prev.length) {
            setExternalSyncNotice({ added: Math.max(0, incoming.length - prev.length), updated: 0 });
          }
          return incoming;
        });
      });
    };
    return () => ch.close();
  }, []);

  const persistShared = useCallback((words: VocabularyWord[]) => {
    idbSet(GS_WORDS_KEY, words)
      .then(() => { sharedChannelRef.current?.postMessage({ type: 'shared-updated' }); })
      .catch(() => {
        setStorageWarning(`Couldn't save the shared curriculum (${words.length.toLocaleString()} words) — this browser's storage is unavailable.`);
      });
  }, []);

  // The combined view every page in the app actually reads. Curriculum
  // words get this learner's personal progress (star/learned/study count)
  // laid on top, and anything this learner chose to remove from their own
  // view (via deleteWord on a shared word — see below) is filtered out here
  // without touching the shared curriculum itself.
  const words = useMemo(() => {
    const overlaidShared = sharedContent
      .filter(w => !sharedProgress[w.id]?.hidden)
      .map(w => {
        const p = sharedProgress[w.id];
        if (!p) return w;
        const { hidden: _hidden, ...progressFields } = p;
        return { ...w, ...progressFields };
      });
    return [...manualWords, ...overlaidShared];
  }, [manualWords, sharedContent, sharedProgress]);

  // Surfaces failures that saveToStorage used to only console.error — most
  // importantly a quota-exceeded save, which could otherwise fail
  // completely silently: the import would *look* successful, then vanish
  // on the next reload with no explanation.
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const clearStorageWarning = useCallback(() => setStorageWarning(null), []);

  useEffect(() => {
    const ok = saveToStorage(KEYS.words, manualWords);
    if (!ok) {
      setStorageWarning(
        `Couldn't save your ${manualWords.length.toLocaleString()} word(s) — your browser's storage is full. ` +
        `Try removing a few of your own added words.`
      );
    }
  }, [manualWords, KEYS.words]);
  useEffect(() => { saveToStorage(KEYS.words + '_progress', sharedProgress); }, [sharedProgress, KEYS.words]);
  useEffect(() => { saveToStorage(KEYS.sessions, sessions); }, [sessions, KEYS.sessions]);
  useEffect(() => { saveToStorage(KEYS.profile, profile); }, [profile, KEYS.profile]);
  useEffect(() => { saveToStorage(KEYS.settings, settings); }, [settings, KEYS.settings]);
  useEffect(() => { saveToStorage(KEYS.achievements, achievements); }, [achievements, KEYS.achievements]);

  // ── Cross-tab live sync ──────────────────────────────────────────────────
  // Every way words get added — manually via AddWordModal, CSV/Excel import,
  // admin Google Sheet sync, or GitHub sync — writes to one of the three
  // stores above. The browser fires a native `storage` event in every OTHER
  // open tab (never the tab that made the change) whenever a localStorage
  // key changes. Listening for it means: import a CSV in one tab, and a
  // Flashcards/Quiz/Matching/Spelling/Categories session open in another tab
  // (even under a different logged-in account, for the shared-curriculum
  // key) picks up the change immediately — no reload needed.
  const [externalSyncNotice, setExternalSyncNotice] = useState<{ added: number; updated: number } | null>(null);
  const clearExternalSyncNotice = useCallback(() => setExternalSyncNotice(null), []);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.storageArea !== localStorage || !e.newValue) return;

      if (e.key === KEYS.words) {
        try {
          const incoming = sanitizeWords(JSON.parse(e.newValue));
          setManualWords(prev => {
            if (incoming.length > prev.length) {
              setExternalSyncNotice({ added: incoming.length - prev.length, updated: 0 });
            }
            // Full replace, not upsert: this is the SAME account's own list
            // as last saved by their other tab, so it's authoritative —
            // last-write-wins, consistent with how this app treats storage
            // everywhere else.
            return incoming;
          });
        } catch { /* ignore malformed payload */ }
        return;
      }
      // Shared curriculum cross-tab sync moved to a BroadcastChannel effect
      // below — IndexedDB writes (unlike localStorage) never fire the
      // browser's native 'storage' event, so that's no longer usable here.
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [KEYS.words]);

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
      const isLightBlue = settings.theme === 'light-blue';
      root.classList.toggle('dark', isDark);
      root.classList.toggle('light-blue', isLightBlue);
    };
    applyTheme();
    // Listen for system preference changes when theme is 'system'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (settings.theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [settings.theme]);

  // Apply font size to document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
    root.classList.add(`text-size-${settings.fontSize}`);
    const sizes: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
    root.style.fontSize = sizes[settings.fontSize] || '16px';
  }, [settings.fontSize]);

  const addWord = useCallback((wordData: Omit<VocabularyWord, 'id' | 'dateAdded' | 'studyCount' | 'correctCount' | 'isLearned' | 'difficulty'>) => {
    const newWord: VocabularyWord = {
      ...wordData,
      id: uuidv4(),
      dateAdded: new Date().toISOString(),
      studyCount: 0,
      correctCount: 0,
      isLearned: false,
      difficulty: 'medium',
      source: wordData.source ?? 'manual',
    };
    setManualWords(prev => [newWord, ...prev]);

    if (settings.autoSync && settings.googleSheetUrl) {
      syncToGoogleSheets(newWord);
    }

    return newWord;
  }, [settings]);

  // Words this learner typed in themselves live in manualWords; curriculum
  // words pushed by an admin live in sharedContent. The edit/delete buttons
  // on a word card are admin-only in the UI (see WordCard.tsx), so any
  // updateWord/deleteWord call reaching a curriculum word is a real admin
  // curriculum edit and should apply to the shared curriculum itself, not
  // just this admin's own view. Everyday study progress (studyCount,
  // correctCount, isLearned, isStarred, lastStudied, nextReviewDate) is the
  // one thing that's ALWAYS per-learner even for a curriculum word — that
  // still goes to the small per-account overlay below.
  const PROGRESS_FIELDS = useMemo(() => new Set<string>([
    'studyCount', 'correctCount', 'isLearned', 'isStarred', 'lastStudied', 'nextReviewDate',
  ]), []);

  const updateWord = useCallback((id: string, updates: Partial<VocabularyWord>) => {
    if (manualWords.some(w => w.id === id)) {
      setManualWords(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
      return;
    }
    const isContentEdit = Object.keys(updates).some(k => !PROGRESS_FIELDS.has(k));
    if (isContentEdit) {
      setSharedContent(prev => {
        const next = prev.map(w => w.id === id ? { ...w, ...updates } : w);
        persistShared(next);
        return next;
      });
    } else {
      setSharedProgress(prev => ({ ...prev, [id]: { ...prev[id], ...updates } }));
    }
  }, [manualWords, PROGRESS_FIELDS]);

  const deleteWord = useCallback((id: string) => {
    if (manualWords.some(w => w.id === id)) {
      setManualWords(prev => prev.filter(w => w.id !== id));
      return;
    }
    // Only reachable via the admin-only delete button — a real curriculum
    // deletion, not a per-learner preference, so it removes the word from
    // the shared curriculum for everyone (consistent with how CSV
    // re-import / dedupe / reset already work).
    setSharedContent(prev => {
      const next = prev.filter(w => w.id !== id);
      persistShared(next);
      return next;
    });
    setSharedProgress(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }, [manualWords]);

  const toggleStar = useCallback((id: string) => {
    if (manualWords.some(w => w.id === id)) {
      setManualWords(prev => prev.map(w => w.id === id ? { ...w, isStarred: !w.isStarred } : w));
    } else {
      const current = sharedProgress[id]?.isStarred ?? sharedContent.find(w => w.id === id)?.isStarred ?? false;
      setSharedProgress(prev => ({ ...prev, [id]: { ...prev[id], isStarred: !current } }));
    }
  }, [manualWords, sharedProgress, sharedContent]);

  const importWords = useCallback((newWords: Omit<VocabularyWord, 'id' | 'dateAdded' | 'studyCount' | 'correctCount' | 'isLearned' | 'difficulty'>[]) => {
    const imported = newWords.map(w => ({
      ...w,
      id: uuidv4(),
      dateAdded: new Date().toISOString(),
      studyCount: 0,
      correctCount: 0,
      isLearned: false,
      difficulty: 'medium' as const,
    }));
    setManualWords(prev => [...imported, ...prev]);
    return imported.length;
  }, []);

  const addSession = useCallback((session: Omit<StudySession, 'id'>) => {
    const newSession: StudySession = {
      ...session,
      id: uuidv4(),
    };
    setSessions(prev => [newSession, ...prev]);

    // Update streak
    const today = new Date().toDateString();
    const lastStudy = profile.lastStudyDate ? new Date(profile.lastStudyDate).toDateString() : null;

    if (lastStudy !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastStudy === yesterday.toDateString()) {
        const newStreak = profile.currentStreak + 1;
        setProfile(prev => ({
          ...prev,
          currentStreak: newStreak,
          longestStreak: Math.max(newStreak, prev.longestStreak),
          lastStudyDate: new Date().toISOString(),
        }));
      } else {
        setProfile(prev => ({
          ...prev,
          currentStreak: 1,
          lastStudyDate: new Date().toISOString(),
        }));
      }
    }

    return newSession;
  }, [profile]);

  // Search by word text, definition, example sentence, synonyms, or
  // translations; filter by CEFR level and/or category — all combinable.
  const getFilteredWords = useCallback((filter: FilterLevel, sort: SortOption, searchQuery: string, category?: string) => {
    let filtered = [...words];

    if (filter !== 'all') {
      filtered = filtered.filter(w => w.cefrLevel === filter);
    }

    if (category) {
      filtered = filtered.filter(w => w.category === category);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.word.toLowerCase().includes(q) ||
        (w.definition && w.definition.toLowerCase().includes(q)) ||
        (w.exampleSentence && w.exampleSentence.toLowerCase().includes(q)) ||
        (w.synonym && w.synonym.toLowerCase().includes(q)) ||
        (w.laoTranslation && w.laoTranslation.toLowerCase().includes(q)) ||
        (w.thaiTranslation && w.thaiTranslation.toLowerCase().includes(q))
      );
    }

    switch (sort) {
      case 'alphabetical':
        filtered.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case 'level':
        const levelOrder: Record<CEFRLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
        filtered.sort((a, b) => levelOrder[a.cefrLevel] - levelOrder[b.cefrLevel]);
        break;
      case 'studied':
        filtered.sort((a, b) => b.studyCount - a.studyCount);
        break;
      default:
        filtered.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    }

    return filtered;
  }, [words]);

  const getWordsDueForReview = useCallback(() => {
    return words.filter(w => {
      if (w.isLearned) return false;
      if (!w.nextReviewDate) return w.studyCount > 0;
      return new Date(w.nextReviewDate) <= new Date();
    });
  }, [words]);

  const getStarredWords = useCallback(() => {
    return words.filter(w => w.isStarred);
  }, [words]);

  const getLearnedWords = useCallback(() => {
    return words.filter(w => w.isLearned);
  }, [words]);

  const getCategories = useCallback(() => {
    const cats = new Set<string>();
    words.forEach(w => { if (w.category) cats.add(w.category); });
    return Array.from(cats).sort();
  }, [words]);

  const getStats = useCallback(() => {
    const totalWords = words.length;
    const learnedWords = words.filter(w => w.isLearned).length;
    const starredWords = words.filter(w => w.isStarred).length;
    const reviewDue = getWordsDueForReview().length;
    const totalSessions = sessions.length;
    const totalStudyTime = sessions.reduce((acc, s) => acc + s.duration, 0);

    const levelDistribution = words.reduce((acc, w) => {
      acc[w.cefrLevel] = (acc[w.cefrLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toDateString();
      const count = sessions.filter(s => new Date(s.date).toDateString() === dateStr).length;
      return { day: date.toLocaleDateString('en', { weekday: 'short' }), count };
    });

    return {
      totalWords,
      learnedWords,
      starredWords,
      reviewDue,
      totalSessions,
      totalStudyTime,
      levelDistribution,
      weeklyActivity,
      currentStreak: profile.currentStreak,
    };
  }, [words, sessions, profile, getWordsDueForReview]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const syncToGoogleSheets = useCallback(async (word?: VocabularyWord) => {
    if (!settings.googleSheetUrl) return { success: false, message: 'No Google Sheet URL configured' };

    try {
      const payload = word ? [word] : words;
      const response = await fetch(settings.googleSheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: payload }),
      });

      if (!response.ok) throw new Error('Sync failed');
      return { success: true, message: `Synced ${payload.length} words` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }, [settings.googleSheetUrl, words]);

  // Scans the shared curriculum for duplicates (by normalized word text) and
  // reports them without changing anything.
  const findDuplicateWords = useCallback((): { word: string; count: number; ids: string[] }[] => {
    const groups = new Map<string, { word: string; ids: string[] }>();
    for (const w of sharedContent) {
      if (!w.word) continue;
      const key = w.word.toLowerCase().trim();
      const g = groups.get(key);
      if (g) g.ids.push(w.id);
      else groups.set(key, { word: w.word, ids: [w.id] });
    }
    return Array.from(groups.values())
      .filter(g => g.ids.length > 1)
      .map(g => ({ word: g.word, count: g.ids.length, ids: g.ids }))
      .sort((a, b) => b.count - a.count);
  }, [sharedContent]);

  // Collapses existing duplicates in the shared curriculum (by normalized
  // word text) down to ONE entry per word, merging study-relevant content
  // (first non-empty field across all copies) so nothing gets lost.
  const dedupeWords = useCallback((): { removedCount: number; uniqueCount: number } => {
    let removedCount = 0;
    let finalCount = 0;
    setSharedContent(prev => {
      const order: string[] = [];
      const byKey = new Map<string, VocabularyWord>();

      for (const w of prev) {
        if (!w.word || !w.word.trim()) continue;
        const key = w.word.toLowerCase().trim();
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { ...w });
          order.push(key);
          continue;
        }
        removedCount++;
        byKey.set(key, {
          ...existing,
          definition: existing.definition || w.definition,
          exampleSentence: existing.exampleSentence || w.exampleSentence,
          synonym: existing.synonym ?? w.synonym,
          antonym: existing.antonym ?? w.antonym,
          category: existing.category ?? w.category,
          laoTranslation: existing.laoTranslation ?? w.laoTranslation,
          thaiTranslation: existing.thaiTranslation ?? w.thaiTranslation,
          dateAdded: existing.dateAdded && w.dateAdded
            ? (new Date(existing.dateAdded) < new Date(w.dateAdded) ? existing.dateAdded : w.dateAdded)
            : (existing.dateAdded || w.dateAdded),
        });
      }
      const deduped = order.map(k => byKey.get(k)!);
      finalCount = deduped.length;
      persistShared(deduped);
      return deduped;
    });
    return { removedCount, uniqueCount: finalCount };
  }, []);

  // Merge words into the appropriate store WITHOUT duplicating. Thin
  // wrapper around upsertWords() — see that function for the actual logic.
  //
  // Incoming words are routed by their OWN `.source` tag, not blindly by
  // the `source` param: this same function is used both for admin
  // curriculum syncs (CSV/Sheet/GitHub shared pull — words with no tag or
  // tag 'shared') AND for restoring a single learner's personal GitHub
  // backup on a new device (which can contain that learner's own
  // 'manual'-tagged words mixed in). Routing everything into the shared
  // curriculum regardless of tag would leak a learner's private words into
  // what every OTHER learner sees — so 'manual'-tagged words always go to
  // this account's own private store, and everything else goes to the
  // single origin-wide shared store.
  const mergeSharedWords = useCallback((incoming: Partial<VocabularyWord>[], source: 'shared' | 'manual' = 'shared') => {
    const safeIncoming = Array.isArray(incoming) ? incoming.filter(w => !!w && typeof w === 'object') : [];
    const manualIncoming = safeIncoming.filter(w => (w as any).source === 'manual');
    const sharedIncoming = safeIncoming.filter(w => (w as any).source !== 'manual');

    let addedCount = 0;
    let updatedCount = 0;

    if (manualIncoming.length > 0) {
      setManualWords(prev => {
        const { result, added, updated } = upsertWords(prev, manualIncoming, 'manual');
        addedCount += added;
        updatedCount += updated;
        return result;
      });
    }

    if (sharedIncoming.length > 0) {
      setSharedContent(prev => {
        const { result, added, updated } = upsertWords(prev, sharedIncoming, source);
        addedCount += added;
        updatedCount += updated;
        persistShared(result);
        return result;
      });
    }

    return { added: addedCount, updated: updatedCount };
  }, []);

  // Replace the ENTIRE shared/admin curriculum with a new snapshot.
  //
  // mergeSharedWords (above) only ever ADDS or UPDATES — it can never remove
  // a word, so re-importing a smaller or corrected CSV/sheet just piles the
  // new words on top of the old ones forever. This is the real "reset and
  // replace" an admin needs when they want the app's vocabulary to actually
  // MATCH a new source file, not just grow to include it.
  //
  // A curriculum word that's still present in the new set keeps its shared
  // content refreshed; a learner's personal progress overlay for it (star/
  // learned/study count) is untouched either way, since that lives
  // separately per account.
  const replaceSharedWords = useCallback((newSharedWords: Partial<VocabularyWord>[]) => {
    let addedCount = 0, updatedCount = 0, removedCount = 0;
    setSharedContent(prev => {
      const { result: mergedShared, added, updated } = upsertWords(prev, newSharedWords, 'shared');

      const newKeys = new Set(
        (Array.isArray(newSharedWords) ? newSharedWords : [])
          .filter((w): w is Partial<VocabularyWord> & { word: string } => !!w && typeof w.word === 'string' && w.word.trim() !== '')
          .map(w => w.word.toLowerCase().trim())
      );
      const finalShared = mergedShared.filter(w => newKeys.has(w.word.toLowerCase().trim()));

      addedCount = added;
      updatedCount = updated;
      removedCount = mergedShared.length - finalShared.length;

      persistShared(finalShared);

      return finalShared;
    });
    return { added: addedCount, updated: updatedCount, removed: removedCount };
  }, []);

  // Admin "reset all data" action.
  //  scope 'shared' — clears the shared curriculum only, keeping every
  //    learner's own manually-added words untouched. This is the safe
  //    default: "clear the curriculum, keep my own notes."
  //  scope 'all'    — also clears THIS account's own manual words. Meant to
  //    be gated behind an explicit, extra-confirmed admin action.
  // Either way: study SESSIONS history is left alone (it's a log of past
  // activity, not vocabulary content) — pair with resetProgress() if a
  // full wipe including stats/streaks is also wanted.
  const clearVocabulary = useCallback((scope: 'shared' | 'all' = 'shared') => {
    const removedCount = scope === 'all' ? manualWords.length + sharedContent.length : sharedContent.length;
    if (scope === 'all') setManualWords([]);
    setSharedContent([]);
    setSharedProgress({});
    idbDelete(GS_WORDS_KEY).catch(() => {});
    sharedChannelRef.current?.postMessage({ type: 'shared-updated' });
    return { removed: removedCount };
  }, [manualWords, sharedContent]);

  const resetProgress = useCallback(() => {
    setManualWords(prev => prev.map(w => ({
      ...w,
      studyCount: 0,
      correctCount: 0,
      isLearned: false,
      difficulty: 'medium' as const,
      nextReviewDate: undefined,
    })));
    setSharedProgress({});
    setSessions([]);
    setProfile(prev => ({ ...prev, currentStreak: 0, longestStreak: 0 }));
  }, []);

  return {
    words,
    sessions,
    profile,
    settings,
    achievements,
    // Size of the shared/admin curriculum specifically (not this learner's
    // own manual words). Used by App.tsx to decide whether this browser
    // still needs the built-in default word bank seeded in — see
    // src/data/defaultVocabulary.json and the seeding effect in App.tsx.
    sharedWordCount: sharedContent.length,
    // True once the async IndexedDB load (see effect above) has resolved —
    // lets callers (e.g. the seeding effect in App.tsx) tell "genuinely no
    // curriculum yet" apart from "hasn't finished loading yet" so they
    // don't seed on top of data that just hasn't arrived from IndexedDB.
    sharedLoaded,
    addWord,
    updateWord,
    deleteWord,
    toggleStar,
    importWords,
    addSession,
    getFilteredWords,
    getWordsDueForReview,
    getStarredWords,
    getLearnedWords,
    getCategories,
    getStats,
    updateProfile,
    updateSettings,
    syncToGoogleSheets,
    mergeSharedWords,
    replaceSharedWords,
    clearVocabulary,
    findDuplicateWords,
    dedupeWords,
    resetProgress,
    storageWarning,
    clearStorageWarning,
    externalSyncNotice,
    clearExternalSyncNotice,
  };
}
