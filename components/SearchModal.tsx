
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { SearchIcon, PlayIcon, PlusIcon } from "./Icons";
import { Song } from "../types";
import { AbstractTrackInfo, sourceManager, PlatformType } from "../services/MusicSourceManager";
import { NeteaseTrackInfo, getNeteaseAudioUrl } from "../services/lyricsService";
import { useKeyboardScope } from "../hooks/useKeyboardScope";
import { SafeImage } from "./SafeImage";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Song[];
  onPlayQueueIndex: (index: number) => void;
  onImportAndPlay: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  currentSong: Song | null;
  isPlaying: boolean;
}

type SearchSource = "queue" | "netease";

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    track: AbstractTrackInfo | Song;
    type: SearchSource;
}

const SEQUOIA_SCROLLBAR_STYLES = `
  .sequoia-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.0) transparent;
    transition: scrollbar-color 0.3s ease;
  }
  .sequoia-scrollbar:hover {
    scrollbar-color: rgba(255, 255, 255, 0.4) transparent;
  }
  .sequoia-scrollbar::-webkit-scrollbar {
    width: 14px; 
  }
  .sequoia-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .sequoia-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.0);
    border: 5px solid transparent; 
    background-clip: content-box;
    border-radius: 99px;
    transition: background-color 0.3s ease;
  }
  .sequoia-scrollbar:hover::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.4);
  }
  .sequoia-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.6);
  }
`;

const ANIMATION_STYLES = `
  @keyframes modal-in {
      0% { opacity: 0; transform: scale(0.96) translateY(-8px); filter: blur(4px); }
      100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
  }
  @keyframes modal-out {
      0% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
      100% { opacity: 0; transform: scale(0.98) translateY(4px); filter: blur(8px); }
  }
  @keyframes eq-bounce {
      0%, 100% { transform: scaleY(0.4); opacity: 0.8; }
      50% { transform: scaleY(1.0); opacity: 1; }
  }
  .macos-modal-in { animation: modal-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
  .macos-modal-out { animation: modal-out 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
`;

const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  queue,
  onPlayQueueIndex,
  onImportAndPlay,
  onAddToQueue,
  currentSong,
  isPlaying
}) => {
  // --- State Persistence ---
  // We keep the state even when closed, because the component stays mounted (controlled by App.tsx)
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchSource>("queue");
  
  // Animation State
  const [isRendering, setIsRendering] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Cloud Search State
  const [cloudResults, setCloudResults] = useState<AbstractTrackInfo[]>([]);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 30;

  const [resolvingTrackId, setResolvingTrackId] = useState<string | null>(null);

  // Navigation State
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // --- Animation Handling ---
  useEffect(() => {
    if (isOpen) {
      setIsRendering(true);
      setIsClosing(false);
      // Auto focus when opening
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (isRendering && !isClosing) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsRendering(false);
        setIsClosing(false);
      }, 250); // Match exit animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendering]);

  // --- Keyboard Scope (High Priority: 100) ---
  useKeyboardScope((e) => {
      if (!isOpen) return false;

      if (contextMenu) {
          setContextMenu(null);
          return true;
      }

      switch (e.key) {
          case "ArrowDown": {
              e.preventDefault();
              const listLength = activeTab === 'queue' ? queueResults.length : cloudResults.length;
              if (listLength === 0) return true;
              
              const next = Math.min(selectedIndex + 1, listLength - 1);
              setSelectedIndex(next);
              scrollToItem(next);
              return true;
          }
          case "ArrowUp": {
              e.preventDefault();
              const prev = Math.max(selectedIndex - 1, 0);
              setSelectedIndex(prev);
              scrollToItem(prev);
              return true;
          }
          case "Enter": {
              e.preventDefault();
              if (selectedIndex >= 0) {
                 handleSelection(selectedIndex);
              } else if (activeTab === 'netease' && query.trim()) {
                 performSearch();
              }
              return true;
          }
          case "Escape": {
              e.preventDefault();
              onClose();
              return true;
          }
          case "Tab": {
              // Optional: Allow tabbing between modes
              e.preventDefault();
              setActiveTab(prev => prev === 'queue' ? 'netease' : 'queue');
              setSelectedIndex(-1);
              return true;
          }
      }
      return false; 
  }, 100, isOpen);

  // Helper to scroll virtual/real list
  const scrollToItem = (index: number) => {
      const el = itemRefs.current[index];
      if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
  };

  // --- Search Logic ---

  const performSearch = async () => {
    if (!query.trim()) return;
    setIsSearchingCloud(true);
    setCloudResults([]);
    setOffset(0);
    setHasMore(true);
    setSelectedIndex(-1);

    try {
        const results = await sourceManager.searchPool(query, { limit: LIMIT, offset: 0 });
        setCloudResults(results);
        // Note: For pooled search, pagination can be tricky because multiple providers exist.
        // We assume 'limit' roughly maps to provider limits. If it's Bilibili, it might return less.
        setHasMore(results.length >= LIMIT);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSearchingCloud(false);
    }
  };

  const loadMore = async () => {
      if (isSearchingCloud || !hasMore) return;
      const nextOffset = offset + LIMIT;
      
      try {
        const results = await sourceManager.searchPool(query, { limit: LIMIT, offset: nextOffset });
        if (results.length === 0) {
            setHasMore(false);
        } else {
            setCloudResults(prev => [...prev, ...results]);
            setOffset(nextOffset);
        }
      } catch (e) {
          setHasMore(false);
      }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (activeTab !== 'netease') return;
      const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 100) {
          loadMore();
      }
  };

  // Derived Queue Results
  const queueResults = useMemo(() => {
    const all = queue.map((s, i) => ({ s, i }));
    if (!query.trim()) return all;
    
    const lower = query.toLowerCase();
    return all.filter(({ s }) => 
        s.title.toLowerCase().includes(lower) || 
        s.artist.toLowerCase().includes(lower)
    );
  }, [queue, query]);

  // --- Actions ---

  const handleSelection = (index: number) => {
      if (activeTab === 'queue') {
          onClose(); // Immediate close for queue
          const item = queueResults[index];
          if (item) {
             onPlayQueueIndex(item.i);
          }
      } else {
          const track = cloudResults[index];
          if (track) {
             playCloudTrack(track);
          }
      }
  };

  const playCloudTrack = async (track: AbstractTrackInfo) => {
    if (resolvingTrackId) return; // Prevent double clicks
    setResolvingTrackId(track.platformId);
    try {
        const provider = sourceManager.getProvider(track.platform);
        const audioUrl = provider ? await provider.getAudioUrl(track.platformId) : null;
          
        const song: Song = {
            id: `${track.platform}-${track.platformId}`,
            title: track.title,
            artist: track.artist,
            coverUrl: track.coverUrl,
            duration: track.duration,
            fileUrl: audioUrl || "", // For mocked platforms it could be empty
            platform: track.platform,
            platformId: track.platformId,
            isNetease: track.platform === 'netease',
            neteaseId: track.platform === 'netease' ? track.platformId : undefined,
            album: track.album,
            lyrics: [],
            needsLyricsMatch: true,
            fee: track.fee
        };
        onImportAndPlay(song);
        onClose();
    } catch (e) {
        console.error("Failed to load track", e);
    } finally {
        setResolvingTrackId(null);
    }
  };

  const addCloudToQueue = async (track: AbstractTrackInfo) => {
    if (resolvingTrackId) return;
    setResolvingTrackId(track.platformId);
    try {
        const provider = sourceManager.getProvider(track.platform);
        const audioUrl = provider ? await provider.getAudioUrl(track.platformId) : null;
          
        const song: Song = {
            id: `${track.platform}-${track.platformId}`,
            title: track.title,
            artist: track.artist,
            coverUrl: track.coverUrl,
            duration: track.duration,
            fileUrl: audioUrl || "", 
            platform: track.platform,
            platformId: track.platformId,
            isNetease: track.platform === 'netease',
            neteaseId: track.platform === 'netease' ? track.platformId : undefined,
            album: track.album,
            lyrics: [],
            needsLyricsMatch: true,
            fee: track.fee
        };
        onAddToQueue(song);
        setContextMenu(null); 
    } catch (e) {
        console.error("Failed to add track to queue", e);
    } finally {
        setResolvingTrackId(null);
    }
  };

  // --- Context Menu ---

  const handleContextMenu = (e: React.MouseEvent, item: any, type: SearchSource) => {
      e.preventDefault();
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + 200 > window.innerWidth) x -= 200;
      if (y + 100 > window.innerHeight) y -= 100;

      setContextMenu({
          visible: true,
          x,
          y,
          track: item,
          type
      });
  };

  // --- Now Playing Matcher ---
  const isNowPlaying = (item: Song | AbstractTrackInfo) => {
      if (!currentSong) return false;
      
      const p1 = (item as any).platform || ((item as any).isNetease ? 'netease' : undefined);
      const id1 = (item as any).platformId || (item as any).neteaseId;
      
      const p2 = currentSong.platform || (currentSong.isNetease ? 'netease' : undefined);
      const id2 = currentSong.platformId || currentSong.neteaseId;

      // Match by ID first
      if (p1 && p2 && p1 === p2 && id1 && id2) {
          return id1 === id2;
      }
      // Fallback to fuzzy title match if IDs differ or are local
      return item.title === currentSong.title && item.artist === currentSong.artist;
  };

  // Reset refs
  itemRefs.current = [];

  // Render Logic: Keep mounted in DOM if isOpen OR isClosing
  // But if purely hidden and not animating, return null to save resources?
  // No, to persist state, we must keep the component hook logic running or rely on the upper scope.
  // Since 'queue' and 'neteaseResults' are state in THIS component, returning null will destroy them.
  // BUT, createPortal will remove the DOM nodes.
  // To "hide" without unmounting (and keep state), we just don't render the Portal content but keep the hooks running?
  // React hooks must run on every render. 
  // Strategy: The component IS mounted in App.tsx. We return `createPortal(...)` only when `isRendering` is true.
  // If `isRendering` is false, we return `null`.
  // WARNING: Returning null destroys state if the component unmounts? No, 'SearchModal' is still mounted in App tree.
  // Returning null from render just empties the DOM. State persists.
  if (!isRendering) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4 select-none font-sans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
        setContextMenu(null);
      }}
    >
      <style>{SEQUOIA_SCROLLBAR_STYLES}</style>
      <style>{ANIMATION_STYLES}</style>

      {/* Backdrop - Animated */}
      <div 
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'} pointer-events-none`}
        aria-hidden="true"
      />

      {/* Modal Container - Sequoia Style */}
      <div className={`
        relative w-full max-w-[720px] h-[600px]
        bg-[#1e1e1e]/60 backdrop-blur-[100px] saturate-150
        rounded-[20px]
        shadow-[0_50px_100px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.1)]
        flex flex-col overflow-hidden
        ${isClosing ? 'macos-modal-out' : 'macos-modal-in'}
        text-white
      `}>
        
        {/* Header Area */}
        <div className="flex flex-col px-5 pt-5 pb-3 gap-4 border-b border-white/10 shrink-0 bg-white/5 z-10">
            {/* Animated Tabs */}
            <div className="relative flex items-center justify-center p-1 rounded-lg self-center w-full max-w-xs mb-1 bg-black/20 backdrop-blur-md shadow-inner">
                {/* Gliding Pill */}
                <div 
                    className="absolute top-1 bottom-1 rounded-[6px] bg-white/15 shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={{
                        left: activeTab === 'queue' ? '4px' : '50%',
                        width: 'calc(50% - 4px)'
                    }}
                />
                
                <button 
                    onClick={() => { setActiveTab("queue"); setSelectedIndex(-1); }}
                    className={`
                        relative flex-1 py-1.5 text-[13px] font-medium transition-colors duration-200 z-10
                        ${activeTab === "queue" ? "text-white" : "text-white/50 hover:text-white/70"}
                    `}
                >
                    Current Queue
                </button>
                <button 
                    onClick={() => { setActiveTab("netease"); setSelectedIndex(-1); }}
                    className={`
                        relative flex-1 py-1.5 text-[13px] font-medium transition-colors duration-200 z-10
                        ${activeTab === "netease" ? "text-white" : "text-white/50 hover:text-white/70"}
                    `}
                >
                    Cloud Music
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative group mx-2">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <SearchIcon className="w-5 h-5 text-white/40" />
                </div>
                <input 
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && activeTab === 'netease') performSearch();
                    }}
                    placeholder={activeTab === 'netease' ? "Search online..." : "Filter queue..."}
                    className="
                        w-full pl-12 pr-4 py-3.5
                        bg-black/20 hover:bg-black/30 focus:bg-black/40
                        border border-white/5 focus:border-white/15
                        rounded-[12px]
                        text-lg font-medium text-white placeholder:text-white/20
                        outline-none
                        transition-all duration-200
                        shadow-inner
                    "
                />
            </div>
        </div>

        {/* Results Area */}
        <div 
            ref={listRef}
            className="flex-1 overflow-y-auto sequoia-scrollbar p-3 scroll-smooth"
            onScroll={handleScroll}
        >
            {/* Queue Results */}
            {activeTab === "queue" && (
                <div className="flex flex-col gap-1">
                    {queueResults.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-64 text-white/20">
                            <span className="text-lg">No songs in queue</span>
                         </div>
                    ) : (
                        queueResults.map(({ s, i }, idx) => {
                            const nowPlaying = isNowPlaying(s);
                            return (
                                <div 
                                    key={`${s.id}-${i}`}
                                    ref={el => { itemRefs.current[idx] = el }}
                                    onClick={() => handleSelection(idx)}
                                    onContextMenu={(e) => handleContextMenu(e, s, 'queue')}
                                    className={`
                                        group flex items-center gap-3 p-3 rounded-[10px] cursor-pointer transition-all duration-200
                                        ${selectedIndex === idx ? 'bg-blue-500/80 text-white shadow-lg' : 'hover:bg-white/5 text-white/90'}
                                    `}
                                >
                                    <div className="relative w-10 h-10 rounded-[6px] bg-white/5 overflow-hidden shrink-0 shadow-sm">
                                        {s.coverUrl ? (
                                            <SafeImage src={s.coverUrl} className={`w-full h-full object-cover transition-opacity ${nowPlaying && !selectedIndex ? 'opacity-40' : ''}`} alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs opacity-30">♪</div>
                                        )}
                                        
                                        {/* Now Playing Indicator */}
                                        {nowPlaying && isPlaying && (
                                            <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]" style={{ height: '8px' }}></div>
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]" style={{ height: '14px' }}></div>
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]" style={{ height: '10px' }}></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                        <div className={`text-[15px] font-medium truncate ${selectedIndex === idx ? 'text-white' : nowPlaying ? 'text-green-400' : 'text-white/90'}`}>
                                            {s.title}
                                        </div>
                                        <div className={`text-[13px] truncate ${selectedIndex === idx ? 'text-blue-100' : 'text-white/40'}`}>
                                            {s.artist}
                                        </div>
                                    </div>
                                    {selectedIndex === idx && (
                                        <div className="mr-1 inline-block" style={{ animation: 'zoom-in 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards' }}>
                                            <PlayIcon className="w-5 h-5 fill-white" />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Cloud Results */}
            {activeTab === "netease" && (
                <div className="flex flex-col gap-1 pb-4">
                    {cloudResults.length === 0 && !isSearchingCloud ? (
                        <div className="flex flex-col items-center justify-center h-64 text-white/20">
                            <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                            <span className="text-base font-medium">
                                {query.trim() ? "No matches found" : "Search Cloud Music"}
                            </span>
                        </div>
                    ) : (
                        <>
                        {cloudResults.map((track, idx) => {
                            const nowPlaying = isNowPlaying(track);
                            return (
                                <div 
                                    key={`${track.platform}-${track.platformId}-${idx}`}
                                    ref={el => { itemRefs.current[idx] = el }}
                                    onClick={() => handleSelection(idx)}
                                    onContextMenu={(e) => handleContextMenu(e, track, 'netease')}
                                    className={`
                                        group flex items-center gap-3 p-3 rounded-[10px] cursor-pointer transition-all duration-200
                                        ${selectedIndex === idx ? 'bg-blue-500/80 text-white shadow-lg' : 'hover:bg-white/5 text-white/90'}
                                    `}
                                >
                                    <div className="relative w-10 h-10 rounded-[6px] bg-white/5 overflow-hidden shrink-0 shadow-sm">
                                        {track.coverUrl && <SafeImage src={track.coverUrl} className={`w-full h-full object-cover transition-opacity ${nowPlaying || resolvingTrackId === track.platformId ? 'opacity-40' : ''}`} alt="" />}
                                         {/* Loading / Fetching Indicator */}
                                         {resolvingTrackId === track.platformId && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                                            </div>
                                         )}
                                         {/* Now Playing Indicator */}
                                         {nowPlaying && isPlaying && resolvingTrackId !== track.platformId && (
                                            <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite]" style={{ height: '8px' }}></div>
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.2s]" style={{ height: '14px' }}></div>
                                                <div className="w-[2px] bg-white rounded-full animate-[eq-bounce_1s_ease-in-out_infinite_0.4s]" style={{ height: '10px' }}></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                        <div className={`text-[15px] font-medium truncate ${selectedIndex === idx ? 'text-white' : nowPlaying ? 'text-green-400' : 'text-white/90'}`}>
                                            {track.title}
                                        </div>
                                        <div className={`text-[13px] truncate ${selectedIndex === idx ? 'text-blue-100' : 'text-white/40'}`}>
                                            {track.artist} <span className="opacity-50 mx-1">·</span> {track.album}
                                        </div>
                                    </div>
                                    <div className="px-2">
                                        <span className={`
                                            text-[10px] font-bold px-1.5 py-0.5 rounded border
                                            ${selectedIndex === idx 
                                                ? 'border-white/30 text-white bg-white/20' 
                                                : 'border-white/10 text-white/40 bg-white/5'}
                                        `}>
                                            {track.platform === 'netease' ? '网易云' : track.platform === 'bilibili' ? 'B站' : 'Cloud'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Loading Indicator */}
                        {hasMore && (
                            <div className="py-6 flex items-center justify-center">
                                {isSearchingCloud ? (
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                                ) : (
                                    <div className="text-white/20 text-xs">Scroll for more</div>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
            )}
        </div>

        {/* Context Menu Portal */}
        {contextMenu && createPortal(
            <div 
                className="fixed z-[10000] w-48 bg-[#1e1e1e]/60 backdrop-blur-[80px] saturate-150 border border-white/10 rounded-xl shadow-2xl overflow-hidden origin-top-left p-1.5 flex flex-col gap-0.5"
                style={{ top: contextMenu.y, left: contextMenu.x, animation: 'zoom-in 0.1s cubic-bezier(0.32, 0.72, 0, 1) forwards' }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <button 
                    onClick={() => {
                        if (contextMenu.type === 'queue') {
                             const qItem = contextMenu.track as Song;
                             const idx = queue.findIndex(s => s.id === qItem.id);
                             onPlayQueueIndex(idx);
                        } else {
                            playCloudTrack(contextMenu.track as AbstractTrackInfo);
                        }
                        onClose();
                        setContextMenu(null);
                    }}
                    className="flex items-center gap-3 px-3 py-2 text-left text-[13px] text-white/90 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
                >
                    <PlayIcon className="w-4 h-4" />
                    Play Now
                </button>

                {contextMenu.type === 'netease' && (
                    <button 
                        onClick={() => {
                            addCloudToQueue(contextMenu.track as AbstractTrackInfo);
                        }}
                        className="flex items-center gap-3 px-3 py-2 text-left text-[13px] text-white/90 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add to Queue
                    </button>
                )}
            </div>,
            document.body
        )}
      </div>
    </div>,
    document.body
  );
};

export default SearchModal;
