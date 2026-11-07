import React, { useEffect, useMemo, useRef, useState } from "react";

interface MobileFluidBackgroundProps {
  colors: string[];
  coverUrl?: string;
  isPlaying: boolean;
}

interface FlowingLayer {
  image: HTMLCanvasElement;
  startX: number;
  startY: number;
  startScale: number;
  duration: number;
  startTime: number;
}

const defaultColors = ["#8b5cf6", "#ec4899", "#f97316", "#3b82f6"];

// Apple Music 的 mesh 扭曲参数
const MESH_FLOATS = [
  -0.2351, -0.0967, 0.2135, -0.1414, 0.9221, -0.0908, 0.9221, -0.0685, 1.3027,
  0.0253, 1.2351, 0.1786, -0.3768, 0.1851, 0.2, 0.2, 0.6615, 0.3146, 0.9543,
  0.0, 0.6969, 0.1911, 1.0, 0.2, 0.0, 0.4, 0.2, 0.4, 0.0776, 0.2318, 0.6, 0.4,
  0.6615, 0.3851, 1.0, 0.4, 0.0, 0.6, 0.1291, 0.6, 0.4, 0.6, 0.4, 0.4304,
  0.4264, 0.5792, 1.2029, 0.8188, -0.1192, 1.0, 0.6, 0.8, 0.4264, 0.8104, 0.6,
  0.8, 0.8, 0.8, 1.0, 0.8, 0.0, 1.0, 0.0776, 1.0283, 0.4, 1.0, 0.6, 1.0, 0.8,
  1.0, 1.1868, 1.0283,
];

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// 缩放 Canvas
const scaleCanvas = (
  source: HTMLCanvasElement,
  newWidth: number,
  newHeight: number,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, newWidth, newHeight);
  return canvas;
};

// 模糊 Canvas
const blurCanvas = (
  source: HTMLCanvasElement,
  radius: number,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(source, 0, 0);
  return canvas;
};

// 实现 Bitmap Mesh 扭曲效果
const applyMeshDistortion = (
  source: HTMLCanvasElement,
  meshVerts: number[],
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  const gridWidth = 5;
  const gridHeight = 5;

  const verts: number[] = [];
  for (let i = 0; i < meshVerts.length; i += 2) {
    verts.push(meshVerts[i] * source.width);
    verts.push(meshVerts[i + 1] * source.height);
  }

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const topLeft = row * 6 + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * 6 + col;
      const bottomRight = bottomLeft + 1;

      const srcX = (col / gridWidth) * source.width;
      const srcY = (row / gridHeight) * source.height;
      const srcW = source.width / gridWidth;
      const srcH = source.height / gridHeight;

      const x1 = verts[topLeft * 2];
      const y1 = verts[topLeft * 2 + 1];
      const x2 = verts[topRight * 2];
      const y2 = verts[topRight * 2 + 1];
      const x3 = verts[bottomRight * 2];
      const y3 = verts[bottomRight * 2 + 1];
      const x4 = verts[bottomLeft * 2];
      const y4 = verts[bottomLeft * 2 + 1];

      // 上三角形
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.clip();

      const dx1 = x2 - x1;
      const dy1 = y2 - y1;
      const dx2 = x4 - x1;
      const dy2 = y4 - y1;

      if (Math.abs(dx1 * dy2 - dx2 * dy1) > 1) {
        ctx.transform(dx1 / srcW, dy1 / srcW, dx2 / srcH, dy2 / srcH, x1, y1);
        ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      }
      ctx.restore();

      // 下三角形
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.clip();

      const dx3 = x3 - x2;
      const dy3 = y3 - y2;
      const dx4 = x4 - x2;
      const dy4 = y4 - y2;

      if (Math.abs(dx3 * dy4 - dx4 * dy3) > 1) {
        ctx.transform(dx3 / srcW, dy3 / srcW, dx4 / srcH, dy4 / srcH, x2, y2);
        ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      }
      ctx.restore();
    }
  }

  return canvas;
};

// 调整饱和度
const adjustSaturation = (
  source: HTMLCanvasElement,
  saturation: number,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.filter = `saturate(${saturation})`;
  ctx.drawImage(source, 0, 0);
  return canvas;
};

// 计算亮度
const getBrightness = (canvas: HTMLCanvasElement): number => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0.5;

  const centerX = Math.floor(canvas.width / 2);
  const centerY = Math.floor(canvas.height / 2);
  const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;

  const r = pixel[0] / 255;
  const g = pixel[1] / 255;
  const b = pixel[2] / 255;

  return 0.299 * r + 0.587 * g + 0.114 * b;
};

// 添加亮度遮罩
const applyBrightnessMask = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const brightness = getBrightness(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (brightness > 0.8) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.31)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (brightness < 0.2) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.31)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
};

// 完整的流光溢彩处理流程
const processBitmap = (source: HTMLCanvasElement): HTMLCanvasElement => {
  // 1. 缩小到 150px
  const smallWidth = 150;
  const smallHeight = Math.floor((source.height / source.width) * smallWidth);
  let canvas = scaleCanvas(source, smallWidth, smallHeight);

  // 2. 第一次高斯模糊 (25px)
  canvas = blurCanvas(canvas, 25);

  // 3. 第一次 mesh 处理
  canvas = applyMeshDistortion(canvas, MESH_FLOATS);

  // 4. 放大到 1000px
  const largeWidth = 1000;
  const largeHeight = Math.floor((canvas.height / canvas.width) * largeWidth);
  canvas = scaleCanvas(canvas, largeWidth, largeHeight);

  // 5. 第二次 mesh 处理
  canvas = applyMeshDistortion(canvas, MESH_FLOATS);

  // 6. 第二次高斯模糊 (12px)
  canvas = blurCanvas(canvas, 12);

  // 7. 饱和度增强 (1.8)
  canvas = adjustSaturation(canvas, 1.8);

  // 8. 亮度调整
  canvas = applyBrightnessMask(canvas);

  return canvas;
};

// 创建基础纹理
const createBaseTexture = async (
  colors: string[],
  coverUrl: string | undefined,
): Promise<HTMLCanvasElement> => {
  const size = 600;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 1. 创建渐变背景
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  colors.forEach((color, idx) => {
    gradient.addColorStop(idx / Math.max(1, colors.length - 1), color);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // 2. 叠加封面（如果有）
  if (coverUrl) {
    try {
      const img = await loadImage(coverUrl);
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, x, y, w, h);
      ctx.globalAlpha = 1.0;
    } catch (e) {
      console.warn("Failed to load cover", e);
    }
  }

  // 3. 添加彩色光斑
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const radius = size * (0.3 + Math.random() * 0.4);
    const color = colors[Math.floor(Math.random() * colors.length)];

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.globalAlpha = 0.3 + Math.random() * 0.3;
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  return canvas;
};

// 创建多个流光图层
const createFlowingLayers = async (
  colors: string[],
  coverUrl: string | undefined,
  count: number = 4,
): Promise<FlowingLayer[]> => {
  const layers: FlowingLayer[] = [];

  for (let i = 0; i < count; i++) {
    // 为每个图层创建不同的基础纹理
    const baseCanvas = await createBaseTexture(colors, coverUrl);
    const processed = processBitmap(baseCanvas);

    layers.push({
      image: processed,
      startX: (Math.random() - 0.5) * 0.2, // -10% to 10%
      startY: (Math.random() - 0.5) * 0.2,
      startScale: 1.15 + Math.random() * 0.1,
      duration: 20000 + Math.random() * 15000, // ms
      startTime: -i * 5000, // 错开开始时间
    });
  }

  return layers;
};

const MobileFluidBackground: React.FC<MobileFluidBackgroundProps> = ({
  colors,
  coverUrl,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<FlowingLayer[]>([]);
  const prevLayersRef = useRef<FlowingLayer[]>([]);
  const transitionStartRef = useRef<number>(0);
  const animationIdRef = useRef<number | null>(null);
  const [layersReady, setLayersReady] = useState(false);

  const colorsKey = JSON.stringify(colors);
  
  const normalizedColors = useMemo(
    () => (colors && colors.length > 0 ? colors : defaultColors),
    [colorsKey]
  );

  const colorKey = useMemo(
    () => normalizedColors.join("|"),
    [normalizedColors],
  );

  // 生成图层
  useEffect(() => {
    let cancelled = false;
    setLayersReady(false);
    const generate = async () => {
      const newLayers = await createFlowingLayers(
        normalizedColors,
        coverUrl,
        4,
      );
      if (cancelled) return;
      if (layersRef.current.length > 0) {
        prevLayersRef.current = layersRef.current;
        transitionStartRef.current = performance.now();
      }
      layersRef.current = newLayers;
      setLayersReady(true);
    };
    generate();
    return () => {
      cancelled = true;
    };
  }, [colorKey, coverUrl]);

  // Ken Burns 动画效果
  const calculateTransform = (layer: FlowingLayer, elapsed: number) => {
    const progress =
      ((elapsed + layer.startTime) % layer.duration) / layer.duration;

    // 使用缓动函数
    const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    const eased = easeInOutSine(progress);

    // 计算位移
    const x = layer.startX + Math.sin(progress * Math.PI * 2) * 0.15;
    const y = layer.startY + Math.cos(progress * Math.PI * 2) * 0.12;

    // 计算缩放
    const scale = layer.startScale + Math.sin(progress * Math.PI * 2) * 0.08;

    // 计算旋转
    const rotation = Math.sin(progress * Math.PI * 2) * 0.08; // ±5度

    return { x, y, scale, rotation };
  };

  // 渲染循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let startTimeOffset = 0;
    let lastPausedTime = 0;

    const render = (currentTime: number) => {
      const width = canvas.width;
      const height = canvas.height;

      // 计算实际经过的时间（考虑暂停）
      let elapsed = currentTime;
      if (!isPlaying) {
        lastPausedTime = currentTime;
        elapsed = startTimeOffset;
      } else {
        if (lastPausedTime > 0) {
          startTimeOffset = elapsed;
          lastPausedTime = 0;
        }
      }

      // 清空画布
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      const drawLayerSet = (layers: FlowingLayer[], globalSetAlpha: number) => {
        layers.forEach((layer, index) => {
          const transform = calculateTransform(layer, elapsed);
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.rotate(transform.rotation);
          ctx.scale(transform.scale, transform.scale);
          ctx.translate(width * transform.x, height * transform.y);
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = (0.5 + index * 0.05) * globalSetAlpha; 
          ctx.filter = "blur(35px)";
          const drawWidth = width * 1.5;
          const drawHeight = height * 1.5;
          ctx.drawImage(
            layer.image,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight
          );
          ctx.restore();
        });
      };

      const TRANSITION_DURATION = 1500;
      let progress = 1;
      if (transitionStartRef.current > 0) {
        progress = Math.min(1, (performance.now() - transitionStartRef.current) / TRANSITION_DURATION);
      }

      if (progress < 1 && prevLayersRef.current.length > 0) {
        drawLayerSet(prevLayersRef.current, 1 - progress);
      }

      if (layersRef.current.length > 0) {
        drawLayerSet(layersRef.current, progress);
      } else if (progress === 1) {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#666";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading layers...", width / 2, height / 2);
      }

      // 绘制渐变遮罩
      // const gradient = ctx.createLinearGradient(0, 0, 0, height);
      // gradient.addColorStop(0, "rgba(0, 0, 0, 0.45)");
      // gradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      // gradient.addColorStop(1, "rgba(0, 0, 0, 0.7)");
      // ctx.globalCompositeOperation = "source-over";
      // ctx.globalAlpha = 1.0;
      // ctx.fillStyle = gradient;
      // ctx.fillRect(0, 0, width, height);

      animationIdRef.current = requestAnimationFrame(render);
    };

    animationIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isPlaying, layersReady]);

  // 处理窗口大小变化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ background: "#000" }}
    />
  );
};

export default MobileFluidBackground;
