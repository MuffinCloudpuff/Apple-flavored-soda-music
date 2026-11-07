import React, { useState, useRef, useEffect } from "react";
import { formatTime } from "../services/utils";
import Visualizer from "./Visualizer";
import {
  LoopIcon,
  LoopOneIcon,
  ShuffleIcon,
  VolumeHighFilledIcon,
  VolumeHighIcon,
  VolumeLowFilledIcon,
  VolumeLowIcon,
  VolumeMuteFilledIcon,
  VolumeMuteIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  NextIcon,
  LikeIcon,
  QueueIcon,
} from "./Icons";
import { PlayMode, Song } from "../types";

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  currentSong: Song | null;
  title: string;
  artist: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  onNext: () => void;
  onPrev: () => void;
  playMode: PlayMode;
  onToggleMode: () => void;
  onTogglePlaylist: () => void;
  accentColor: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  onSeek,
  currentSong,
  title,
  artist,
  audioRef,
  onNext,
  onPrev,
  playMode,
  onToggleMode,
  onTogglePlaylist,
  accentColor,
  volume,
  onVolumeChange,
}) => {
  const [showVolume, setShowVolume] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFavorites = () => {
      try {
        const saved = localStorage.getItem('aura_favorites');
        let parsed = [];
        try {
           parsed = saved ? JSON.parse(saved) : [];
        } catch { }
        const favorites: Song[] = Array.isArray(parsed) ? parsed : [];
        setIsLiked(favorites.some((f) => f.id === currentSong?.id));
      } catch {
        setIsLiked(false);
      }
    };
    syncFavorites();
    window.addEventListener('favorites-updated', syncFavorites);
    return () => window.removeEventListener('favorites-updated', syncFavorites);
  }, [currentSong]);

  const toggleLike = () => {
    if (!currentSong) return;
    try {
        const saved = localStorage.getItem('aura_favorites');
        let parsed = [];
        try {
           parsed = saved ? JSON.parse(saved) : [];
        } catch { }
        let favorites: Song[] = Array.isArray(parsed) ? parsed : [];
        const exists = favorites.some((f) => f.id === currentSong.id);
        if (exists) {
            favorites = favorites.filter((f) => f.id !== currentSong.id);
        } else {
            favorites.unshift(currentSong);
        }
        localStorage.setItem('aura_favorites', JSON.stringify(favorites));
        setIsLiked(!exists);
        window.dispatchEvent(new Event('favorites-updated'));
    } catch {}
  };

  // Close volume popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        volumeContainerRef.current &&
        !volumeContainerRef.current.contains(event.target as Node)
      ) {
        setShowVolume(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getModeIcon = () => {
    // Standard white colors, simplified hover
    const iconClass =
      "w-5 h-5 text-white/60 hover:text-white transition-colors";

    switch (playMode) {
      case PlayMode.LOOP_ONE:
        return (
          <div className="relative">
            <LoopOneIcon className={iconClass} />
            <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-white text-black rounded-[2px] px-0.5 leading-none">
              1
            </span>
          </div>
        );
      case PlayMode.SHUFFLE:
        return (
          <ShuffleIcon className={iconClass} />
        );
      default: // LOOP_ALL
        return (
          <LoopIcon className={iconClass} />
        );
    }
  };

  const getVolumeButtonIcon = () => {
    if (volume === 0) {
      return <VolumeMuteIcon className="w-5 h-5" />;
    }
    if (volume < 0.5) {
      return <VolumeLowIcon className="w-5 h-5" />;
    }
    return <VolumeHighIcon className="w-5 h-5" />;
  };

  const getVolumePopupIcon = () => {
    if (volume === 0) {
      return <VolumeMuteFilledIcon className="w-4 h-4" />;
    }
    if (volume < 0.5) {
      return <VolumeLowFilledIcon className="w-4 h-4" />;
    }
    return <VolumeHighFilledIcon className="w-4 h-4" />;
  };

  return (
    <div className="w-full flex flex-col items-center justify-center gap-2 text-white select-none">
      {/* Song Info */}
      <div className="text-center mb-1 px-4 pointer-events-none select-none [-webkit-user-drag:none]">
        <h2 className="text-2xl font-bold tracking-tight drop-shadow-md line-clamp-1">
          {title}
        </h2>
        <p className="text-white/60 text-lg font-medium line-clamp-1">
          {artist}
        </p>
      </div>

      {/* Spectrum Visualizer */}
      <div className="w-full flex justify-center h-8 mb-2">
        <Visualizer key={currentSong?.fileUrl || 'default-viz'} audioRef={audioRef} isPlaying={isPlaying} />
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-xl flex items-center gap-3 text-xs font-medium text-white/50 group/bar relative">
        <span className="w-10 text-right font-mono tracking-widest">
          {formatTime(currentTime)}
        </span>

        <div className="relative flex-1 h-8 flex items-center cursor-pointer group">
          {/* Background Track */}
          <div className="absolute inset-x-0 h-[3px] bg-white/20 rounded-full group-hover:h-[6px] transition-all duration-200 ease-out"></div>

          {/* Active Progress */}
          <div
            className="absolute left-0 h-[3px] rounded-full group-hover:h-[6px] transition-all duration-200 ease-out"
            style={{
              width: `${Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100))}%`,
              backgroundColor: "rgba(255,255,255,0.9)",
            }}
          ></div>

          {/* Input Range */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={Math.min(duration || 0, Math.max(0, currentTime || 0))}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>

        <span className="w-10 font-mono tracking-widest">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls Row - Flattened for Equal Spacing */}
      {/* Layout: [Mode] [Vol] [Prev] [Play] [Next] [Like] [List] */}
      <div className="w-full max-w-[380px] mt-6 px-2">
        <div className="flex items-center justify-between w-full">
          {/* 1. Play Mode */}
          <button
            onClick={onToggleMode}
            className="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
            title="Playback Mode"
          >
            {getModeIcon()}
          </button>

          {/* 2. Volume */}
          <div className="relative" ref={volumeContainerRef}>
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none ${
                showVolume ? "text-white" : "text-white/60 hover:text-white"
              }`}
              title="Volume"
            >
              {getVolumeButtonIcon()}
            </button>

            {/* Volume Popup (iOS 18 Style) */}
            {showVolume && (
              <div 
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 w-[52px] h-[150px] rounded-[26px] p-1.5 bg-black/20 backdrop-blur-[80px] saturate-150 shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 flex flex-col cursor-auto"
                style={{ animation: 'vol-pop 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards' }}
              >
                <style>{`
                  @keyframes vol-pop {
                    0% { opacity: 0; transform: translate(-50%, 10px) scale(0.95); }
                    100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
                  }
                `}</style>
                <div className="relative w-full flex-1 rounded-[20px] bg-white/20 overflow-hidden">
                  {/* Fill */}
                  <div
                    className="absolute bottom-0 w-full bg-white transition-[height] duration-100 ease-out"
                    style={{ height: `${volume * 100}%` }}
                  />

                  {/* Input Overlay */}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none focus:outline-none"
                    style={
                      {
                        WebkitAppearance: "slider-vertical",
                        appearance: "slider-vertical",
                      } as any
                    }
                  />

                  {/* Icon Overlay (Mix Blend Mode) */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none text-white mix-blend-difference">
                    {getVolumePopupIcon()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Previous */}
          <button
            onClick={onPrev}
            className="text-white hover:text-white/70 transition-colors active:scale-90 duration-200 focus:outline-none"
            aria-label="Previous"
          >
            <PrevIcon className="w-9 h-9" />
          </button>

          {/* 4. Play/Pause (Center) */}
          <button
            onClick={onPlayPause}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform duration-200 shadow-lg shadow-white/10 focus:outline-none"
          >
            <div className="relative w-6 h-6">
              {/* Pause Icon */}
              <PauseIcon
                className={`absolute inset-0 w-full h-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isPlaying ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90"}`}
              />

              <PlayIcon
                className={`absolute inset-0 w-full h-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${!isPlaying ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-90"}`}
              />
            </div>
          </button>

          {/* 5. Next */}
          <button
            onClick={onNext}
            className="text-white hover:text-white/70 transition-colors active:scale-90 duration-200 focus:outline-none"
            aria-label="Next"
          >
            <NextIcon className="w-9 h-9" />
          </button>

          {/* 6. Like */}
          <button
            onClick={toggleLike}
            className={`p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none ${
              isLiked ? "text-rose-500" : "text-white/60 hover:text-white"
            }`}
            title="Like"
          >
            <LikeIcon filled={isLiked} className="w-5 h-5" />
          </button>

          {/* 7. Playlist/Queue */}
          <button
            onClick={onTogglePlaylist}
            className="playlist-toggle-btn p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white focus:outline-none"
            title="Queue"
          >
            <QueueIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Controls;