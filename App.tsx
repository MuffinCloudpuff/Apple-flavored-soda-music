import React, { useState, useRef, useEffect } from "react";
import { PlayState, Song } from "./types";
import FluidBackground from "./components/FluidBackground";
import MobileFluidBackground from "./components/MobileFluidBackground";
import { SafeImage } from "./components/SafeImage";
import Controls from "./components/Controls";
import LyricsView from "./components/LyricsView";
import PlaylistPanel from "./components/PlaylistPanel";
import { ListeningModeDrawer } from "./components/ListeningModeDrawer";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import TopBar from "./components/TopBar";
import SearchModal from "./components/SearchModal";
import { usePlaylist } from "./hooks/usePlaylist";
import { usePlayer } from "./hooks/usePlayer";
import { keyboardRegistry } from "./services/keyboardRegistry";
import { searchNetEasePlaylists, fetchNeteasePlaylist } from "./services/lyricsService";
import { NeteaseTrackInfo } from "./services/lyricsService";
import { sourceManager } from "./services/MusicSourceManager";
import { getApiUrl, prioritizeTags } from "./services/utils";
import { getMoodDictionary, startBackgroundMoodWarming, resolveSongEmotionWithGemini, saveMoodDictionary } from "./services/moodDictionary";
import { detectLyricsLanguage, isChinesePlaylist } from "./services/languageAnalyzer";
import { getConfigDirectoryHandle, verifyPermission, getFilesFromDirectory, loadConfigFromFile, saveConfigToFile } from "./utils/directoryHandler";
import { FolderHeart, Sparkles, Loader2, Languages } from "lucide-react";
import SettingsModal from "./components/SettingsModal";

const App: React.FC = () => {
  const playlist = usePlaylist();
  const player = usePlayer({
    queue: playlist.queue,
    originalQueue: playlist.originalQueue,
    updateSongInQueue: playlist.updateSongInQueue,
    setQueue: playlist.setQueue,
  });

  const {
    audioRef,
    currentSong,
    playState,
    currentTime,
    duration,
    playMode,
    matchStatus,
    accentColor,
    togglePlay,
    toggleMode,
    handleSeek,
    playNext,
    playPrev,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlaylistAddition,
    loadLyricsFile,
    playIndex,
    handleAudioError,
  } = player;

  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [volume, setVolume] = useState(1);

  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [activePanel, setActivePanel] = useState<"controls" | "lyrics">(
    "controls",
  );
  
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIntent, setDragIntent] = useState<'none' | 'lyrics' | 'leftDrawer'>('none');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isListeningMode, setIsListeningMode] = useState(false);
  const [activeMixMode, setActiveMixMode] = useState<'默认模式' | '熟悉模式' | '新鲜模式'>('默认模式');
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [listeningModeState, setListeningModeState] = useState<{
    keyword: string;
    playlists: any[];
    currentPlaylistIndex: number;
  } | null>(null);
  const [isFetchingMode, setIsFetchingMode] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState<{ handle: FileSystemDirectoryHandle } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState<{ id: string; type: 'transcribe' | 'translate' } | null>(null);
  const [favoritesCount, setFavoritesCount] = useState(0);

  const mobileViewportRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ id: -1 });

  const [paneWidth, setPaneWidth] = useState(() => {
    if (typeof window === "undefined") return 0;
    return window.innerWidth;
  });

  useEffect(() => {
    const checkRestore = async () => {
      try {
        const savedFavorites = localStorage.getItem('aura_favorites');
        const parsed = savedFavorites ? JSON.parse(savedFavorites) : [];
        const favorites = Array.isArray(parsed) ? parsed : [];
        if (favorites.length > 0) {
            startBackgroundMoodWarming(favorites);
        }
        if (favorites.length === 0) {
          const handle = await getConfigDirectoryHandle();
          if (handle) {
            const options: any = { mode: 'readwrite' };
            if ((await (handle as any).queryPermission(options)) === 'granted') {
                // We have permission, auto-restore
                const config = await loadConfigFromFile(handle);
                if (config && config.favorites) {
                    localStorage.setItem('aura_favorites', JSON.stringify(config.favorites));
                    window.dispatchEvent(new Event('favorites-updated'));
                }
            } else {
                setShowRestorePrompt({ handle });
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkRestore();
  }, []);

  useEffect(() => {
    const handleFavoritesUpdate = async () => {
        try {
            const savedFavorites = localStorage.getItem('aura_favorites');
            const parsed = savedFavorites ? JSON.parse(savedFavorites) : [];
            const favorites = Array.isArray(parsed) ? parsed : [];
            setFavoritesCount(favorites.length);
            if (favorites.length > 0) {
                startBackgroundMoodWarming(favorites);
            }
            
            const handle = await getConfigDirectoryHandle();
            if (handle) {
                const options: any = { mode: 'readwrite' };
                if ((await (handle as any).queryPermission(options)) === 'granted') {
                    await saveConfigToFile(handle, { favorites });
                }
            }
        } catch (e) {
            console.error('Failed to sync config', e);
        }
    };
    handleFavoritesUpdate(); // Initialize count
    window.addEventListener('favorites-updated', handleFavoritesUpdate);
    return () => window.removeEventListener('favorites-updated', handleFavoritesUpdate);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, audioRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 1024px)");
    const updateLayout = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileLayout(event.matches);
    };
    updateLayout(query);
    query.addEventListener("change", updateLayout);
    return () => query.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setActivePanel("controls");
      setIsLeftDrawerOpen(false);
      setDragStartX(null);
      setDragOffsetX(0);
      setDragIntent('none');
    }
  }, [isMobileLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateWidth = () => {
      setPaneWidth(window.innerWidth);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    window.visualViewport?.addEventListener("resize", updateWidth);
    return () => {
      window.removeEventListener("resize", updateWidth);
      window.visualViewport?.removeEventListener("resize", updateWidth);
    };
  }, [isMobileLayout]);

  // Global Keyboard Registry Initialization
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyboardRegistry.handle(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle Listening mode Queue Appending (90% threshold)
  useEffect(() => {
     if (!isListeningMode || !listeningModeState) return;
     
     const total = playlist.queue.length;
     if (total === 0) return;
     
     const currentIndex = player.currentIndex;
     const playedPercentage = (currentIndex + 1) / total;
     
     if (playedPercentage >= 0.9 && !isFetchingMode) {
         const nextIndex = listeningModeState.currentPlaylistIndex + 1;
         if (nextIndex < listeningModeState.playlists.length) {
             setIsFetchingMode(true);
             const nextId = listeningModeState.playlists[nextIndex].id;
             
             fetchNeteasePlaylist(nextId.toString())
               .then(rawTracks => {
                  const playableTracks = rawTracks.filter(t => t.fee !== 1 && t.fee !== 4);
                  if (playableTracks.length > 0) {
                      const shuffled = playableTracks.sort(() => Math.random() - 0.5);
                      
                      const newSongs = shuffled.map((t, idx) => ({
                         id: `${t.id}-${Date.now()}-next-${idx}`,
                         title: t.title,
                         artist: t.artist,
                         album: t.album,
                         coverUrl: t.coverUrl,
                         duration: t.duration || 0,
                         platform: 'netease' as any,
                         platformId: t.neteaseId,
                         isNetease: true,
                         neteaseId: t.neteaseId,
                         fileUrl: getApiUrl(`/api/audio/netease/${t.neteaseId}`),
                         needsLyricsMatch: true
                      }));
                      
                      playlist.setQueue(prev => [...prev, ...newSongs]);
                      playlist.setOriginalQueue(prev => [...prev, ...newSongs]);
                      
                      setListeningModeState(prev => prev ? {
                         ...prev,
                         currentPlaylistIndex: nextIndex
                      } : null);
                  }
               })
               .catch(console.error)
               .finally(() => setIsFetchingMode(false));
         } 
     }
  }, [player.currentIndex, isListeningMode, listeningModeState, playlist.queue.length, isFetchingMode]);

  // Global Search Shortcut 
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setShowSearch(prev => !prev);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileChange = async (files: FileList | File[]) => {
    const wasEmpty = playlist.queue.length === 0;
    const addedSongs = await playlist.addLocalFiles(files);
    if (addedSongs.length > 0) {
      setTimeout(() => {
        handlePlaylistAddition(addedSongs, wasEmpty);
      }, 0);
    }
  };

  const handleDirectoryRestore = async () => {
    if (!showRestorePrompt) return;
    setIsRestoring(true);
    try {
      const granted = await verifyPermission(showRestorePrompt.handle, true);
      if (granted) {
          const config = await loadConfigFromFile(showRestorePrompt.handle);
          if (config && config.favorites) {
              localStorage.setItem('aura_favorites', JSON.stringify(config.favorites));
              window.dispatchEvent(new Event('favorites-updated'));
          }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRestoring(false);
      setShowRestorePrompt(null);
    }
  };

  const handleDirectorySelected = async (handle: FileSystemDirectoryHandle) => {
    try {
      const files = await getFilesFromDirectory(handle);
      if (files.length > 0) {
        const addedSongs = await playlist.addLocalFiles(files as any);
        if (addedSongs.length > 0) {
          try {
            const savedFavorites = localStorage.getItem('aura_favorites');
            const parsed = savedFavorites ? JSON.parse(savedFavorites) : [];
            let favorites: Song[] = Array.isArray(parsed) ? parsed : [];
            const existingIds = new Set(favorites.map((s: Song) => s.id));
            
            addedSongs.forEach((song: Song) => {
              if (!existingIds.has(song.id)) {
                favorites.push(song);
              }
            });
            localStorage.setItem('aura_favorites', JSON.stringify(favorites));
            window.dispatchEvent(new Event('favorites-updated'));
          } catch (err) { }
          handlePlaylistAddition(addedSongs, playlist.queue.length === 0);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateLyrics = async (type: 'transcribe' | 'translate') => {
    if (!currentSong) return;
    setIsAiGenerating({ id: currentSong.id, type });

    try {
      const formData = new FormData();
      formData.append('type', type);
      
      if (type === 'translate' && currentSong.lyrics && currentSong.lyrics.length > 0) {
        // Send existing lyrics for translation
        const lrcText = currentSong.lyrics.map(l => `[${new Date(l.time * 1000).toISOString().substr(14, 5)}.${Math.floor((l.time % 1) * 100).toString().padStart(2, '0')}]${l.text}`).join('\n');
        formData.append('lyrics', lrcText);
      } else {
        // Send audio for transcription
        if (currentSong.fileUrl) {
          if (currentSong.fileUrl.startsWith('blob:')) {
            try {
              const response = await fetch(currentSong.fileUrl);
              const blob = await response.blob();
              formData.append('audio', blob, 'audio.mp3');
            } catch(e) {
               throw new Error("Cannot prepare audio. Ensure the file is accessible.");
            }
          } else {
            // For remote or relative URIs, just pass the URL and let the server download it
            formData.append('audioUrl', currentSong.fileUrl);
          }
        }
      }

      const response = await fetch(getApiUrl('/api/gemini/lyrics'), {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errObj = await response.json().catch(() => null);
        throw new Error(errObj?.error || await response.text());
      }

      const data = await response.json();
      if (data.lyrics) {
        // Parse the returned LRC
        const { parseLrc } = await import('./services/utils');
        const updatedLyrics = await parseLrc(data.lyrics);
        
        // Update the current song
        playlist.updateSongInQueue(currentSong.id, { lyrics: updatedLyrics });
      }
    } catch (e: any) {
      console.error(e);
      alert('AI Generation failed: ' + e.message);
    } finally {
      setIsAiGenerating(null);
    }
  };

  const handlePlayFavorites = (index: number, favorites: Song[]) => {
    playlist.setQueue(favorites);
    playlist.setOriginalQueue(favorites);
    setTimeout(() => {
        playIndex(index);
    }, 50);
  };

  const handleImportUrl = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const wasEmpty = playlist.queue.length === 0;
    const result = await playlist.importFromUrl(trimmed);
    if (!result.success) {
      alert(result.message ?? "Failed to load songs from URL");
      return;
    }
    if (result.songs.length > 0) {
      try {
        const savedFavorites = localStorage.getItem('aura_favorites');
        const parsed = savedFavorites ? JSON.parse(savedFavorites) : [];
        let favorites: Song[] = Array.isArray(parsed) ? parsed : [];
        const existingIds = new Set(favorites.map((s: Song) => s.id));
        
        result.songs.forEach((song: Song) => {
          if (!existingIds.has(song.id)) {
            favorites.push(song);
          }
        });
        localStorage.setItem('aura_favorites', JSON.stringify(favorites));
        window.dispatchEvent(new Event('favorites-updated'));
      } catch (err) {
        console.error('Failed to save to favorites', err);
      }

      setTimeout(() => {
        handlePlaylistAddition(result.songs, wasEmpty);
      }, 0);
    }
  };

  const handleImportAndPlay = (song: Song) => {
    const wasEmpty = playlist.queue.length === 0;
    
    if (wasEmpty) {
        playlist.setQueue([song]);
        playlist.setOriginalQueue([song]);
        handlePlaylistAddition([song], true);
    } else {
        const insertIndex = player.currentIndex >= 0 ? player.currentIndex + 1 : playlist.queue.length;
        
        playlist.setQueue(prev => {
            const next = [...prev];
            next.splice(insertIndex, 0, song);
            return next;
        });
        playlist.setOriginalQueue(prev => {
            const next = [...prev];
            next.splice(insertIndex, 0, song);
            return next;
        });
        
        setTimeout(() => {
            playIndex(insertIndex); 
        }, 50);
    }
  };

  const handleModeSelect = async (modeName: string, overrideMixMode?: string) => {
    setIsLeftDrawerOpen(false);
    setActiveMood(modeName);
    
    if (audioRef.current && audioRef.current.getAttribute('src')) {
        audioRef.current.play().catch(() => {});
        audioRef.current.pause();
    }
    
    // We are no longer using the dummy '默认模式' mood name as an exit, because Mix Mode handles that.
    if (!modeName) return;

    const EMOTION_MODES = ['快乐时光', 'Chill 放松', '深夜 emo'];
    const isEmotionMode = EMOTION_MODES.includes(modeName);

    const keywordsMap: Record<string, string[]> = {
       '快乐时光': ['欢快', '动感', '快乐', '节奏', '激情', '愉悦'],
       '深夜 emo': ['伤感', '孤独', '夜晚', '思念', '寂寞', '遗憾', '催泪', 'emo', '心碎', '深夜', '痛', '失恋', '爱而不得'],
       '助眠': ['助眠', '白噪音', '睡眠', '安静'],
       '动感健身': ['健身', '跑步', '运动', '燃脂'],
       '洗澡': ['洗澡', '放松', '浴室', '轻快'],
       'Chill 放松': ['治愈', '放松', '清新', '下午茶', '轻音乐', '安静', '慵懒', '睡眠', '午后', '发呆', '散步'],
       '图书馆': ['图书馆', '学习', '专注', '轻音乐'],
       '通勤必听': ['通勤', '早晨', '路上', '地铁'],
    };

    let keywords = keywordsMap[modeName] || [modeName];
    const searchKeyword = keywords[Math.floor(Math.random() * keywords.length)];

    setIsFetchingMode(true);
    try {
        const playlists = await searchNetEasePlaylists(searchKeyword, 10);
        
        let initialPlaylistIndex = 0;
        let newTracks: typeof playlist.queue = [];

        if (playlists.length > 0) {
            for (let i = 0; i < playlists.length; i++) {
                const rawTracks = await fetchNeteasePlaylist(playlists[i].id.toString());
                const playableTracks = rawTracks.filter(t => t.fee !== 1 && t.fee !== 4);
                
                // If it's an emotion mode, ensure it feels like a Chinese playlist.
                // Or if it's the very last playlist checked, just fallback to it.
                if (playableTracks.length > 0) {
                    if (isEmotionMode && i < playlists.length - 1 && !isChinesePlaylist(playableTracks, 0.4)) {
                        continue;
                    }
                    
                    newTracks = playableTracks.map((t, idx) => ({
                        id: `${t.id}-${Date.now()}-first-${idx}`,
                        title: t.title,
                        artist: t.artist,
                        album: t.album,
                        coverUrl: t.coverUrl,
                        duration: t.duration || 0,
                        platform: 'netease' as any,
                        platformId: t.neteaseId,
                        isNetease: true,
                        neteaseId: t.neteaseId,
                        fileUrl: getApiUrl(`/api/audio/netease/${t.neteaseId}`),
                        needsLyricsMatch: true
                    }));
                    initialPlaylistIndex = i;
                    break;
                }
            }
        }
        
        // Read user's favorites
        let favoriteSongs: Song[] = [];
        try {
            const savedFavorites = localStorage.getItem('aura_favorites');
            if (savedFavorites) {
                const parsed = JSON.parse(savedFavorites);
                if (Array.isArray(parsed)) {
                    favoriteSongs = parsed;
                }
            }
        } catch (e) {}
        
        // Inject tags from background mood dictionary
        const moodDict = getMoodDictionary();
        favoriteSongs = favoriteSongs.map(song => {
             let nextTags = Array.isArray(song.tags) ? song.tags : [];
             if (moodDict[song.id] && Array.isArray(moodDict[song.id])) {
                 nextTags = Array.from(new Set([...nextTags, ...moodDict[song.id]]));
             }
             if (nextTags.length > 0) {
                 const detectedLang = detectLyricsLanguage(song.lyrics);
                 const { tags: resolved, hadConflict } = prioritizeTags(nextTags, detectedLang, song.title + ' ' + song.artist);
                 return { 
                     ...song, 
                     tags: resolved,
                     needsGeminiResolution: hadConflict || song.needsGeminiResolution
                 };
             }
             return song;
        });
        
        // Filter favorites strictly by explicitly matched tags, but only for Emotion modes.
        // For Scene modes, we don't match tags, so poolOfFavorites remains empty, 
        // meaning we'll just play the searched playlist.
        let poolOfFavorites: Song[] = [];
        
        if (isEmotionMode) {
            poolOfFavorites = favoriteSongs.filter(song => {
                 if (song.tags && Array.isArray(song.tags)) {
                     return song.tags.some(tag => keywords.some(kw => tag.includes(kw)));
                 }
                 return false;
            });
        }
        
        poolOfFavorites = poolOfFavorites.sort(() => Math.random() - 0.5);
        newTracks = newTracks.sort(() => Math.random() - 0.5);
        
        // Determine mix ratio based on activeMixMode
        const currentMixMode = overrideMixMode || activeMixMode;
        let favRatio = 0.6; // 默认模式: 60%
        if (currentMixMode === '熟悉模式') favRatio = 0.9; // 熟悉模式: 90%
        if (currentMixMode === '新鲜模式') favRatio = 0.3; // 新鲜模式: 30%
        
        const totalTracks = 40; // Generate a queue of 40 tracks
        let targetFavs = Math.floor(totalTracks * favRatio);
        let targetNew = totalTracks - targetFavs;
        
        // Adjust if we don't have enough tracks
        if (poolOfFavorites.length < targetFavs) {
            targetFavs = poolOfFavorites.length;
            targetNew = totalTracks - targetFavs;
        }
        if (newTracks.length < targetNew) {
            targetNew = newTracks.length;
        }
        
        const finalMix: Song[] = [];
        const favSelection = poolOfFavorites.slice(0, targetFavs);
        const newSelection = newTracks.slice(0, targetNew);
        
        // Interleave them so the ratio is consistent visually
        const combined = [...favSelection, ...newSelection].sort(() => Math.random() - 0.5);

        if (combined.length > 0) {
            setIsListeningMode(true);
            playlist.setQueue(combined);
            playlist.setOriginalQueue(combined);
            
            setListeningModeState({
                keyword: searchKeyword,
                playlists: playlists,
                currentPlaylistIndex: initialPlaylistIndex
            });
            
            setIsFetchingMode(false);
            setTimeout(() => playIndex(0), 50);
        } else {
            setIsFetchingMode(false);
        }
    } catch(e) {
        console.error("Listening mode error", e);
        setIsFetchingMode(false);
    }
  };

  
  const handleAddToQueue = (song: Song) => {
      const insertIndex = player.currentIndex >= 0 ? player.currentIndex + 1 : playlist.queue.length;
      
      playlist.setQueue(prev => {
          const next = [...prev];
          next.splice(insertIndex, 0, song);
          return next;
      });
      playlist.setOriginalQueue(prev => {
          const next = [...prev];
          next.splice(insertIndex, 0, song);
          return next;
      });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return; // Only left clicks/touches
    // Disable if clicking on a button or scrollable element
    if (event.target instanceof Element && event.target.closest('button, input, textarea, a, .hide-scrollbar, .playlist-scrollbar, .cursor-pointer')) return;
    
    pointerRef.current.id = event.pointerId;
    setDragStartX(event.clientX);
    setDragOffsetX(0);
    setIsDragging(true);
    setDragIntent('none');
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX === null || event.pointerId !== pointerRef.current.id) return;
    const currentX = event.clientX;
    const deltaX = currentX - dragStartX;
    const containerWidth = event.currentTarget.getBoundingClientRect().width;
    
    let currentIntent = dragIntent;
    if (currentIntent === 'none') {
        if (Math.abs(deltaX) > 10) {
            if (isLeftDrawerOpen) {
                currentIntent = 'leftDrawer';
            } else if (!isMobileLayout || activePanel === 'controls') {
                if (deltaX > 0) {
                    currentIntent = 'leftDrawer';
                } else if (isMobileLayout) {
                    currentIntent = 'lyrics';
                } else {
                    return; // Ignore other drags on desktop
                }
            } else if (isMobileLayout && activePanel === 'lyrics') {
                currentIntent = 'lyrics';
            }
            setDragIntent(currentIntent);
        } else {
            return;
        }
    }

    if (currentIntent === 'leftDrawer') {
        setDragOffsetX(deltaX);
    } else if (currentIntent === 'lyrics' && isMobileLayout) {
        const limitedDelta = Math.max(
          Math.min(deltaX, containerWidth),
          -containerWidth,
        );
        setDragOffsetX(limitedDelta);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX === null || event.pointerId !== pointerRef.current.id) return;
    
    const deltaX = event.clientX - dragStartX;
    const threshold = 60;
    
    if (isLeftDrawerOpen && Math.abs(deltaX) < 10) {
      const drawerWidth = window.innerWidth < 768 ? window.innerWidth * 0.85 : window.innerWidth * 0.3;
      if (dragStartX > drawerWidth) {
        setIsLeftDrawerOpen(false);
      }
    }

    if (dragIntent === 'leftDrawer') {
        if (!isLeftDrawerOpen && deltaX > threshold) {
            setIsLeftDrawerOpen(true);
        } else if (isLeftDrawerOpen && deltaX < -threshold) {
            setIsLeftDrawerOpen(false);
        }
    } else if (dragIntent === 'lyrics' && isMobileLayout) {
        if (deltaX > threshold) {
          setActivePanel("controls");
        } else if (deltaX < -threshold) {
          setActivePanel("lyrics");
        }
    }
    
    setDragStartX(null);
    setDragOffsetX(0);
    setIsDragging(false);
    setTimeout(() => setDragIntent('none'), 10);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === pointerRef.current.id) {
      setDragStartX(null);
      setDragOffsetX(0);
      setIsDragging(false);
      setDragIntent('none');
    }
  };

  const toggleIndicator = () => {
    setActivePanel((prev) => (prev === "controls" ? "lyrics" : "controls"));
    setDragOffsetX(0);
    setIsDragging(false);
  };

  const [lastValidColors, setLastValidColors] = useState<string[]>([]);
  const [lastValidAccentColor, setLastValidAccentColor] = useState<string>("#a855f7");

  useEffect(() => {
    if (currentSong?.colors && currentSong.colors.length > 0) {
      setLastValidColors(currentSong.colors);
    }
    if (accentColor && accentColor !== "#a855f7") {
      setLastValidAccentColor(accentColor);
    }
  }, [currentSong?.colors, accentColor]);

  const displayAccentColor = (accentColor === "#a855f7" && lastValidAccentColor !== "#a855f7") 
    ? lastValidAccentColor 
    : accentColor;

  const isNeteaseVipPending = currentSong && 
    (currentSong.isNetease || currentSong.platform === 'netease') && 
    (currentSong.fee === 1 || currentSong.fee === 4 || !currentSong.fileUrl) && 
    !currentSong.bilibiliFallbackResolved;

  useEffect(() => {
    if (isNeteaseVipPending && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  }, [isNeteaseVipPending, audioRef]);

  const displayCoverUrl = isNeteaseVipPending ? undefined : currentSong?.coverUrl;
  const displayColors = currentSong?.colors?.length ? currentSong.colors : lastValidColors;

  const controlsSection = (
    <div className="flex flex-col items-center justify-center w-full h-full z-30 relative p-4">
      <div className="relative flex flex-col items-center gap-8 w-full max-w-[360px]">
        <div 
          className={`relative aspect-square w-64 md:w-72 lg:w-[300px] bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl shadow-black/50 overflow-hidden touch-none select-none [-webkit-user-drag:none] ${isFetchingMode ? 'rounded-full animate-[spin_3s_linear_infinite]' : 'rounded-3xl'}`}
          onDragStart={(e) => e.preventDefault()}
        >
          {isFetchingMode ? (
            <div className="w-full h-full rounded-2xl flex flex-col items-center justify-center relative select-none [-webkit-user-drag:none]">
               <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin"></div>
            </div>
          ) : displayCoverUrl ? (
            <SafeImage
              src={displayCoverUrl}
              alt="Album Art"
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              style={{ touchAction: 'none' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-white/20 select-none pointer-events-none [-webkit-user-drag:none]">
              <div className="text-8xl mb-4">♪</div>
              <p className="text-sm">No Music Loaded</p>
            </div>
          )}
        </div>

        <Controls
          isPlaying={playState === PlayState.PLAYING}
          onPlayPause={togglePlay}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          currentSong={currentSong || null}
          title={currentSong?.title || "Welcome to Aura"}
          artist={currentSong?.artist || "Select a song"}
          audioRef={audioRef}
          onNext={playNext}
          onPrev={playPrev}
          playMode={playMode}
          onToggleMode={toggleMode}
          onTogglePlaylist={() => setShowPlaylist(prev => !prev)}
          accentColor={displayAccentColor}
          volume={volume}
          onVolumeChange={setVolume}
        />

        {/* Floating Playlist Panel */}
        <PlaylistPanel
          isOpen={showPlaylist}
          onClose={() => setShowPlaylist(false)}
          queue={playlist.queue}
          currentSongId={currentSong?.id}
          onPlay={playIndex}
          onPlayFavorites={handlePlayFavorites}
          onImport={handleImportUrl}
          onRemove={playlist.removeSongs}
          accentColor={displayAccentColor}
        />
      </div>
    </div>
  );

  const hasLyrics = currentSong && currentSong.lyrics && currentSong.lyrics.length > 0;
  
  let showTranslateButton = false;
  if (hasLyrics && currentSong.lyrics) {
    const fullText = currentSong.lyrics.map(l => l.text).join('').replace(/\s+/g, '');
    const chineseMatch = fullText.match(/[\u4e00-\u9fa5]/g);
    const chineseCount = chineseMatch ? chineseMatch.length : 0;
    
    if (fullText.length > 0) {
      const nonChineseProportion = (fullText.length - chineseCount) / fullText.length;
      showTranslateButton = nonChineseProportion > 0.8;
    }
  }

  const lyricsSection = (
    <div className="w-full h-full relative z-20 flex flex-col justify-center px-4 lg:pl-12 py-16 lg:py-24 group">
      {currentSong && !hasLyrics && (
         <div className="absolute bottom-6 right-6 lg:bottom-12 lg:right-12 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
             <button 
                onClick={() => handleGenerateLyrics('transcribe')} 
                disabled={!!isAiGenerating} 
                className="pointer-events-auto flex items-center gap-2 px-6 py-2 rounded-full bg-black/40 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white shadow-xl hover:scale-105 active:scale-95 transition-all text-sm font-medium disabled:opacity-50 disabled:scale-100"
             >
                 {isAiGenerating?.type === 'transcribe' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                 {isAiGenerating?.type === 'transcribe' ? 'Transcribing...' : 'AI Transcribe Lyrics'}
             </button>
         </div>
      )}
      {currentSong && showTranslateButton && (
         <div className="absolute bottom-6 right-6 lg:bottom-12 lg:right-12 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button 
                onClick={() => handleGenerateLyrics('translate')} 
                disabled={!!isAiGenerating} 
                className="pointer-events-auto flex items-center gap-2 px-6 py-2 rounded-full bg-black/40 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white shadow-xl hover:scale-105 active:scale-95 transition-all text-sm font-medium disabled:opacity-50 disabled:scale-100"
             >
                {isAiGenerating?.type === 'translate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                {isAiGenerating?.type === 'translate' ? 'Translating...' : 'AI Translate'}
            </button>
         </div>
      )}
      <LyricsView
        key={currentSong?.id}
        lyrics={currentSong?.lyrics || []}
        audioRef={audioRef}
        isPlaying={playState === PlayState.PLAYING}
        currentTime={currentTime}
        onSeekRequest={handleSeek}
        matchStatus={matchStatus}
      />
    </div>
  );

  // Background loop to resolve Gemini conflicts
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const processQueue = async () => {
      try {
        const savedFavorites = localStorage.getItem('aura_favorites');
        let favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
        if (!Array.isArray(favorites)) return;
        
        let needUpdate = false;
        let moodDict = getMoodDictionary();
        
        for (const song of favorites) {
             let nextTags = Array.isArray(song.tags) ? song.tags : [];
             if (moodDict[song.id] && Array.isArray(moodDict[song.id])) {
                 nextTags = Array.from(new Set([...nextTags, ...moodDict[song.id]]));
             }
             const detectedLang = detectLyricsLanguage(song.lyrics);
             const { tags: resolvedTags, hadConflict } = prioritizeTags(nextTags, detectedLang, song.title + ' ' + song.artist);
             
             // Ensure song.tags are updated with resolved tags continuously
             if (JSON.stringify(song.tags) !== JSON.stringify(resolvedTags)) {
                 song.tags = resolvedTags;
                 needUpdate = true;
             }
             
             // If this song has unresolved conflict, or specifically flagged
             if (hadConflict || song.needsGeminiResolution) {
                 const geminiEmotion = await resolveSongEmotionWithGemini(song);
                 if (geminiEmotion) {
                     // We replace its moodDict tags entirely with the pure emotion
                     moodDict[song.id] = [geminiEmotion];
                     saveMoodDictionary(moodDict);
                     
                     // Update in-memory favorites list
                     song.needsGeminiResolution = false;
                     // We won't try to write it to song.tags directly here, it will be mapped later 
                     // But we should reset the need flag to stop re-evaluating
                     needUpdate = true;
                     console.log(`Gemini resolved ${song.title} -> ${geminiEmotion}`);
                 } else {
                     // Add an empty array or something if it fails to stop infinite loops?
                     // Actually just clear the flag
                     song.needsGeminiResolution = false;
                     needUpdate = true;
                 }
                 // Delay between calls to prevent rate limiting
                 await new Promise(r => setTimeout(r, 3000));
                 moodDict = getMoodDictionary(); // Refresh in case it changed
             }
        }
        
        if (needUpdate) {
            localStorage.setItem('aura_favorites', JSON.stringify(favorites));
            window.dispatchEvent(new CustomEvent('favorites-updated'));
        }
      } catch (e) {
          console.error("Gemini classification failed", e);
      } finally {
          // Check again in 60 seconds
          clearTimeout(timeout);
          timeout = setTimeout(processQueue, 60000);
      }
    };
    
    // Start initial delay before kicking off background process
    timeout = setTimeout(processQueue, 10000);

    const forceCheck = () => {
       clearTimeout(timeout);
       processQueue();
    };
    window.addEventListener('force-gemini-check', forceCheck);

    return () => {
        clearTimeout(timeout);
        window.removeEventListener('force-gemini-check', forceCheck);
    };
  }, []);

  const fallbackWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const effectivePaneWidth = paneWidth || fallbackWidth;
  const baseOffset = activePanel === "lyrics" ? -effectivePaneWidth : 0;
  const mobileTranslate = baseOffset + dragOffsetX;

  return (
    <div 
      className="relative w-full h-screen flex flex-col overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <ListeningModeDrawer
        isOpen={isLeftDrawerOpen}
        onClose={() => setIsLeftDrawerOpen(false)}
        dragOffset={dragIntent === 'leftDrawer' ? dragOffsetX : 0}
        isDragging={isDragging && dragIntent === 'leftDrawer'}
        onMixModeSelect={(mode) => {
            setActiveMixMode(mode as any);
            if (activeMood) {
                // Re-trigger the selection to rebuild the queue with the new mix ratio
                handleModeSelect(activeMood, mode);
            }
        }}
        onMoodSelect={(mood) => handleModeSelect(mood)}
        isLoading={isFetchingMode}
        activeMixMode={activeMixMode}
        activeMood={activeMood}
        favoritesCount={favoritesCount}
      />
      {isMobileLayout ? (
        <MobileFluidBackground
          colors={displayColors}
          coverUrl={displayCoverUrl}
          isPlaying={playState === PlayState.PLAYING}
        />
      ) : (
        <FluidBackground
          colors={displayColors}
          coverUrl={displayCoverUrl}
          isPlaying={playState === PlayState.PLAYING}
        />
      )}

      <audio
        key={currentSong?.fileUrl || 'default-audio-key'}
        ref={audioRef}
        src={(currentSong && (currentSong.isNetease || currentSong.platform === 'netease') && (currentSong.fee === 1 || currentSong.fee === 4 || !currentSong.fileUrl) && !currentSong.bilibiliFallbackResolved) ? undefined : (currentSong?.fileUrl || undefined)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
        onError={handleAudioError}
        crossOrigin="anonymous"
        preload="auto"
      />

      <KeyboardShortcuts
        isPlaying={playState === PlayState.PLAYING}
        onPlayPause={togglePlay}
        onNext={playNext}
        onPrev={playPrev}
        onSeek={handleSeek}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        onVolumeChange={setVolume}
        onToggleMode={toggleMode}
      />

      {/* Top Bar */}
      <TopBar 
        onFilesSelected={handleFileChange} 
        onSearchClick={() => setShowSearch(true)}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Directory Restore Prompt */}
      {showRestorePrompt && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] pointer-events-auto">
          <div className="bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-[panel-in_0.3s_ease-out]">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <FolderHeart size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-medium text-sm">Restore Configuration?</span>
              <span className="text-white/60 text-xs">Allow access to sync your configuration folder.</span>
            </div>
            <div className="flex gap-2 ml-4">
              <button 
                onClick={() => setShowRestorePrompt(null)}
                className="px-3 py-1.5 rounded-lg hover:bg-white/10 text-white/60 text-xs font-medium transition-colors"
                disabled={isRestoring}
              >
                Dismiss
              </button>
              <button 
                onClick={handleDirectoryRestore}
                className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2"
                disabled={isRestoring}
              >
                {isRestoring ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        onSyncComplete={(config) => {
            if (config && config.favorites) {
                localStorage.setItem('aura_favorites', JSON.stringify(config.favorites));
                window.dispatchEvent(new Event('favorites-updated'));
            }
            setShowSettings(false);
        }}
      />

      {/* Search Modal - Always rendered to preserve state, visibility handled internally */}
      <SearchModal 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)}
        queue={playlist.queue}
        onPlayQueueIndex={playIndex}
        onImportAndPlay={handleImportAndPlay}
        onAddToQueue={handleAddToQueue}
        currentSong={currentSong}
        isPlaying={playState === PlayState.PLAYING}
      />

      {/* Main Content Split */}
      {isMobileLayout ? (
        <div className="flex-1 relative w-full h-full">
          <div
            ref={mobileViewportRef}
            className="w-full h-full overflow-hidden"
          >
            <div
              className={`flex h-full ${isDragging ? "transition-none" : "transition-transform duration-300"}`}
              style={{
                width: `${effectivePaneWidth * 2}px`,
                transform: `translateX(${mobileTranslate}px)`,
              }}
            >
              <div
                className="flex-none h-full"
                style={{ width: effectivePaneWidth }}
              >
                {controlsSection}
              </div>
              <div
                className="flex-none h-full"
                style={{ width: effectivePaneWidth }}
              >
                {lyricsSection}
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <button
              type="button"
              onClick={toggleIndicator}
              className="relative flex h-4 w-28 items-center justify-center rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 transition-transform duration-200 active:scale-105"
              style={{
                transform: `translateX(${isDragging ? dragOffsetX * 0.04 : 0}px)`,
              }}
            >
              <span
                className={`absolute inset-0 rounded-full bg-white/25 backdrop-blur-[30px] transition-opacity duration-200 ${
                  activePanel === "controls" ? "opacity-90" : "opacity-60"
                }`}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid lg:grid-cols-2 w-full h-full">
          {controlsSection}
          {lyricsSection}
        </div>
      )}
    </div>
  );
};

export default App;