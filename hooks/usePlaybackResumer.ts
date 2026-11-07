import { useRef, useCallback } from "react";
import { Song } from "../types";

// This module encapsulates the logic for safely resuming playback after long pauses.
// It addresses iOS/Android audio stalls and expiring CDN URLs (like Netease)
// which cause the player to freeze if it has been paused for a long time.
export const usePlaybackResumer = (
  audioRef: React.RefObject<HTMLAudioElement>,
  updateSongInQueue: (id: string, updates: Partial<Song>) => void,
  saveRestoreTime: (time: number) => void
) => {
  const lastPauseTime = useRef<number>(Date.now());

  const markPaused = useCallback(() => {
    lastPauseTime.current = Date.now();
  }, []);

  const safePlay = useCallback(async (currentSong: Song | null): Promise<boolean> => {
    if (!audioRef.current || !currentSong) return false;

    const timeSincePause = Date.now() - lastPauseTime.current;
    const isNetworkUrl = currentSong.fileUrl && (currentSong.fileUrl.startsWith('http') || currentSong.fileUrl.startsWith('/api/'));
    const isStale = timeSincePause > 10 * 60 * 1000; // 10 minutes

    // 1. Proactive Stale Recovery
    if (isStale && isNetworkUrl) {
      console.log(`[PlaybackGuard] Audio paused for ${Math.round(timeSincePause / 60000)}m. Preventing stall...`);
      
      const isOriginalNeteaseUrl = currentSong.fileUrl.includes('/api/audio/netease/');
      if (isOriginalNeteaseUrl) {
        console.log("[PlaybackGuard] Refreshing Netease URL");
        const ct = audioRef.current.currentTime;
        saveRestoreTime(ct); // Save current time before URL refresh
        const newUrl = `/api/audio/netease/${currentSong.neteaseId || currentSong.platformId}?t=${Date.now()}`;
        updateSongInQueue(currentSong.id, { fileUrl: newUrl });
        return false; // defer to loadedmetadata
      } else {
        // Standard media element recovery
        try {
          const ct = audioRef.current.currentTime;
          audioRef.current.load();
          audioRef.current.currentTime = ct;
        } catch (e) {
          console.warn("[PlaybackGuard] Load skip failed", e);
        }
      }
    }

    // 2. Play Execution & Fallback Recovery
    try {
      await audioRef.current.play();
      // Track successful play to reset pause time
      lastPauseTime.current = Date.now();
      return true;
    } catch (err: any) {
      console.warn("[PlaybackGuard] Play rejected:", err);
      
      if (err.name !== "AbortError" && isNetworkUrl) {
        console.log("[PlaybackGuard] Attempting final recovery reload...");
        try {
           const ct = audioRef.current.currentTime;
           // If the browser stalled the socket, load() resets the media engine state.
           audioRef.current.load();
           audioRef.current.currentTime = ct;
           await audioRef.current.play();
           lastPauseTime.current = Date.now();
           return true; // Recovered
        } catch (recoveryErr) {
           console.error("[PlaybackGuard] Recovery fully failed", recoveryErr);
           return false;
        }
      }
      return false; // Play rejected and unrecoverable
    }
  }, [audioRef, updateSongInQueue]);

  return { markPaused, safePlay };
};
