import React from 'react';
import { 
  Settings2, Sparkles, Moon, Star, Disc, 
  Flame, Music, Droplets, Coffee, Zap, 
  MonitorPlay, Sun, BookOpen, Mic2, 
  Headphones, CloudRain, Clock, Compass 
} from 'lucide-react';

const HIDDEN_SCROLLBAR_STYLE = `
  .hide-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
    width: 0px;
    background: transparent;
  }
`;

interface ListeningModeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dragOffset: number;
  isDragging: boolean;
  onMixModeSelect?: (mode: string) => void;
  onMoodSelect?: (mood: string) => void;
  isLoading?: boolean;
  activeMixMode?: string;
  activeMood?: string | null;
  favoritesCount?: number;
}

const EMOTION_MODES = [
  { icon: <Sparkles size={22} strokeWidth={1.5} />, name: '快乐时光' },
  { icon: <Coffee size={22} strokeWidth={1.5} />, name: 'Chill 放松' },
  { icon: <Moon size={22} strokeWidth={1.5} />, name: '深夜 emo' },
];

const SCENE_MODES = [
  { icon: <Star size={22} strokeWidth={1.5} />, name: '助眠' },
  { icon: <BookOpen size={22} strokeWidth={1.5} />, name: '图书馆' },
  { icon: <Droplets size={22} strokeWidth={1.5} />, name: '洗澡' },
  { icon: <Headphones size={22} strokeWidth={1.5} />, name: '通勤必听' },
  { icon: <Flame size={22} strokeWidth={1.5} />, name: '动感健身' },
];

export function ListeningModeDrawer({
  isOpen,
  onClose,
  dragOffset,
  isDragging,
  onMixModeSelect,
  onMoodSelect,
  isLoading,
  activeMixMode = '默认模式',
  activeMood = null,
  favoritesCount = 0
}: ListeningModeDrawerProps) {
  const drawerWidth = typeof window !== 'undefined' 
    ? (window.innerWidth < 768 ? window.innerWidth * 0.85 : window.innerWidth * 0.3) 
    : 300;
  
  let translateX = -drawerWidth;
  if (isOpen && !isDragging) {
    translateX = 0;
  } else if (isDragging) {
    if (isOpen) {
      translateX = Math.max(-drawerWidth, Math.min(0, dragOffset));
    } else {
      translateX = Math.max(-drawerWidth, Math.min(0, dragOffset - drawerWidth));
    }
  }

  const progress = Math.max(0, Math.min(1, 1 - Math.abs(translateX) / drawerWidth));
  const overlayOpacity = progress;

  return (
    <>
      {progress > 0 && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md z-40 transition-opacity"
          style={{ 
            opacity: overlayOpacity,
            transitionDuration: isDragging ? '0ms' : '300ms',
            pointerEvents: isOpen ? 'auto' : 'none'
          }}
          onClick={onClose}
        />
      )}

      <div 
        className="absolute top-0 left-0 bottom-0 bg-black/30 backdrop-blur-[120px] saturate-150 border-r border-white/10 z-50 flex flex-col shadow-[20px_0_80px_rgba(0,0,0,0.6),_inset_0_0_50px_rgba(255,255,255,0.05)] text-white overflow-hidden select-none outline-none [-webkit-tap-highlight-color:transparent]"
        style={{ 
          width: drawerWidth,
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Analog Noise Texture Layer */}
        <div 
            className="absolute inset-0 z-[-1] opacity-[0.04] mix-blend-overlay pointer-events-none"
            style={{ backgroundImage: `url('data:image/svg+xml;utf8,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E')` }}
        />

        {/* Ambient Glow */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-[-1]" />

        <style dangerouslySetInnerHTML={{ __html: HIDDEN_SCROLLBAR_STYLE }} />
        <div className="p-6 pb-4 relative">
          <h2 className="text-2xl font-bold mb-6 tracking-tight">听歌模式</h2>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => {
                  if (favoritesCount === 0) {
                      alert('请先收藏一些歌曲，好让我了解您的偏好');
                      return;
                  }
                  onMixModeSelect?.('默认模式');
              }}
              disabled={favoritesCount === 0}
              className={`w-full py-3.5 rounded-[20px] font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 border border-transparent ${
                favoritesCount === 0 
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/50' 
                  : activeMixMode === '默认模式' 
                    ? 'bg-white text-black bg-opacity-100 active:scale-[0.98]' 
                    : 'bg-white/5 text-white/90 hover:bg-white/10 active:scale-[0.98]'
              }`}
            >
              <Settings2 size={18} strokeWidth={2} />
              默认模式
            </button>
            <button 
              onClick={() => {
                  if (favoritesCount === 0) {
                      alert('请先收藏一些歌曲，好让我了解您的偏好');
                      return;
                  }
                  onMixModeSelect?.('熟悉模式');
              }}
              disabled={favoritesCount === 0}
              className={`w-full py-3.5 rounded-[20px] font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 border border-transparent ${
                favoritesCount === 0 
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/50' 
                  : activeMixMode === '熟悉模式' 
                    ? 'bg-white text-black bg-opacity-100 active:scale-[0.98]' 
                    : 'bg-white/5 text-white/90 hover:bg-white/10 active:scale-[0.98]'
              }`}
            >
              <Clock size={18} strokeWidth={2} />
              熟悉模式
            </button>
            <button 
              onClick={() => {
                  if (favoritesCount === 0) {
                      alert('请先收藏一些歌曲，好让我了解您的偏好');
                      return;
                  }
                  onMixModeSelect?.('新鲜模式');
              }}
              disabled={favoritesCount === 0}
              className={`w-full py-3.5 rounded-[20px] font-semibold text-[15px] flex items-center justify-center gap-2 transition-all duration-300 border border-transparent ${
                favoritesCount === 0 
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/50' 
                  : activeMixMode === '新鲜模式' 
                    ? 'bg-white text-black bg-opacity-100 active:scale-[0.98]' 
                    : 'bg-white/5 text-white/90 hover:bg-white/10 active:scale-[0.98]'
              }`}
            >
              <Compass size={18} strokeWidth={2} />
              新鲜模式
            </button>
          </div>
          {favoritesCount === 0 && (
              <div className="mt-3 text-center text-[12px] text-white/40">
                  收藏歌曲后即可调整熟悉度
              </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 sm:px-4 pb-8 hide-scrollbar relative">
          <div className="mt-4 mb-2 px-2 text-white/50 text-[11px] font-bold tracking-wider uppercase">按情绪选歌</div>
          <div className="grid grid-cols-3 gap-y-3 gap-x-1 mb-6">
            {EMOTION_MODES.map((mode, idx) => (
              <button 
                key={`emo-${idx}`} 
                onClick={() => onMoodSelect?.(mode.name)}
                className={`flex flex-col items-center justify-center py-5 rounded-[24px] gap-3 outline-none transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.92] ${
                  activeMood === mode.name 
                    ? 'bg-white/90 text-black shadow-[0_10px_30px_rgba(255,255,255,0.2)]'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className={`${activeMood === mode.name ? 'text-black' : 'text-white/80'} transition-colors duration-300`}>
                  {mode.icon}
                </div>
                <span className={`text-[12px] font-semibold tracking-wide transition-colors duration-300 ${
                  activeMood === mode.name ? 'text-black' : 'text-white/50'
                }`}>
                  {mode.name}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 mb-2 px-2 text-white/50 text-[11px] font-bold tracking-wider uppercase">按场景选歌</div>
          <div className="grid grid-cols-3 gap-y-3 gap-x-1 pb-8">
            {SCENE_MODES.map((mode, idx) => (
              <button 
                key={`scene-${idx}`} 
                onClick={() => onMoodSelect?.(mode.name)}
                className={`flex flex-col items-center justify-center py-5 rounded-[24px] gap-3 outline-none transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.92] ${
                  activeMood === mode.name 
                    ? 'bg-white/90 text-black shadow-[0_10px_30px_rgba(255,255,255,0.2)]'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className={`${activeMood === mode.name ? 'text-black' : 'text-white/80'} transition-colors duration-300`}>
                  {mode.icon}
                </div>
                <span className={`text-[12px] font-semibold tracking-wide transition-colors duration-300 ${
                  activeMood === mode.name ? 'text-black' : 'text-white/50'
                }`}>
                  {mode.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
