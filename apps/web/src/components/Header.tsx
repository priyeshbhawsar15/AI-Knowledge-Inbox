import React from 'react';
import { Search, Sparkles, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import type { ItemStatus } from '@ai-knowledge-inbox/contracts';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: ItemStatus | 'all';
  onStatusFilterChange: (s: ItemStatus | 'all') => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  searchInputRef,
}) => {
  return (
    <header className="sticky top-0 z-20 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-[#E7E5E4] px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm font-bold text-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-stone-900 tracking-tight leading-tight">
              AI Knowledge Inbox
            </h1>
            <p className="text-xs text-stone-500 font-medium">Paper-Neutral Private Store</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 w-full min-w-0 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search notes or question context..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full min-w-0 pl-10 pr-12 py-2 text-sm bg-white border border-[#E7E5E4] rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all shadow-xs"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-stone-400 bg-stone-100 border border-stone-200 rounded">
            /
          </kbd>
        </div>

        {/* Filter Pills */}
        <div className="grid grid-cols-4 gap-1.5 w-full md:flex md:w-auto">
          <button
            type="button"
            onClick={() => onStatusFilterChange('all')}
            className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-all touch-target justify-center ${
              statusFilter === 'all'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'text-stone-600 hover:bg-stone-200/60'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('ready')}
            className={`px-2 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all touch-target ${
              statusFilter === 'ready'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Ready</span>
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('processing')}
            className={`px-2 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all touch-target ${
              statusFilter === 'processing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-stone-600 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Pending</span>
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('failed')}
            className={`px-2 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all touch-target ${
              statusFilter === 'failed'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-stone-600 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Failed</span>
          </button>
        </div>
      </div>
    </header>
  );
};
