import React, { useState, useRef, useEffect } from 'react';
import type { ItemSummary, ItemStatus } from '@ai-knowledge-inbox/contracts';
import { useItems } from './hooks/useItems.js';
import { Header } from './components/Header.js';
import { Composer } from './components/Composer.js';
import { NoteCard } from './components/NoteCard.js';
import { NoteDetailModal } from './components/NoteDetailModal.js';
import { AskQuestion } from './components/AskQuestion.js';
import { Inbox, FileText } from 'lucide-react';
import './styles/app.css';

export const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<ItemSummary | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const { items, loading, error, addOptimisticItem } = useItems(
    statusFilter === 'all' ? undefined : statusFilter
  );

  // Global Keyboard shortcuts (/ for search, n for composer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'n' && !isInputActive) {
        e.preventDefault();
        composerInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter items by client search query
  const filteredItems = items.filter((i) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = i.title?.toLowerCase().includes(q);
    const urlMatch = i.sourceUrl?.toLowerCase().includes(q);
    const idMatch = i.id.toLowerCase().includes(q);
    return titleMatch || urlMatch || idMatch;
  });

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col font-sans">
      {/* Accessible Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        searchInputRef={searchInputRef}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {/* Q&A Assistant Section */}
        <AskQuestion
          onSelectCitationItem={(itemId) => {
            const found = items.find((i) => i.id === itemId);
            if (found) setSelectedItem(found);
          }}
        />

        {/* Collapsible Composer */}
        <Composer
          onItemCreated={(item) => addOptimisticItem(item)}
          composerRef={composerInputRef}
        />

        {/* Error Notice */}
        {error && (
          <div className="max-w-2xl mx-auto my-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Note Cards Section */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-400 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Saved Notes & Web Items ({filteredItems.length})</span>
            </h2>
          </div>

          {loading && items.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 py-12">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-44 bg-stone-200/50 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center bg-white/60 border border-dashed border-stone-200 rounded-3xl p-8">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-stone-800 text-base mb-1">Your Inbox is Empty</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Type a text note above or paste a public web URL to start building your personal AI knowledge store.
              </p>
            </div>
          ) : (
            <div className="card-grid">
              {filteredItems.map((item) => (
                <NoteCard
                  key={item.id}
                  item={item}
                  onClick={(i) => setSelectedItem(i)}
                  isFocused={selectedItem?.id === item.id}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Note Detail Dialog / Sheet */}
      <NoteDetailModal
        itemSummary={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Footer */}
      <footer className="border-t border-[#E7E5E4] py-6 px-4 text-center text-xs text-stone-400 bg-[#FBF9F5]">
        <p>AI Knowledge Inbox — Paper-Neutral Grounded Store</p>
      </footer>
    </div>
  );
};

export default App;
