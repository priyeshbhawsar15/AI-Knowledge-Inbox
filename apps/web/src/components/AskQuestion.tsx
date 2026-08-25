import React, { useState } from 'react';
import { Search, Sparkles, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import type { QueryResponse, CitationSource } from '@ai-knowledge-inbox/contracts';
import { queryKnowledge } from '../lib/api.js';

interface AskQuestionProps {
  onSelectCitationItem: (itemId: string) => void;
}

export const AskQuestion: React.FC<AskQuestionProps> = ({ onSelectCitationItem }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await queryKnowledge(question.trim());
      setResult(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Query failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-4xl mx-auto my-6 sm:my-8 px-2 sm:px-4">
      <div className="bg-gradient-to-b from-amber-500/10 via-white to-white border border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3 sm:mb-4 text-amber-900 font-bold text-base sm:text-lg">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
          <h2>Ask RAG Assistant over Saved Inbox</h2>
        </div>

        <form onSubmit={handleAsk} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Ask a question about your saved notes or URLs..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-amber-200 rounded-2xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 shadow-xs"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm rounded-2xl shadow-xs transition-all flex items-center gap-2 touch-target shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Ask</span>
          </button>
        </form>

        {errorMsg && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Query Result */}
        {result && (
          <div className="mt-6 p-6 bg-white border border-amber-200/80 rounded-2xl shadow-xs space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">
                Grounded Answer
              </h3>
              <p className="text-stone-900 text-base leading-relaxed whitespace-pre-wrap font-sans">
                {result.answer}
              </p>
            </div>

            {/* Cited Sources */}
            {result.sources.length > 0 && (
              <div className="pt-4 border-t border-stone-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  Cited Source Snippets ({result.sources.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.sources.map((src: CitationSource) => (
                    <button
                      key={src.citationId}
                      type="button"
                      onClick={() => onSelectCitationItem(src.itemId)}
                      className="text-left w-full p-3 bg-stone-50 hover:bg-amber-50/60 focus:bg-amber-50/60 border border-stone-200 hover:border-amber-300 focus:border-amber-400 rounded-xl cursor-pointer transition-all text-xs group focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                          [{src.citationId}]
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          Score: {src.score}
                        </span>
                      </div>
                      <h5 className="font-semibold text-stone-800 group-hover:text-amber-900 truncate mb-1">
                        {src.title || 'Untitled Source'}
                      </h5>
                      <p className="text-stone-600 line-clamp-2 text-[11px] leading-normal italic">
                        "{src.snippet}"
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
