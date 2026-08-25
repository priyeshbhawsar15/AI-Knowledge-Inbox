import React from 'react';
import { Globe, FileText, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import type { ItemSummary } from '@ai-knowledge-inbox/contracts';

interface NoteCardProps {
  item: ItemSummary;
  onClick: (item: ItemSummary) => void;
  isFocused?: boolean;
}

export const NoteCard: React.FC<NoteCardProps> = ({ item, onClick, isFocused }) => {
  const isUrl = item.type === 'url';

  const renderStatusBadge = () => {
    switch (item.status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Ready
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
            Processing
          </span>
        );
      case 'retry_wait':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
            <Clock className="w-3 h-3 text-stone-500" />
            Queued
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-3 h-3 text-red-600" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const formattedDate = new Date(item.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
      className={`knowledge-pulse group bg-white border border-[#E7E5E4] rounded-2xl p-4 cursor-pointer hover:border-amber-500/50 hover:shadow-md transition-all flex flex-col justify-between h-full ${
        isFocused ? 'ring-2 ring-amber-600 border-amber-600' : ''
      }`}
      data-status={item.status}
    >
      <div>
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium">
            {isUrl ? <Globe className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            <span>{isUrl ? 'URL Note' : 'Text Note'}</span>
          </div>
          {renderStatusBadge()}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-stone-900 text-base leading-snug mb-2 group-hover:text-amber-700 transition-colors line-clamp-2">
          {item.title || (isUrl ? item.sourceUrl : 'Untitled Note')}
        </h3>

        {/* Preview */}
        {isUrl ? (
          <p className="text-xs text-stone-500 truncate font-mono bg-stone-50 p-2 rounded-lg border border-stone-100">
            {item.sourceUrl}
          </p>
        ) : null}

        {item.error && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 mt-2 line-clamp-2 font-mono">
            {item.error.message}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
        <span>{formattedDate}</span>
        <span className="font-mono text-[10px] text-stone-300">{item.id.slice(0, 12)}</span>
      </div>
    </article>
  );
};
