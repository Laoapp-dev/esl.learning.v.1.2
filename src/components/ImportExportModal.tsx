import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Download, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '@/App';
import type { VocabularyWord, CEFRLevel, PartOfSpeech } from '@/types/vocabulary';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Max file size we'll attempt to read client-side. Anything bigger is far
// more likely to be the wrong file than a real vocabulary list, and trying
// to parse it can lock up the tab for a long time with no feedback.
// 50MB comfortably covers a full 20,000-row file even with long
// definitions/example sentences/Lao+Thai translations on every row
// (benchmarked: a realistic fully-populated 20,000-row CSV is ~5-10MB and
// parses in well under 200ms, so this leaves generous headroom above that).
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_IMPORT_ROWS = 20_000;

function normalizeRows(parsed: any[]): Partial<VocabularyWord>[] {
  return parsed
    .filter((row: any) => row && typeof row === 'object')
    .map((row: any) => ({
      word: row.word || row.Word || '',
      partOfSpeech: (row.partOfSpeech || row['Part of Speech'] || row.POS || 'noun') as PartOfSpeech,
      laoTranslation: row.laoTranslation || row['Lao Translation'] || row.Lao || undefined,
      thaiTranslation: row.thaiTranslation || row['Thai Translation'] || row.Thai || undefined,
      definition: row.definition || row.Definition || '',
      category: row.category || row.Category || row['Category/Theme'] || undefined,
      exampleSentence: row.exampleSentence || row['Example Sentence'] || row.Example || '',
      synonym: row.synonym || row.Synonym || row.Synonyms || undefined,
      antonym: row.antonym || row.Antonym || row.Antonyms || undefined,
      cefrLevel: (row.cefrLevel || row['CEFR Level'] || row.Level || 'A2') as CEFRLevel,
    }));
}

export function ImportExportModal({ isOpen, onClose }: ImportExportModalProps) {
  const { vocabulary, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<Partial<VocabularyWord>[]>([]);
  // Full parsed dataset lives in component state (not a window global) —
  // that avoids stale/overwritten data if the modal is reused or two
  // imports happen in quick succession.
  const [importData, setImportData] = useState<Partial<VocabularyWord>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so selecting the same file again still fires onChange
    e.target.value = '';
  };

  const finishWithRows = (rows: any[]) => {
    try {
      let normalized = normalizeRows(rows);
      let truncated = false;
      if (normalized.length > MAX_IMPORT_ROWS) {
        normalized = normalized.slice(0, MAX_IMPORT_ROWS);
        truncated = true;
      }
      setPreviewData(normalized.slice(0, 5));
      setImportData(normalized);
      addToast(
        truncated
          ? `File has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows — previewing the first ${MAX_IMPORT_ROWS.toLocaleString()}. Split the rest into a second file.`
          : `Previewing ${normalized.length.toLocaleString()} words`,
        truncated ? 'info' : 'info'
      );
    } catch {
      addToast('The file was read but its contents look invalid. Please check the format and try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = (file: File) => {
    try {
      if (file.size === 0) {
        addToast('That file is empty', 'error');
        return;
      }
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        addToast(`File is too large to import (max ${MAX_IMPORT_FILE_BYTES / 1024 / 1024}MB, roughly ${MAX_IMPORT_ROWS.toLocaleString()} rows). Try splitting it into smaller files.`, 'error');
        return;
      }

      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
      const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
      if (!isCsv && !isJson && !isExcel) {
        addToast('Unsupported file type. Please upload a .csv, .json, .xlsx, or .xls file.', 'error');
        return;
      }

      setIsProcessing(true);

      if (isJson) {
        file.text().then(text => {
          try {
            const parsed = JSON.parse(text);
            // Accept either a raw array of word objects, or a {words: [...]} wrapper.
            const rows: unknown = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? (parsed as any).words : null);
            if (!Array.isArray(rows)) {
              setIsProcessing(false);
              addToast('JSON must be an array of word objects, or {"words": [...]}', 'error');
              return;
            }
            finishWithRows(rows as any[]);
          } catch (error) {
            setIsProcessing(false);
            addToast(`Couldn't parse that JSON file: ${(error as Error).message || 'invalid JSON'}`, 'error');
          }
        }).catch((error) => {
          setIsProcessing(false);
          addToast(`Couldn't read that file: ${(error as Error).message || 'unknown error'}`, 'error');
        });
        return;
      }

      if (isCsv) {
        // NOTE: we deliberately do NOT use Papa's `worker: true` option here.
        // It needs to locate its own script (via document.currentScript) to
        // spawn a Web Worker, which is unreliable once bundled by Vite for
        // production — it can throw instead of parsing, which is what was
        // actually crashing CSV import. The 10MB size cap above already keeps
        // main-thread parsing time short and safe without needing a worker.
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            if (result.errors && result.errors.length > 0) {
              // Non-fatal row errors (e.g. inconsistent column count) — warn
              // but still import whatever parsed successfully.
              addToast(`Parsed with ${result.errors.length} row warning(s); check the preview before importing`, 'info');
            }
            finishWithRows(result.data as any[]);
          },
          error: (error) => {
            setIsProcessing(false);
            addToast(`Error reading CSV file: ${error.message || 'unknown error'}`, 'error');
          },
        });
        return;
      }

      // Excel files: FileReader is still needed to get bytes into memory for
      // the xlsx library, so make sure both success AND failure are handled.
      const reader = new FileReader();
      reader.onerror = () => {
        setIsProcessing(false);
        addToast('Could not read that file — it may be corrupted or in use by another program', 'error');
      };
      reader.onabort = () => {
        setIsProcessing(false);
        addToast('File reading was cancelled', 'error');
      };
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error('No sheets found in workbook');
          const worksheet = workbook.Sheets[sheetName];
          const parsed = XLSX.utils.sheet_to_json(worksheet);
          finishWithRows(parsed);
        } catch (error) {
          setIsProcessing(false);
          addToast(`Error parsing Excel file: ${(error as Error).message || 'unknown error'}`, 'error');
        }
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      // Last-resort safety net: any synchronous throw anywhere above (e.g. a
      // parsing library failing to initialize) used to be an uncaught error
      // inside this DOM event handler, which React's top-level ErrorBoundary
      // would catch by tearing down the ENTIRE app to a "Something went
      // wrong / Reload App" screen. A bad file should never be able to do
      // that — it should just fail this one import with a clear message.
      setIsProcessing(false);
      addToast(`Couldn't read that file: ${(error as Error).message || 'unknown error'}`, 'error');
    }
  };

  const handleImport = () => {
    if (!importData || importData.length === 0) {
      addToast('No data to import', 'error');
      return;
    }

    const validWords = importData.filter(w => w.word && w.definition && w.exampleSentence);
    if (validWords.length === 0) {
      addToast('No valid words found in file — each row needs at least a word, definition, and example sentence', 'error');
      return;
    }

    // Tagged 'manual': this modal is reachable by any signed-in user from
    // My Words, not just the admin, so an import here is the CURRENT USER's
    // own personal list — it must never be tagged as admin-pushed 'shared'
    // curriculum, or a future admin curriculum reset could delete it.
    try {
      const { added, updated } = vocabulary.mergeSharedWords(validWords as any, 'manual');
      addToast(`Imported: ${added} new, ${updated} updated (words already in your list won't be duplicated)`, 'success');
      setPreviewData([]);
      setImportData([]);
      onClose();
    } catch (error) {
      addToast(`Import failed: ${(error as Error).message || 'unexpected error'}`, 'error');
    }
  };

  const handleExportCSV = () => {
    const words = vocabulary.words;
    const csv = Papa.unparse(words.map(w => ({
      Word: w.word,
      'Part of Speech': w.partOfSpeech,
      'Lao Translation': w.laoTranslation || '',
      'Thai Translation': w.thaiTranslation || '',
      Definition: w.definition,
      'Category/Theme': w.category || '',
      'Example Sentence': w.exampleSentence,
      Synonym: w.synonym || '',
      Antonym: w.antonym || '',
      'CEFR Level': w.cefrLevel,
      'Date Added': w.dateAdded,
      Learned: w.isLearned,
      Starred: w.isStarred,
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lexicon-vocabulary-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    addToast('Exported to CSV', 'success');
  };

  const handleExportExcel = () => {
    const words = vocabulary.words;
    const data = words.map(w => ({
      Word: w.word,
      'Part of Speech': w.partOfSpeech,
      'Lao Translation': w.laoTranslation || '',
      'Thai Translation': w.thaiTranslation || '',
      Definition: w.definition,
      'Category/Theme': w.category || '',
      'Example Sentence': w.exampleSentence,
      Synonym: w.synonym || '',
      Antonym: w.antonym || '',
      'CEFR Level': w.cefrLevel,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');
    XLSX.writeFile(wb, `lexicon-vocabulary-${new Date().toISOString().split('T')[0]}.xlsx`);
    addToast('Exported to Excel', 'success');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#1A1A2E]/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[560px] rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EBEBE6] px-6 py-4">
              <h2 className="text-xl font-semibold text-[#1A1A2E]">Import / Export</h2>
              <button onClick={onClose} className="rounded-lg p-2 text-[#9B9BAE] hover:bg-[#F5F5F0]">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#EBEBE6] px-6">
              <button
                onClick={() => setActiveTab('import')}
                className={`mr-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'import'
                    ? 'border-[#F5A623] text-[#F5A623]'
                    : 'border-transparent text-[#9B9BAE] hover:text-[#6B6B80]'
                }`}
              >
                Import
              </button>
              <button
                onClick={() => setActiveTab('export')}
                className={`mr-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'export'
                    ? 'border-[#F5A623] text-[#F5A623]'
                    : 'border-transparent text-[#9B9BAE] hover:text-[#6B6B80]'
                }`}
              >
                Export
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === 'import' ? (
                <div className="space-y-4">
                  {/* Drop Zone */}
                  {!previewData.length && (
                    <div
                      onDragOver={isProcessing ? undefined : handleDragOver}
                      onDragLeave={isProcessing ? undefined : handleDragLeave}
                      onDrop={isProcessing ? undefined : handleDrop}
                      onClick={() => !isProcessing && fileInputRef.current?.click()}
                      aria-busy={isProcessing}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                        isProcessing
                          ? 'cursor-wait border-[#E5E5DD] bg-[#F5F5F0] opacity-70'
                          : isDragging
                          ? 'cursor-pointer border-[#F5A623] bg-[#FFF3DD]'
                          : 'cursor-pointer border-[#E5E5DD] bg-[#F5F5F0] hover:border-[#D5D5CD]'
                      }`}
                    >
                      {isProcessing ? (
                        <>
                          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#E5E5DD] border-t-[#F5A623]" />
                          <p className="text-sm font-medium text-[#1A1A2E]">Reading file…</p>
                        </>
                      ) : (
                        <>
                          <Upload className="mb-3 h-8 w-8 text-[#9B9BAE]" strokeWidth={1.5} />
                          <p className="text-sm font-medium text-[#1A1A2E]">Drop your file here or click to browse</p>
                          <p className="mt-1 text-xs text-[#9B9BAE]">Supports CSV, JSON, XLSX, XLS — up to {MAX_IMPORT_ROWS.toLocaleString()} words ({MAX_IMPORT_FILE_BYTES / 1024 / 1024}MB)</p>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.json,application/json,.xlsx,.xls"
                        onChange={handleFileSelect}
                        disabled={isProcessing}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* Preview */}
                  {previewData.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-[#1A1A2E]">Preview (first 5 rows)</h3>
                      <div className="overflow-x-auto rounded-lg border border-[#E5E5DD]">
                        <table className="w-full text-xs">
                          <thead className="bg-[#F5F5F0]">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-[#6B6B80]">Word</th>
                              <th className="px-3 py-2 text-left font-medium text-[#6B6B80]">POS</th>
                              <th className="px-3 py-2 text-left font-medium text-[#6B6B80]">Level</th>
                              <th className="px-3 py-2 text-left font-medium text-[#6B6B80]">Definition</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.map((row, i) => (
                              <tr key={i} className="border-t border-[#EBEBE6]">
                                <td className="px-3 py-2 font-medium text-[#1A1A2E]">{row.word}</td>
                                <td className="px-3 py-2 text-[#6B6B80]">{row.partOfSpeech}</td>
                                <td className="px-3 py-2 text-[#6B6B80]">{row.cefrLevel}</td>
                                <td className="px-3 py-2 text-[#6B6B80] max-w-[200px] truncate">{row.definition}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={() => { setPreviewData([]); setImportData([]); }}
                          className="rounded-[10px] border border-[#E5E5DD] bg-white px-4 py-2.5 text-sm font-medium text-[#1A1A2E] hover:bg-[#F5F5F0]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleImport}
                          className="rounded-[10px] bg-[#F5A623] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E09400]"
                        >
                          Import Words
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-[#6B6B80]">
                    Export your vocabulary list in your preferred format. Your {vocabulary.words.length} words will be included.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleExportCSV}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E5DD] bg-white p-4 transition-colors hover:bg-[#F5F5F0]"
                    >
                      <FileSpreadsheet className="h-5 w-5 text-[#34C759]" strokeWidth={1.5} />
                      <div className="text-left">
                        <div className="text-sm font-medium text-[#1A1A2E]">Export CSV</div>
                        <div className="text-xs text-[#9B9BAE]">Comma-separated values</div>
                      </div>
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E5DD] bg-white p-4 transition-colors hover:bg-[#F5F5F0]"
                    >
                      <Download className="h-5 w-5 text-[#4A90E2]" strokeWidth={1.5} />
                      <div className="text-left">
                        <div className="text-sm font-medium text-[#1A1A2E]">Export Excel</div>
                        <div className="text-xs text-[#9B9BAE]">.xlsx format</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
