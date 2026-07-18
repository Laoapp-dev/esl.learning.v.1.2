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

export function ImportExportModal({ isOpen, onClose }: ImportExportModalProps) {
  const { vocabulary, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<Partial<VocabularyWord>[]>([]);
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
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let parsed: Partial<VocabularyWord>[] = [];

        if (file.name.endsWith('.csv')) {
          const result = Papa.parse(data as string, { header: true, skipEmptyLines: true });
          parsed = result.data as Partial<VocabularyWord>[];
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          parsed = XLSX.utils.sheet_to_json(worksheet) as Partial<VocabularyWord>[];
        }

        // Normalize field names
        const normalized = parsed.map((row: any) => ({
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

        setPreviewData(normalized.slice(0, 5));
        addToast(`Previewing ${normalized.length} words`, 'info');

        // Store full data for import
        (window as any).__importData = normalized;
      } catch (error) {
        addToast('Error parsing file', 'error');
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const handleImport = () => {
    const data = (window as any).__importData as Partial<VocabularyWord>[];
    if (!data || data.length === 0) {
      addToast('No data to import', 'error');
      return;
    }

    const validWords = data.filter(w => w.word && w.definition && w.exampleSentence);
    if (validWords.length === 0) {
      addToast('No valid words found in file', 'error');
      return;
    }

    const count = vocabulary.importWords(validWords as any);
    addToast(`Imported ${count} words successfully`, 'success');
    setPreviewData([]);
    (window as any).__importData = null;
    onClose();
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
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                        isDragging
                          ? 'border-[#F5A623] bg-[#FFF3DD]'
                          : 'border-[#E5E5DD] bg-[#F5F5F0] hover:border-[#D5D5CD]'
                      }`}
                    >
                      <Upload className="mb-3 h-8 w-8 text-[#9B9BAE]" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-[#1A1A2E]">Drop your file here or click to browse</p>
                      <p className="mt-1 text-xs text-[#9B9BAE]">Supports CSV, XLSX, XLS</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
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
                          onClick={() => { setPreviewData([]); (window as any).__importData = null; }}
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
