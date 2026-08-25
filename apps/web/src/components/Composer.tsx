import React, { useState } from 'react';
import { FileText, Globe, Plus, Loader2, AlertCircle } from 'lucide-react';
import type { IngestRequest, ItemSummary } from '@ai-knowledge-inbox/contracts';
import { ingestItem } from '../lib/api.js';

interface ComposerProps {
  onItemCreated: (item: ItemSummary) => void;
  composerRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

export const Composer: React.FC<ComposerProps> = ({ onItemCreated, composerRef }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleCancel = () => {
    setIsExpanded(false);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      let payload: IngestRequest;
      if (mode === 'text') {
        if (!content.trim()) {
          throw new Error('Please enter note content');
        }
        payload = {
          type: 'text',
          content: content.trim(),
          title: title.trim() || undefined,
        };
      } else {
        if (!url.trim()) {
          throw new Error('Please enter a valid URL');
        }
        payload = {
          type: 'url',
          url: url.trim(),
        };
      }

      // Generate stable idempotency key for submission attempt
      const idempotencyKey = `idp_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const res = await ingestItem(payload, idempotencyKey);

      onItemCreated(res.item);

      // Reset form
      setTitle('');
      setContent('');
      setUrl('');
      setIsExpanded(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto my-6 px-4">
      <div className="bg-white border border-[#E7E5E4] rounded-2xl shadow-sm hover:shadow-md transition-all p-4">
        {!isExpanded ? (
          <div
            onClick={handleExpand}
            className="flex items-center justify-between text-stone-500 cursor-text py-1 px-2 group"
          >
            <span className="text-sm font-medium">Take a note or paste a URL…</span>
            <div className="flex items-center gap-2">
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-stone-400 bg-stone-100 border border-stone-200 rounded">
                n
              </kbd>
              <Plus className="w-5 h-5 text-stone-400 group-hover:text-amber-600 transition-colors" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode('text')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all touch-target ${
                    mode === 'text' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Text Note
                </button>
                <button
                  type="button"
                  onClick={() => setMode('url')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all touch-target ${
                    mode === 'url' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Web URL
                </button>
              </div>
            </div>

            {/* Fields */}
            {mode === 'text' ? (
              <>
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-base font-semibold text-stone-900 placeholder:text-stone-400 bg-transparent border-none focus:outline-none"
                />
                <textarea
                  ref={composerRef as React.RefObject<HTMLTextAreaElement>}
                  placeholder="Write your note content..."
                  value={content}
                  rows={4}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full text-sm text-stone-800 placeholder:text-stone-400 bg-transparent border-none focus:outline-none resize-none leading-relaxed"
                  autoFocus
                />
              </>
            ) : (
              <div className="py-2">
                <input
                  ref={composerRef as React.RefObject<HTMLInputElement>}
                  type="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  autoFocus
                />
                <p className="text-[11px] text-stone-500 mt-1.5">
                  Server will fetch and extract document readable text securely.
                </p>
              </div>
            )}

            {/* Error notice */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-all touch-target"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 touch-target"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
