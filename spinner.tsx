import { Star, Volume2, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '@/App';
import { useSpeech } from '@/hooks/useSpeech';
import type { VocabularyWord } from '@/types/vocabulary';

interface WordCardProps {
  word: VocabularyWord;
  onEdit: (word: VocabularyWord) => void;
  onDelete: (id: string) => void;
  showTranslations?: boolean;
}

export function WordCard({ word, onEdit, onDelete, showTranslations = true }: WordCardProps) {
  const { toggleStar } = useApp().vocabulary;
  const { speak } = useSpeech();

  const posColors: Record<string, string> = {
    noun: 'bg-blue-50 text-blue-700',
    verb: 'bg-green-50 text-green-700',
    adjective: 'bg-purple-50 text-purple-700',
    adverb: 'bg-orange-50 text-orange-700',
    pronoun: 'bg-pink-50 text-pink-700',
    preposition: 'bg-gray-50 text-gray-700',
    conjunction: 'bg-teal-50 text-teal-700',
    interjection: 'bg-red-50 text-red-700',
    phrase: 'bg-indigo-50 text-indigo-700',
  };

  const levelColors: Record<string, string> = {
    A1: 'bg-green-50 text-green-700',
    A2: 'bg-blue-50 text-blue-700',
    B1: 'bg-yellow-50 text-yellow-700',
    B2: 'bg-orange-50 text-orange-700',
    C1: 'bg-red-50 text-red-700',
    C2: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className="group card-hover rounded-2xl border border-[#E5E5DD] bg-white p-5">
      {/* Top Row */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-[#1A1A2E]">{word.word}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${posColors[word.partOfSpeech] || 'bg-gray-50 text-gray-700'}`}>
            {word.partOfSpeech}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${levelColors[word.cefrLevel]}`}>
            {word.cefrLevel}
          </span>
        </div>
        <button
          onClick={() => toggleStar(word.id)}
          className="rounded-lg p-1.5 transition-colors hover:bg-[#F5F5F0]"
        >
          <Star
            className={`h-4 w-4 ${word.isStarred ? 'fill-[#F5A623] text-[#F5A623]' : 'text-[#9B9BAE]'}`}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* Definition */}
      <p className="mb-2 text-sm text-[#6B6B80] line-clamp-2">{word.definition}</p>

      {/* Translations */}
      {showTranslations && (word.laoTranslation || word.thaiTranslation) && (
        <div className="mb-2 flex gap-3 text-xs text-[#9B9BAE]">
          {word.laoTranslation && <span>Lao: {word.laoTranslation}</span>}
          {word.thaiTranslation && <span>Thai: {word.thaiTranslation}</span>}
        </div>
      )}

      {/* Example */}
      <p className="mb-3 text-sm italic text-[#9B9BAE] line-clamp-2">
        &ldquo;{word.exampleSentence}&rdquo;
      </p>

      {/* Synonyms/Antonyms */}
      {(word.synonym || word.antonym) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {word.synonym && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[#9B9BAE]">Syn:</span>
              {word.synonym.split(',').map((s, i) => (
                <span key={i} className="rounded-full bg-[#FFF3DD] px-2 py-0.5 text-[11px] font-medium text-[#B37600]">
                  {s.trim()}
                </span>
              ))}
            </div>
          )}
          {word.antonym && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[#9B9BAE]">Ant:</span>
              {word.antonym.split(',').map((a, i) => (
                <span key={i} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                  {a.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category */}
      {word.category && (
        <div className="mb-3">
          <span className="text-[11px] text-[#9B9BAE]">{word.category}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-[#EBEBE6]">
        <button
          onClick={() => speak(word.word)}
          className="rounded-lg p-1.5 text-[#9B9BAE] transition-colors hover:bg-[#F5F5F0] hover:text-[#1A1A2E]"
          title="Pronunciation"
        >
          <Volume2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onEdit(word)}
          className="rounded-lg p-1.5 text-[#9B9BAE] transition-colors hover:bg-[#F5F5F0] hover:text-[#1A1A2E]"
          title="Edit"
        >
          <Pencil className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onDelete(word.id)}
          className="rounded-lg p-1.5 text-[#9B9BAE] transition-colors hover:bg-red-50 hover:text-[#FF3B30]"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
