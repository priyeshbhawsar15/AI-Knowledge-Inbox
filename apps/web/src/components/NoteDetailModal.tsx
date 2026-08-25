import React, { useEffect, useRef, useState } from 'react';
import { X, Globe, FileText, Calendar, Layers, AlertTriangle, ExternalLink } from 'lucide-react';
import type { ItemSummary, ItemDetail } from '@ai-knowledge-inbox/contracts';
import { fetchItemById } from '../lib/api.js';

interface NoteDetailModalProps {
  itemSummary: ItemSummary | null;
  onClose: () => void;
}

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({ itemSummary, onClose }) => {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;

    if (itemSummary) {
      setLoading(true);
      fetchItemById(itemSummary.id)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));

      setTimeout(() => {
        const firstBtn = modalRef.current?.querySelector('button') as HTMLElement;
        if (firstBtn) {
          firstBtn.focus();
        } else {
          modalRef.current?.focus();
        }
      }, 50);
    }

    return () => {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [itemSummary]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!itemSummary) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemSummary, onClose]);

  if (!itemSummary) return null;

  const displayTitle = detail?.title || itemSummary.title || (itemSummary.type === 'url' ? itemSummary.sourceUrl : 'Untitled Note');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Dialog box / Mobile sheet */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-white sm:rounded-2xl shadow-xl border border-stone-200 overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[85vh] z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-[#FBF9F5]">
          <div className="flex items-center gap-2 text-stone-600 text-xs font-semibold">
            {itemSummary.type === 'url' ? <Globe className="w-4 h-4 text-amber-600" /> : <FileText className="w-4 h-4 text-amber-600" />}
            <span>{itemSummary.type === 'url' ? 'Web URL Item' : 'Text Note'}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-all touch-target"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <h2 id="note-modal-title" className="text-xl font-bold text-stone-900 leading-snug">
            {displayTitle}
          </h2>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-stone-50 p-3 rounded-xl border border-stone-100">
            <div className="flex items-center gap-2 text-stone-600">
              <Calendar className="w-4 h-4 text-stone-400" />
              <span>{new Date(itemSummary.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600">
              <Layers className="w-4 h-4 text-stone-400" />
              <span>Chunks: {detail ? detail.chunkCount : '...'}</span>
            </div>
          </div>

          {itemSummary.sourceUrl && (
            <div className="flex items-center gap-2">
              <a
                href={itemSummary.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 underline font-medium"
              >
                <span>Visit Source Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Error Notice */}
          {itemSummary.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs text-red-800">
              <div className="flex items-center gap-1.5 font-bold text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Ingestion Failure ({itemSummary.error.code})</span>
              </div>
              <p>{itemSummary.error.message}</p>
            </div>
          )}

          {/* Raw Display Content */}
          <div className="mt-4">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
              Content Preview
            </h4>
            {loading ? (
              <div className="p-8 text-center text-stone-400 text-sm">Loading note details...</div>
            ) : (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-800 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto font-mono">
                {detail?.displayContent || 'No raw content preview available.'}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-100 bg-[#FBF9F5] flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono text-[11px]">ID: {itemSummary.id}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-stone-700 hover:bg-stone-200/60 rounded-lg transition-all touch-target"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
