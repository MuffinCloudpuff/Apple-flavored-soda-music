
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, Heart, Loader2 } from 'lucide-react';
import { Song } from '../types';
import { CheckIcon, LinkIcon, PlusIcon, QueueIcon } from './Icons';
import { SafeImage } from './SafeImage';
import { getMoodDictionary } from '../services/moodDictionary';
import { prioritizeTags } from '../services/utils';
import { detectLyricsLanguage } from '../services/languageAnalyzer';

const IOS_SCROLLBAR_STYLES = `
  .playlist-scrollbar {
    scrollbar-width: none;
  }
  .playlist-scrollbar::-webkit-scrollbar {
    display: none;
  }
`;

interface PlaylistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  currentSongId?: string;
  onPlay: (index: number) => void;
  onPlayFavorites?: (index: number, favorites: Song[]) => void;
  onImport: (url: string) => Promise<void>;
  onRemove: (ids: string[]) => void;
  accentColor: string;
}

const PlaylistPanel: React.FC<PlaylistPanelProps> = ({ 
  isOpen, 
  onClose, 
  queue, 
  currentSongId, 
  onPlay,
  onPlayFavorites,
  onImport,
  onRemove,
  accentColor
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [visible, setVisible] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [viewMode, setViewMode] = useState<'queue' | 'favorites'>('queue');
  const [favorites, setFavorites] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('aura_favorites');
      let parsed = saved ? JSON.parse(saved) : [];
      let favs: Song[] = Array.isArray(parsed) ? parsed : [];
      const moodDict = getMoodDictionary();
      return favs.map(song => {
          const rawTags = moodDict[song.id] 
             ? Array.from(new Set([
                 ...(Array.isArray(song.tags) ? song.tags : []), 
                 ...(Array.isArray(moodDict[song.id]) ? moodDict[song.id] : [])
               ])) 
             : (Array.isArray(song.tags) ? song.tags : []);
          
          return {
              ...song,
              tags: prioritizeTags(rawTags, detectLyricsLanguage(song.lyrics), song.title + ' ' + song.artist).tags
          };
      });
    } catch {
      return [];
    }
  });

  const toggleFavorite = (song: Song, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === song.id);
      let newFavs;
      if (isFav) {
        newFavs = prev.filter(f => f.id !== song.id);
      } else {
        newFavs = [...prev, song];
      }
      localStorage.setItem('aura_favorites', JSON.stringify(newFavs));
      return newFavs;
    });
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Virtualization Constants
  const ITEM_HEIGHT = 74; // Approx height of each item (including margin)
  const OVERSCAN = 5;

  // Handle animation visibility
  useEffect(() => {
    const syncFavorites = () => {
      try {
        const saved = localStorage.getItem('aura_favorites');
        if (saved) {
           const parsed = JSON.parse(saved);
           if (Array.isArray(parsed)) {
               const moodDict = getMoodDictionary();
               setFavorites(parsed.map(song => {
                   const rawTags = moodDict[song.id] 
                     ? Array.from(new Set([
                         ...(Array.isArray(song.tags) ? song.tags : []), 
                         ...(Array.isArray(moodDict[song.id]) ? moodDict[song.id] : [])
                       ])) 
                     : (Array.isArray(song.tags) ? song.tags : []);
                   return {
                       ...song,
                       tags: prioritizeTags(rawTags, detectLyricsLanguage(song.lyrics), song.title + ' ' + song.artist).tags
                   };
               }));
           }
        }
      } catch {}
    };
    window.addEventListener('favorites-updated', syncFavorites);
    window.addEventListener('mood-dictionary-updated', syncFavorites);
    return () => {
        window.removeEventListener('favorites-updated', syncFavorites);
        window.removeEventListener('mood-dictionary-updated', syncFavorites);
    };
  }, []);

  const displayList = viewMode === 'queue' ? queue : favorites;

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      
      // Auto-scroll to currently playing song
      let targetScrollTop = 0;
      if (currentSongId) {
          const currentIndex = displayList.findIndex((s: Song) => s.id === currentSongId);
          if (currentIndex !== -1) {
              // Position the current song somewhat in the middle of the panel (e.g. 2 items down)
              targetScrollTop = Math.max(0, (currentIndex - 2) * ITEM_HEIGHT);
              // Wait briefly for refs to attach
              setTimeout(() => {
                 if (listRef.current) {
                     listRef.current.scrollTop = targetScrollTop;
                 }
                 setScrollTop(targetScrollTop);
              }, 10);
              return;
          }
      }
      
      setScrollTop(0);
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    } else {
      setIsEditing(false); // Reset mode on close
      setSelectedIds(new Set());
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]); // Intentionally not including currentSongId or displayList so it only scrolls on open

  // Close on click outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (isOpen && !isAdding && panelRef.current && !panelRef.current.contains(event.target as Node)) {
              if ((event.target as Element).closest('.playlist-toggle-btn')) {
                  return;
              }
              onClose();
          }
      };

      if (isOpen) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
  }, [isOpen, onClose, isAdding]);

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setIsImporting(true);
    await onImport(importUrl);
    setIsImporting(false);
    setImportUrl('');
    setIsAdding(false);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleDelete = () => {
      onRemove(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsEditing(false);
  };

  // Virtual List Logic
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
  };

  const { virtualItems, totalHeight, startOffset } = useMemo(() => {
      const totalHeight = displayList.length * ITEM_HEIGHT;
      const containerHeight = 600; // Approx max height
      
      let startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
      let endIndex = Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT);

      startIndex = Math.max(0, startIndex - OVERSCAN);
      endIndex = Math.min(displayList.length, endIndex + OVERSCAN);

      const virtualItems = [];
      for (let i = startIndex; i < endIndex; i++) {
          virtualItems.push({
              ...displayList[i],
              index: i
          });
      }

      return {
          virtualItems,
          totalHeight,
          startOffset: startIndex * ITEM_HEIGHT
      };
  }, [displayList, scrollTop, viewMode]);

  if (!visible) return null;

  return (
    <>
      <style>{IOS_SCROLLBAR_STYLES}
      {`
        @keyframes panel-in {
            0% { opacity: 0; transform: scale(0.95) translateY(2rem); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes panel-out {
            0% { opacity: 1; transform: scale(1) translateY(0); }
            100% { opacity: 0; transform: scale(0.95) translateY(2rem); }
        }
        .anim-panel-in { animation: panel-in 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .anim-panel-out { animation: panel-out 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
      `}
      </style>
      <div 
        ref={panelRef}
        className={`
            absolute bottom-24 -right-8 z-50
            w-[380px] 
            bg-black/30 backdrop-blur-[120px] saturate-150
            rounded-[32px] 
            shadow-[0_30px_60px_rgba(0,0,0,0.5),_0_0_40px_rgba(255,255,255,0.05)_inset]
            border border-white/10
            flex flex-col overflow-hidden
            origin-bottom-right select-none
            ${isOpen ? 'anim-panel-in' : 'anim-panel-out pointer-events-none'}
        `}
        style={{ maxHeight: '65vh' }}
        onClick={(e) => e.stopPropagation()}
    >
        {/* Analog Noise Texture Layer */}
        <div 
            className="absolute inset-0 z-[-1] opacity-[0.03] mix-blend-overlay pointer-events-none"
            style={{ backgroundImage: `url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E')` }}
        />

        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-[-1]" />
        {/* Header Section */}
        <div className="relative px-6 pt-6 pb-4 shrink-0 flex items-center justify-between border-b border-white/5">
            {/* The background of header can be slightly differentiated if we want, currently it's transparent over the panel bg. */}
            <div 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => {
                    setViewMode(v => v === 'queue' ? 'favorites' : 'queue');
                    setIsEditing(false);
                }}
            >
                <div className="flex flex-col">
                    <h3 className="text-white text-xl font-bold leading-none tracking-tight group-hover:text-blue-400 transition-colors flex items-center gap-2">
                        {viewMode === 'queue' ? 'Playing Next' : 'Favorites'}
                        <ArrowUpDown size={16} className="text-white/60 group-hover:text-blue-400 transition-colors" />
                    </h3>
                    <span className="text-white/50 text-[13px] font-medium mt-1.5 flex items-center gap-1.5">
                        {displayList.length} Songs
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {/* Add Button (Ghost Style) */}
                {!isEditing && (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 text-white/60 hover:text-white hover:bg-white/10"
                        title="Add from URL"
                    >
                        <PlusIcon className="w-5 h-5" />
                    </button>
                )}

                {/* Edit Mode Button */}
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${isEditing ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                    title="Edit List"
                >
                    {isEditing ? (
                        <CheckIcon className="w-4 h-4" />
                    ) : (
                        <QueueIcon className="w-5 h-5" />
                    )}
                </button>
            </div>
        </div>

        {/* Select All Row (Only in Edit Mode) */}
        {isEditing && queue.length > 0 && (
            <div className="px-6 py-2 border-b border-white/5 flex justify-end bg-black/20">
                <button 
                    onClick={() => {
                        if (selectedIds.size === displayList.length) {
                            setSelectedIds(new Set());
                        } else {
                            setSelectedIds(new Set(displayList.map(q => q.id)));
                        }
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-full transition-all active:scale-95 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 uppercase tracking-wider border border-white/10"
                >
                    {selectedIds.size === displayList.length ? "Deselect All" : "Select All"}
                </button>
            </div>
        )}

        {/* Scrollable List with Virtualization */}
        <div 
            ref={listRef}
            onScroll={handleScroll}
        className="flex-1 overflow-y-auto playlist-scrollbar px-2 py-2 relative"
        >
            {displayList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-white/30 space-y-2">
                    <p className="text-xs font-medium">{viewMode === 'queue' ? 'Queue is empty' : 'No favorite songs'}</p>
                </div>
            ) : (
                <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                    {virtualItems.map((song) => {
                        const index = song.index;
                        const isCurrent = song.id === currentSongId;
                        const isSelected = selectedIds.has(song.id);
                        const isFav = favorites.some(f => f.id === song.id);

                        return (
                            <div 
                                key={`${song.id}-${viewMode}-${index}`}
                                onClick={() => {
                                    if (isEditing) toggleSelection(song.id);
                                    else {
                                        if (viewMode === 'queue') {
                                            onPlay(index);
                                        } else {
                                            if (onPlayFavorites) {
                                                onPlayFavorites(index, favorites);
                                            } else {
                                                const qIndex = queue.findIndex(q => q.id === song.id);
                                                if (qIndex >= 0) onPlay(qIndex);
                                            }
                                        }
                                    }
                                }}
                                className={`
                                    absolute left-0 right-0 h-[66px]
                                    group flex items-center gap-3 p-2 mx-3 rounded-[20px] cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
                                    ${isEditing ? 'hover:bg-white/10' : isCurrent ? 'bg-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.2),_inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-white/5' : 'hover:bg-white/5 active:scale-[0.98]'}
                                `}
                                style={{ 
                                    top: `${index * ITEM_HEIGHT}px`,
                                    // Adjust height within the slot if needed, ITEM_HEIGHT includes gap
                                    height: '66px' 
                                }}
                            >
                                {/* Edit Mode Checkbox */}
                                {isEditing && (
                                    <div className={`
                                        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ml-1
                                        ${isSelected ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'}
                                    `}
                                    style={{ backgroundColor: isSelected ? accentColor : 'transparent' }}
                                    >
                                        {isSelected && (
                                            <CheckIcon className="w-3 h-3 text-white" />
                                        )}
                                    </div>
                                )}

                                {/* Cover & Indicator */}
                                <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800 border border-white/5 shadow-sm">
                                    {song.coverUrl ? (
                                        <SafeImage src={song.coverUrl} alt="" className={`w-full h-full object-cover transition-opacity duration-300 ${isCurrent && !isEditing ? 'opacity-40 blur-[1px]' : ''}`} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white/20 text-[10px]">♪</div>
                                    )}
                                    
                                    {/* Redesigned Now Playing Indicator (Equalizer) */}
                                    {isCurrent && !isEditing && (
                                        <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
                                            <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]" style={{ height: '12px', color: accentColor }}></div>
                                            <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]" style={{ height: '20px', color: accentColor }}></div>
                                            <div className="w-[3px] bg-current rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]" style={{ height: '15px', color: accentColor }}></div>
                                            <style>{`
                                                @keyframes eq-bounce {
                                                    0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
                                                    50% { transform: scaleY(1.0); opacity: 1; }
                                                }
                                            `}</style>
                                        </div>
                                    )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 pr-2">
                                    <div className={`text-[15px] font-semibold truncate leading-tight transition-colors duration-300`}
                                         style={{ color: isCurrent ? accentColor : 'rgba(255,255,255,0.9)' }}>
                                        {song.title}
                                    </div>
                                    <div className="flex items-center justify-between text-[13px] text-white/50 font-medium w-full gap-2 overflow-hidden">
                                        <span className="truncate flex-1 min-w-0">{song.artist}</span>
                                        <div className="flex justify-end items-center gap-1 overflow-hidden shrink-0">
                                            {Array.isArray(song.tags) && song.tags.length > 0 && song.tags.slice(0, 3).map((tag, i) => {
                                                const displayTag = tag.includes('/') ? tag.split('/')[0] : tag;
                                                return (
                                                    <span key={i} className="px-1.5 py-[1px] rounded bg-white/10 text-[10px] text-white/70 whitespace-nowrap border border-white/5 truncate max-w-[60px]">
                                                        {displayTag}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
        
        {/* Footer Actions (Delete) */}
        {isEditing && selectedIds.size > 0 && (
            <div className="p-3 bg-black/20 border-t border-white/5 flex justify-center animate-in slide-in-from-bottom-2">
                <button 
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full transition-colors text-sm font-bold active:scale-95"
                >
                    Delete ({selectedIds.size})
                </button>
            </div>
        )}
    </div>

    {/* iOS/MacOS Style Add Dialog (Improved) - Using Portal */}
    {isAdding && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={() => !isImporting && setIsAdding(false)}>
            <style>{`
                @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes zoom-in { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
                .anim-fade-in { animation: fade-in 0.3s ease-out forwards; }
                .anim-zoom-in { animation: zoom-in 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            `}</style>

            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade-in"></div>

            {/* Modal */}
            <div
                className={`relative w-full max-w-[360px] bg-black/30 backdrop-blur-[120px] saturate-150 rounded-[36px] overflow-hidden anim-zoom-in transition-all duration-500 shadow-[0_40px_80px_rgba(0,0,0,0.6),_0_0_50px_rgba(255,255,255,0.05)_inset] ${isImporting ? 'border border-white/0' : 'border border-white/10'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Analog Noise Texture Layer */}
                <div 
                    className="absolute inset-0 z-[-1] opacity-[0.04] mix-blend-overlay pointer-events-none"
                    style={{ backgroundImage: `url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E')` }}
                />

                {/* Content */}
                <div className={`transition-all duration-500 ${isImporting ? 'blur-sm opacity-60 pointer-events-none' : ''}`}>
                    <div className="p-6 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                             <LinkIcon className="w-7 h-7" />
                        </div>

                        <h3 className="text-xl font-bold text-white tracking-tight">Import Music</h3>
                        <p className="text-white/60 text-[15px] mt-2 leading-relaxed px-2">
                            Paste a <span className="text-white/90 font-medium">Netease Cloud Music</span> song or playlist link to add to queue.
                        </p>

                        <input
                            type="text"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            placeholder="https://music.163.com/..."
                            disabled={isImporting}
                            className="w-full mt-5 bg-black/20 border border-white/10 rounded-[20px] px-5 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:bg-white/5 transition-all text-[15px] disabled:opacity-50 shadow-inner"
                            autoFocus
                        />
                    </div>

                    {/* Action Buttons (iOS Style) */}
                    <div className={`grid grid-cols-2 divide-x bg-white/5 transition-colors duration-500 ${isImporting ? 'border-t border-white/0 divide-white/0' : 'border-t border-white/10 divide-white/10'}`}>
                        <button
                            onClick={() => setIsAdding(false)}
                            disabled={isImporting}
                            className="py-4 text-[17px] text-white/60 font-medium hover:bg-white/5 transition-colors active:bg-white/10 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={isImporting}
                            className="py-4 text-[17px] text-blue-400 font-semibold hover:bg-white/5 transition-colors active:bg-white/10 disabled:opacity-50"
                        >
                            Import
                        </button>
                    </div>
                </div>

                {isImporting && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/10 rounded-[28px] animate-in fade-in duration-300">
                        <Loader2 className="w-10 h-10 text-white shadow-sm animate-spin mb-3" />
                        <p className="text-white font-medium tracking-wide">Parsing...</p>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )}
    </>
  );
};


export default PlaylistPanel;
