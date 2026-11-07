import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
}

// Global map to store source nodes to prevent "MediaElementAudioSourceNode" double-connection errors
const sourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
const contextMap = new WeakMap<HTMLAudioElement, AudioContext>();

const Visualizer: React.FC<VisualizerProps> = ({ audioRef, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    // Initialize Audio Context
    const initAudio = () => {
        let ctx = contextMap.get(audioEl);
        if (!ctx) {
            ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            contextMap.set(audioEl, ctx);
        }

        if (ctx.state === 'suspended') {
            ctx.resume().catch(e => console.warn("AudioContext resume failed:", e));
        }

        if (!analyserRef.current) {
            analyserRef.current = ctx.createAnalyser();
            // FFT Size determines the number of bars. 128 = 64 bars.
            analyserRef.current.fftSize = 128; 
            analyserRef.current.smoothingTimeConstant = 0.8;
        }

        if (!sourceMap.has(audioEl)) {
            try {
                const source = ctx.createMediaElementSource(audioEl);
                source.connect(analyserRef.current);
                analyserRef.current.connect(ctx.destination);
                sourceMap.set(audioEl, source);
            } catch (e) {
                console.error("Audio source connection failed", e);
            }
        }
    };

    // Browsers require AudioContext to be resumed on a user gesture or media event.
    // The 'playing' event is a reliable place.
    const handlePlaying = () => {
        initAudio();
    };
    audioEl.addEventListener('playing', handlePlaying);

    if (isPlaying) {
        initAudio(); // Try immediately as well
        draw();
    } else {
        cancelAnimationFrame(rafRef.current);
        // Clear canvas clearly when paused
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }

    return () => {
        cancelAnimationFrame(rafRef.current);
        audioEl.removeEventListener('playing', handlePlaying);
    };
  }, [isPlaying, audioRef]);

  const draw = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Visualizer Settings
    const barCount = 40; // Limit bars drawn for aesthetic spacing
    const gap = 4;
    const totalGap = gap * (barCount - 1);
    const barWidth = (canvas.width - totalGap) / barCount;

    // Draw
    for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor(i * (bufferLength / barCount));
        const value = dataArray[dataIndex];
        
        const percent = value / 255;
        const height = Math.max(4, percent * canvas.height); // Min height 4px
        
        const x = i * (barWidth + gap);
        const y = (canvas.height - height) / 2; // Center vertically

        // Style
        ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + percent * 0.6})`;
        
        ctx.beginPath();
        if (ctx.roundRect) {
             ctx.roundRect(x, y, barWidth, height, 4);
        } else {
             ctx.rect(x, y, barWidth, height);
        }
        ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  };

  return (
    <canvas 
        ref={canvasRef} 
        width={320} 
        height={32} 
        className={`w-full max-w-[320px] h-8 transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
    />
  );
};

export default Visualizer;