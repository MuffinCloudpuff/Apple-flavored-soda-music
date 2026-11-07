import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Song, PlayState, PlayMode } from "../types";
import { parseLrc, extractColors, shuffleArray, matchTrackFromList } from "../services/utils";
import { sourceManager, AbstractTrackInfo } from "../services/MusicSourceManager";
import { fetchLyricsById, searchAndMatchLyrics, fetchLrcLibLyrics } from "../services/lyricsService";
import { usePlaybackResumer } from "./usePlaybackResumer";

type MatchStatus = "idle" | "matching" | "success" | "failed";

interface UsePlayerParams {
  queue: Song[];
  originalQueue: Song[];
  updateSongInQueue: (id: string, updates: Partial<Song>) => void;
  setQueue: Dispatch<SetStateAction<Song[]>>;
}

export const usePlayer = ({
  queue,
  originalQueue,
  updateSongInQueue,
  setQueue,
}: UsePlayerParams) => {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playState, setPlayState] = useState<PlayState>(PlayState.PAUSED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playMode, setPlayMode] = useState<PlayMode>(PlayMode.LOOP_ALL);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("idle");
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const restoreTimeRef = useRef<{ id: string, time: number } | null>(null);
  const [preloadedIndex, setPreloadedIndex] = useState(-1);

  const saveRestoreTime = useCallback((time: number) => {
    if (queue[currentIndex]) {
        restoreTimeRef.current = { id: queue[currentIndex].id, time };
    }
  }, [queue, currentIndex]);

  const { markPaused, safePlay } = usePlaybackResumer(audioRef as React.RefObject<HTMLAudioElement>, updateSongInQueue, saveRestoreTime);

  useEffect(() => {
    nextAudioRef.current = new Audio();
  }, []);

  const currentSong = queue[currentIndex] ?? null;
  const accentColor = currentSong?.colors?.[0] || "#a855f7";

  const reorderForShuffle = useCallback(() => {
    if (originalQueue.length === 0) return;
    const currentId = currentSong?.id;
    const pool = originalQueue.filter((song) => song.id !== currentId);
    const shuffled = shuffleArray([...pool]);
    if (currentId) {
      const current = originalQueue.find((song) => song.id === currentId);
      if (current) {
        setQueue([current, ...shuffled]);
        setCurrentIndex(0);
        return;
      }
    }
    setQueue(shuffled);
    setCurrentIndex(0);
  }, [currentSong, originalQueue, setQueue]);

  const toggleMode = useCallback(() => {
    let nextMode: PlayMode;
    if (playMode === PlayMode.LOOP_ALL) nextMode = PlayMode.LOOP_ONE;
    else if (playMode === PlayMode.LOOP_ONE) nextMode = PlayMode.SHUFFLE;
    else nextMode = PlayMode.LOOP_ALL;

    setPlayMode(nextMode);
    setMatchStatus("idle");

    if (nextMode === PlayMode.SHUFFLE) {
      reorderForShuffle();
    } else {
      setQueue(originalQueue);
      if (currentSong) {
        const idx = originalQueue.findIndex(
          (song) => song.id === currentSong.id,
        );
        setCurrentIndex(idx !== -1 ? idx : 0);
      } else {
        setCurrentIndex(originalQueue.length > 0 ? 0 : -1);
      }
    }
  }, [playMode, reorderForShuffle, originalQueue, currentSong, setQueue]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (queue.length === 0) return;
    if (playState === PlayState.PLAYING) {
      audioRef.current.pause();
      markPaused();
      setPlayState(PlayState.PAUSED);
    } else {
      safePlay(queue[currentIndex]);
      setPlayState(PlayState.PLAYING);
    }
  }, [playState, queue, currentIndex, markPaused, safePlay]);

  const handleSeek = useCallback(
    (time: number, playImmediately: boolean = false) => {
      if (!audioRef.current) return;
      if (queue.length === 0) return;
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      if (playImmediately) {
        safePlay(queue[currentIndex]);
        setPlayState(PlayState.PLAYING);
      }
    },
    [queue, currentIndex, safePlay],
  );

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      
      // Preload next track at 90%
      if (duration > 0 && queue.length > 1 && time / duration >= 0.9) {
          const nextIdx = (currentIndex + 1) % queue.length;
          if (preloadedIndex !== nextIdx) {
              const nextSong = queue[nextIdx];
              if (nextSong && nextSong.fileUrl && nextAudioRef.current) {
                  setPreloadedIndex(nextIdx);
                  nextAudioRef.current.src = nextSong.fileUrl;
                  nextAudioRef.current.load();
              }
          }
      }
    }
  }, [duration, queue, currentIndex, preloadedIndex]);

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
    
    // Restore playback position if we are recovering from an error
    if (restoreTimeRef.current !== null && currentSong) {
        if (restoreTimeRef.current.id === currentSong.id && audioRef.current.duration >= restoreTimeRef.current.time) {
            audioRef.current.currentTime = restoreTimeRef.current.time;
            setCurrentTime(restoreTimeRef.current.time);
        }
        restoreTimeRef.current = null;
    }

    if (playState === PlayState.PLAYING) {
      safePlay(currentSong);
    }
  }, [playState, currentSong, safePlay]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    if (playMode === PlayMode.LOOP_ONE) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        safePlay(queue[currentIndex]);
      }
      return;
    }

    const next = (currentIndex + 1) % queue.length;
    setCurrentIndex(next);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [queue, playMode, currentIndex, safePlay]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    const prev = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prev);
    setMatchStatus("idle");
    setPlayState(PlayState.PLAYING);
  }, [queue.length, currentIndex]);

  const playIndex = useCallback(
    (index: number) => {
      // index limits check disabled here due to stale closures since it's frequently called via setTimout
      setCurrentIndex(index);
      setPlayState(PlayState.PLAYING);
      setMatchStatus("idle");
    },
    [],
  );

  const handlePlaylistAddition = useCallback(
    (added: Song[], wasEmpty: boolean) => {
      if (added.length === 0) return;
      setMatchStatus("idle");
      if (wasEmpty || currentIndex === -1) {
        setCurrentIndex(0);
        setPlayState(PlayState.PLAYING);
      }
      if (playMode === PlayMode.SHUFFLE) {
        reorderForShuffle();
      }
    },
    [currentIndex, playMode, reorderForShuffle],
  );

  const mergeLyricsWithMetadata = useCallback(
    (result: { lrc: string; tLrc?: string; metadata: string[] }) => {
      const parsed = parseLrc(result.lrc, result.tLrc);
      const metadataCount = result.metadata.length;
      const metadataLines = result.metadata.map((text, idx) => ({
        time: -0.01 * (metadataCount - idx),
        text,
      }));
      return [...metadataLines, ...parsed].sort((a, b) => a.time - b.time);
    },
    [],
  );

  const loadLyricsFile = useCallback(
    (file?: File) => {
      if (!file || !currentSong) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          const parsedLyrics = parseLrc(text);
          updateSongInQueue(currentSong.id, { lyrics: parsedLyrics });
          setMatchStatus("success");
        }
      };
      reader.readAsText(file);
    },
    [currentSong, updateSongInQueue],
  );

  useEffect(() => {
    if (!currentSong) return;

    // Fast return if we already have lyrics or we explicitly don't need them
    if (currentSong.lyrics && currentSong.lyrics.length > 0) {
      if (matchStatus !== "success") setMatchStatus("success");
      return;
    }

    if (currentSong.needsLyricsMatch === false) {
      if (matchStatus !== "failed") setMatchStatus("failed");
      return;
    }

    // Still trying to match, keep going... don't fetch repeatedly
    if (matchStatus === "success" || matchStatus === "failed") return;

    let isActive = true;

    const fetchLyrics = async () => {
      if (matchStatus !== "matching") {
        setMatchStatus("matching");
      }

      let raw: { lrc: string; tLrc?: string; metadata: string[] } | null = null;
      let matchedExact = false;

      // Priority 1: Exact Match
      if (currentSong.platform && currentSong.platformId) {
        const provider = sourceManager.getProvider(currentSong.platform as any);
        raw = provider ? await provider.getLyrics(currentSong.platformId) : await fetchLyricsById(currentSong.platformId);
        if (raw) matchedExact = true;
      } else if (currentSong.isNetease && currentSong.neteaseId) {
        raw = await fetchLyricsById(currentSong.neteaseId);
        if (raw) matchedExact = true;
      }

      if (raw) {
        updateSongInQueue(currentSong.id, {
          lyrics: mergeLyricsWithMetadata(raw),
          needsLyricsMatch: false,
        });
        if (isActive) setMatchStatus("success");
        return;
      }

      // Priority 2: Fuzzy Match
      // If exact fails, we must fuzzy match. BUT we need the accurate duration of the audio.
      // So if duration is not loaded yet (duration === 0), we ABORT the fetch and stay in 'idle' or 'matching'
      if (!duration || duration === 0) {
        // Wait for loadedmetadata to provide the actual duration.
        // We set back to idle so the next render (when duration updates) can re-trigger this block.
        if (isActive) setMatchStatus("idle");
        return;
      }

      try {
        // Clean the title for better cross-platform matching
        let cleanTitle = currentSong.title
          .replace(/【.*?】/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\(.*?\)/g, '')
          .replace(/（.*?）/g, '')
          .split('-')
          .pop() || currentSong.title;
        cleanTitle = cleanTitle.trim();

        const artistToUse = currentSong.artist === "Bilibili" ? "" : (currentSong.artist || "");
          
        const searchNeteaseFuzzy = async () => {
          let results = await sourceManager.searchPool(
            `${cleanTitle} ${artistToUse}`.trim(),
            { limit: 20 }
          );

          const hasNetease = results.some(r => r.platform === 'netease');
          if (!hasNetease) {
            const fallbackResults = await sourceManager.searchPool(cleanTitle, { limit: 10 });
            const existingIds = new Set(results.map(r => r.platformId));
            for (const fr of fallbackResults) {
              if (!existingIds.has(fr.platformId)) results.push(fr);
            }
          }

          const matchedFallback = matchTrackFromList(results, cleanTitle, artistToUse, duration || 0, 5);

          if (matchedFallback) {
              const provider = sourceManager.getProvider(matchedFallback.platform);
              let fuzzyRaw = null;
              if (provider) {
                fuzzyRaw = await provider.getLyrics(matchedFallback.platformId);
              } else if (matchedFallback.platform === "netease") {
                fuzzyRaw = await fetchLyricsById(matchedFallback.platformId);
              }

              if (fuzzyRaw) {
                console.log(`Matched! Using lyrics from ${matchedFallback.platformId}`);
                return fuzzyRaw;
              }
          }
          return null;
        };

        const sourcePlatform = currentSong.platform || (currentSong.isNetease ? 'netease' : 'local');

        if (sourcePlatform === 'netease' || currentSong.isNetease) {
          console.log("Netease song without exact lyrics, falling back to LRCLib.");
          raw = await fetchLrcLibLyrics(cleanTitle, artistToUse, duration);
        } else {
          console.log("Non-Netease song without exact lyrics, falling back to Netease pool search first.");
          raw = await searchNeteaseFuzzy();
          if (!raw) {
            console.log("Netease pool search failed, falling back to LRCLib.");
            raw = await fetchLrcLibLyrics(cleanTitle, artistToUse, duration);
          }
        }

        if (raw) {
          updateSongInQueue(currentSong.id, {
            lyrics: mergeLyricsWithMetadata(raw),
            needsLyricsMatch: false,
          });
          if (isActive) setMatchStatus("success");
        } else {
          // Priority 3: No Match
          updateSongInQueue(currentSong.id, {
            needsLyricsMatch: false,
          });
          if (isActive) setMatchStatus("failed");
        }
      } catch (e) {
        console.error("Fuzzy match failing", e);
        updateSongInQueue(currentSong.id, {
          needsLyricsMatch: false,
        });
        if (isActive) setMatchStatus("failed");
      }
    };

    fetchLyrics();

    return () => {
      isActive = false;
    };
  }, [currentSong, duration, matchStatus, updateSongInQueue, mergeLyricsWithMetadata]);

  useEffect(() => {
    if (
      !currentSong ||
      !currentSong.coverUrl ||
      (currentSong.colors && currentSong.colors.length > 0)
    ) {
      return;
    }

    const isNeteaseVip = (currentSong.isNetease || currentSong.platform === 'netease') && 
                         (currentSong.fee === 1 || currentSong.fee === 4 || !currentSong.fileUrl);

    if (isNeteaseVip && !currentSong.bilibiliFallbackResolved) {
      return;
    }

    extractColors(currentSong.coverUrl)
      .then((colors) => {
        if (colors.length > 0) {
          updateSongInQueue(currentSong.id, { colors });
        }
      })
      .catch((err) => console.warn("Color extraction failed", err));
  }, [currentSong, updateSongInQueue]);

  // VIP Fallback for Netease
  useEffect(() => {
    if (!currentSong) return;
    if (currentSong.bilibiliFallbackResolved) return;

    const isNeteaseVip = (currentSong.isNetease || currentSong.platform === 'netease') && 
                         (currentSong.fee === 1 || currentSong.fee === 4 || !currentSong.fileUrl);

    if (isNeteaseVip) {
      const resolveFallback = async () => {
        try {
          const bApi = sourceManager.getProvider('bilibili');
          if (bApi) {
            const results = await bApi.search(`${currentSong.title} ${currentSong.artist}`, { limit: 5 });
            const targetDuration = currentSong.duration ? currentSong.duration / 1000 : 0;
            const matchedFallback = matchTrackFromList(results, currentSong.title, currentSong.artist || "", targetDuration, 10);

            if (matchedFallback) {
              const bUrl = await bApi.getAudioUrl(matchedFallback.platformId);
              if (bUrl) {
                const bCoverUrl = matchedFallback.coverUrl;
                let newColors: string[] | undefined = undefined;
                if (bCoverUrl) {
                    try {
                        newColors = await extractColors(bCoverUrl);
                    } catch (e) { console.warn("Failed to extract bilibili cover colors", e); }
                }
                
                updateSongInQueue(currentSong.id, { 
                  fileUrl: bUrl,
                  coverUrl: bCoverUrl,
                  colors: newColors && newColors.length > 0 ? newColors : undefined,
                  bilibiliFallbackResolved: true 
                });
                return;
              }
            } else {
                console.warn(`No valid fallback found for ${currentSong.title}. Requirements: Duration=${targetDuration}s, Title=${currentSong.title}`);
            }
          }
        } catch (e) {
          console.warn("VIP Fallback to Bilibili failed", e);
        }
        updateSongInQueue(currentSong.id, { bilibiliFallbackResolved: true });
      };
      resolveFallback();
    } else {
        updateSongInQueue(currentSong.id, { bilibiliFallbackResolved: true });
    }
  }, [currentSong, updateSongInQueue]);

  useEffect(() => {
    if (!currentSong) return;
    
    // If no file URL and (either not Netease, or Netease fallback is already resolved)
    const isNetease = currentSong.isNetease || currentSong.platform === 'netease';
    const isUnplayable = !currentSong.fileUrl;
    
    if (isUnplayable) {
      if (!isNetease || currentSong.bilibiliFallbackResolved) {
        console.warn(`No file URL available for ${currentSong.title}. Skipping to next track.`);
        const timer = setTimeout(() => {
          playNext();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [currentSong, playNext]);

  const handleAudioError = useCallback(() => {
    if (!currentSong) return;
    const isNetease = currentSong.isNetease || currentSong.platform === 'netease';
    
    // If it's a Netease track, and the current fileUrl is the original Netease url, try refresh or fallback
    const isOriginalNeteaseUrl = currentSong.fileUrl && currentSong.fileUrl.includes('/api/audio/netease/');
    
    if (isNetease && isOriginalNeteaseUrl) {
       // First try to refresh the URL to bypass the NCM proxy cache
       // This fixes "Netease URL expired after 20 minutes" issue.
       let lastRefresh = 0;
       try {
           const urlObj = new URL(currentSong.fileUrl, window.location.origin);
           const t = urlObj.searchParams.get('t');
           if (t) lastRefresh = parseInt(t, 10);
       } catch(e) {}

       if (Date.now() - lastRefresh > 10000) {
           console.warn(`Audio error for ${currentSong.title}, trying to refresh Netease URL.`);
           if (audioRef.current && currentSong) {
               restoreTimeRef.current = { id: currentSong.id, time: audioRef.current.currentTime };
           }
           const newUrl = `/api/audio/netease/${currentSong.neteaseId || currentSong.platformId}?t=${Date.now()}`;
           updateSongInQueue(currentSong.id, { fileUrl: newUrl });
           return;
       }

       console.warn(`Audio error for ${currentSong.title}, attempting Bilibili fallback.`);
       const resolveFallback = async () => {
         try {
           const bApi = sourceManager.getProvider('bilibili');
           if (bApi) {
             const results = await bApi.search(`${currentSong.title} ${currentSong.artist}`, { limit: 5 });
             const targetDuration = currentSong.duration ? currentSong.duration / 1000 : 0;
             const matchedFallback = matchTrackFromList(results, currentSong.title, currentSong.artist || "", targetDuration, 10);

             if (matchedFallback) {
               const bUrl = await bApi.getAudioUrl(matchedFallback.platformId);
               if (bUrl) {
                 const bCoverUrl = matchedFallback.coverUrl;
                 let newColors: string[] | undefined = undefined;
                 if (bCoverUrl) {
                     try {
                         newColors = await extractColors(bCoverUrl);
                     } catch (e) { console.warn("Failed to extract bilibili cover colors", e); }
                 }
                 
                 updateSongInQueue(currentSong.id, { 
                   fileUrl: bUrl,
                   coverUrl: bCoverUrl,
                   colors: newColors && newColors.length > 0 ? newColors : undefined,
                   bilibiliFallbackResolved: true 
                 });
                 return;
               }
             } else {
                 console.warn(`No valid fallback found for ${currentSong.title}.`);
             }
           }
         } catch (e) {
           console.warn("Fallback to Bilibili failed on error", e);
         }
         updateSongInQueue(currentSong.id, { bilibiliFallbackResolved: true, fileUrl: "" });
       };
       resolveFallback();
    } else {
       console.warn(`Terminal audio error for ${currentSong.title}. Skipping to next track.`);
       setTimeout(playNext, 1000);
    }
  }, [currentSong, playNext, updateSongInQueue]);

  useEffect(() => {
    if (queue.length === 0) {
      if (currentIndex === -1) return;
      audioRef.current?.pause();
      markPaused();
      if (audioRef.current) {
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        audioRef.current.currentTime = 0;
      }
      setPlayState(PlayState.PAUSED);
      setCurrentIndex(-1);
      setCurrentTime(0);
      setDuration(0);
      setMatchStatus("idle");
      return;
    }

    if (currentIndex >= queue.length || !queue[currentIndex]) {
      const nextIndex = Math.max(0, Math.min(queue.length - 1, currentIndex));
      setCurrentIndex(nextIndex);
      setMatchStatus("idle");
    }
  }, [queue, currentIndex]);

  return {
    audioRef,
    currentSong,
    currentIndex,
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
    playIndex,
    handleTimeUpdate,
    handleLoadedMetadata,
    handlePlaylistAddition,
    loadLyricsFile,
    handleAudioError,
  };
};
