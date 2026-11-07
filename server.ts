import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import ncmApi from "NeteaseCloudMusicApi";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const upload = multer({ dest: 'uploads/' });

const serveNcmApi = (ncmApi as any).serveNcmApi || ((ncmApi as any).server ? (ncmApi as any).server.serveNcmApi : null);

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Find a free port before setting NCM_PORT
  const net = await import("net");
  const getFreePort = () => new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as any).port;
      srv.close(() => resolve(port));
    });
  });
  
  const NCM_PORT = await getFreePort();

  // Add JSON body parsing
  app.use(express.json());

  // Start Netease API internally
  let ncmInstance: any = null;
  serveNcmApi({
      port: NCM_PORT,
      checkVersion: false
  }).then((ext: any) => {
      ncmInstance = ext;
  }).catch((e: any) => console.error("Failed to start NCM API", e));

  // Handle graceful dev server restarts
  const cleanup = () => {
      if (ncmInstance && ncmInstance.server) {
          ncmInstance.server.close();
      }
      process.exit(0);
  };
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGUSR2', cleanup);

  // Add redirect endpoint for audio URLs
  app.get('/api/audio/netease/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const url = `http://127.0.0.1:${NCM_PORT}/song/url/v1?id=${id}&level=exhigh&realIP=114.114.114.114&timestamp=${Date.now()}`;
      const response = await fetch(url);
      const data = await response.json();
      
      let audioUrl = data?.data?.[0]?.url;
      if (audioUrl) {
          try {
              const parsedUrl = new URL(audioUrl);
              // Force replace the hostname to NetEase's domestic CDN to avoid overseas detour
              parsedUrl.hostname = 'm701.music.126.net';
              parsedUrl.protocol = 'https:';
              audioUrl = parsedUrl.toString();
          } catch (e) {
              audioUrl = audioUrl.replace('http://', 'https://');
          }
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.redirect(audioUrl);
      } else {
          res.status(404).send('Audio not found');
      }
    } catch (e) {
      console.error('Audio Redirect Error:', e);
      res.status(500).send('Internal error');
    }
  });

  // Proxy Netease API requests to our internal NCM server
  app.use('/api/netease', async (req, res) => {
    try {
      const endpoint = req.path.replace(/^\//, ''); // remove leading slash
      
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (value) {
            queryParams.append(key, value.toString());
        }
      }
      // Inject realIP to bypass region lock
      queryParams.append('realIP', '114.114.114.114');

      const queryString = queryParams.toString();
      const url = `http://127.0.0.1:${NCM_PORT}/${endpoint}${queryString ? '?' + queryString : ''}`;

      const headers: Record<string, string> = {};
      if (req.headers.cookie) headers.cookie = req.headers.cookie;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
          if (Object.keys(req.body).length > 0) {
              fetchOptions.body = JSON.stringify(req.body);
              headers['Content-Type'] = 'application/json';
          }
      }

      const response = await fetch(url, fetchOptions);
      const responseData = await response.text();
      
      let jsonData;
      try {
          jsonData = JSON.parse(responseData);
      } catch(e) {
          return res.status(502).json({ error: 'Netease API returned invalid data (possibly HTML)' });
      }
      
      res.status(response.status).json(jsonData);
    } catch (e: any) {
      console.error("Express Netease Proxy Error:", e);
      res.status(500).json({ error: e.message || 'Internal proxy error' });
    }
  });

  app.post('/api/gemini/emotion', upload.none(), async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
      }
      
      const { lyrics, title, artist } = req.body;
      if (!lyrics) {
         return res.status(400).json({ error: 'Lyrics are required' });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a music mood classifier. Analyze the following lyrics for the song "${title}" by "${artist}". 
Based on the lyrics' emotional tone, categorize the song into EXACTLY ONE of these three categories:
1. 快乐时光 (This means: Positive, energetic, happy, upbeat)
2. Chill 放松 (This means: Neutral, relaxing, soothing, peaceful, acoustic)
3. 深夜 emo (This means: Negative, sad, lonely, highly emotional, heartbroken)

Reply with ONLY the category name exactly as it appears above (e.g., "深夜 emo"), and nothing else.

Lyrics:
${lyrics.substring(0, 3000)}`; // Trim to avoid exceeding context too easily, though flash can handle it, 3000 chars is plenty for lyrics

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt
      });
      
      const category = response.text?.trim() || '';
      res.json({ category });
    } catch (e: any) {
      console.error("Gemini Emotion Error:", e);
      res.status(500).json({ error: e.message || 'Gemini emotion classification failed' });
    }
  });

  // --- Gemini Endpoints ---
  app.post('/api/gemini/lyrics', upload.single('audio'), async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
      }
      
      const file = req.file;
      const type = req.body.type || 'transcribe'; // 'transcribe' or 'translate'
      const existingLyrics = req.body.lyrics || '';
      
      let fileToUpload = file?.path;
      let mimeType = file?.mimetype;

      if (!fileToUpload && req.body.audioUrl) {
          try {
              const targetUrl = req.body.audioUrl.startsWith('/') ? `http://127.0.0.1:3000${req.body.audioUrl}` : req.body.audioUrl;
              const downloadRes = await fetch(targetUrl);
              if (downloadRes.ok) {
                  const arrayBuffer = await downloadRes.arrayBuffer();
                  const uniqueName = 'uploads/temp_audio_' + Date.now() + '.mp3';
                  fs.writeFileSync(uniqueName, Buffer.from(arrayBuffer));
                  fileToUpload = uniqueName;
                  mimeType = downloadRes.headers.get('content-type') || 'audio/mp3';
              }
          } catch (e) {
              console.error("Failed to download audioUrl locally", e);
          }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let prompt = '';
      
      if (type === 'translate' && existingLyrics) {
        prompt = `You are a professional music translator. I will provide you with LRC lyrics. Please return ONLY the LRC file but carefully append Chinese translation to each line separated by a slash (or replace the line if you prefer bilingual presentation, e.g. [00:01.00]Original / 翻译). Maintain the original timestamps perfectly. Do not output anything else but the LRC content.
        
Lyrics:
${existingLyrics}`;
      } else {
        if (!fileToUpload) {
          return res.status(400).json({ error: 'No audio file provided or download failed' });
        }
        prompt = `Listen to this song and transcribe the lyrics. Output ONLY a valid LRC file with timestamps matching the vocals. Do not output markdown code blocks, just the raw LRC text. If possible, provide original language and chinese translation on the same line. If the audio has no vocals, output [00:00.00] Instrumental.`;
      }

      let responseText = '';
      let uploadedFile;
      
      if (fileToUpload) {
        // Upload the file to Gemini via File API
        uploadedFile = await ai.files.upload({
          file: fileToUpload,
          config: {
            mimeType: mimeType || 'audio/mp3',
          }
        });
        
        // Wait for processing if needed (though audio can often be processed immediately directly, 
        // sometimes video needs explicit waiting. We'll proceed directly)
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [uploadedFile, prompt]
        });
        
        responseText = response.text;
        
        // Cleanup local multer file
        fs.unlink(fileToUpload, () => {});
        // Optionally cleanup from Gemini API later
        ai.files.delete({ name: uploadedFile.name }).catch(() => {});
      } else if (type === 'translate' && existingLyrics) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });
        responseText = response.text;
      }
      
      // Clean up markdown wrapping if present
      if (responseText.startsWith('\`\`\`')) {
        responseText = responseText.replace(/^\`\`\`lrc\n?/i, '').replace(/^\`\`\`\n?/i, '').replace(/\n?\`\`\`$/i, '');
      }

      res.json({ lyrics: responseText });
    } catch (e: any) {
      console.error("Gemini LRC Error:", e);
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: e.message || 'Gemini generation failed' });
    }
  });

  // Add React/SPA redirect fallback to be last, so put bilibili APIs before `if (process.env.NODE_ENV !== "production")`

  // --- Bilibili Endpoints ---
  app.get('/api/bilibili/search', async (req, res) => {
    try {
      const keyword = String(req.query.keyword || '');
      const page = Number(req.query.page || 1);
      
      const { default: BilibiliApi } = await import('qxr-bilibili-api');
      const bApi = new BilibiliApi();
      const bRes = await bApi.searchByType(keyword, page);
      
      const tracks = [];
      if (bRes && bRes.result) {
        for (const item of bRes.result) {
           tracks.push({
               platform: 'bilibili',
               platformId: item.bvid,
               title: item.title.replace(/<[^>]+>/g, ''), // remove emphasis tags
               artist: item.author || "Bilibili",
               album: "Bilibili Video",
               coverUrl: `/api/bilibili/proxy?url=${encodeURIComponent(item.pic?.startsWith('//') ? `https:${item.pic}` : item.pic)}`,
               // duration might be MM:SS
               duration: typeof item.duration === 'string' && item.duration.includes(':')
                  ? item.duration.split(':').reduce((acc: number, time: string) => (60 * acc) + parseInt(time, 10), 0) * 1000
                  : item.duration,
           });
        }
      }
      res.json(tracks);
    } catch (e: any) {
      console.error("Bilibili Search API returned an error:", e.message || e);
      // Return empty array on failure instead of 500 error to gracefully degrade
      res.json([]);
    }
  });

  app.get('/api/bilibili/play/:bvid', async (req, res) => {
    try {
      const bvid = req.params.bvid;
      const { default: BilibiliApi } = await import('qxr-bilibili-api');
      const bApi = new BilibiliApi();
      const urlInfo = await bApi.getVideoUrl(bvid);
      
      if (urlInfo && urlInfo.dash && urlInfo.dash.audio && urlInfo.dash.audio.length > 0) {
          // get the highest quality audio link
          const audioUrl = urlInfo.dash.audio[0].baseUrl;
          res.json({ url: audioUrl });
      } else if (urlInfo && urlInfo.durl && urlInfo.durl.length > 0) { // Fallback for simple FLV/MP4 instead of DASH
          const audioUrl = urlInfo.durl[0].url;
          res.json({ url: audioUrl });
      } else {
          res.status(404).json({ error: 'No audio stream found' });
      }
    } catch (e: any) {
      console.error("Bilibili Audio Query Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Dynamically fetch and proxy the audio stream for Bilibili to prevent URL expiration
  app.get('/api/bilibili/stream/:bvid', async (req, res) => {
      try {
          const bvid = req.params.bvid;
          const { default: BilibiliApi } = await import('qxr-bilibili-api');
          const bApi = new BilibiliApi();
          const urlInfo = await bApi.getVideoUrl(bvid);
          
          let streamUrl = '';
          if (urlInfo && urlInfo.dash && urlInfo.dash.audio && urlInfo.dash.audio.length > 0) {
              streamUrl = urlInfo.dash.audio[0].baseUrl;
          } else if (urlInfo && urlInfo.durl && urlInfo.durl.length > 0) {
              streamUrl = urlInfo.durl[0].url;
          }

          if (!streamUrl) {
              return res.status(404).send('No audio stream found');
          }
          
          const controller = new AbortController();
          req.on('close', () => {
              controller.abort();
          });

          const headers: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.bilibili.com'
          };
          if (req.headers.range) {
              headers['Range'] = req.headers.range;
          }
          
          const response = await fetch(streamUrl, {
              headers,
              signal: controller.signal
          });
          
          if (!response.ok) {
               return res.status(response.status).send(`Failed to fetch stream`);
          }
           
           if (response.headers.has('content-type')) {
               res.setHeader('Content-Type', response.headers.get('content-type')!);
           }
           if (response.headers.has('content-length')) {
               res.setHeader('Content-Length', response.headers.get('content-length')!);
           }
           if (response.headers.has('content-range')) {
               res.setHeader('Content-Range', response.headers.get('content-range')!);
           }
           if (response.headers.has('accept-ranges')) {
               res.setHeader('Accept-Ranges', response.headers.get('accept-ranges')!);
           } else {
               res.setHeader('Accept-Ranges', 'bytes');
           }
           
           res.setHeader('Access-Control-Allow-Origin', '*');
           // Keep the stream bytes cacheable by the browser so scrubbing works efficiently.
           // Since our Bilibili proxy resolves the fresh CDN URL on the server side dynamically every time,
           // the browser hitting it for a Range request will always succeed.
           res.setHeader('Cache-Control', 'public, max-age=31536000');

           if (response.status === 206) {
               res.status(206);
           }

           if (response.body) {
               const { Readable } = await import('stream');
               const readable = Readable.fromWeb(response.body as any);
               readable.pipe(res);
               readable.on('error', (err: any) => {
                   if (err.name !== 'AbortError' && err.message !== 'terminated' && !err.message?.includes('terminated')) {
                       console.error('Bilibili streaming proxy error:', err);
                   }
               });
           } else {
               res.end();
           }
       } catch (e: any) {
           if (e.name === 'AbortError' || e.message === 'terminated' || e.message?.includes('terminated')) {
               return; // Ignore client disconnect
           }
           console.error("Bilibili proxy streaming error:", e);
           if (!res.headersSent) {
               res.status(500).send('Proxy streaming error');
           }
       }
   });

  // Since Bilibili streaming URLs require `Referer: https://www.bilibili.com`,
  // we proxy the actual audio stream so frontend `<audio>` can play it.
  app.get('/api/bilibili/proxy', async (req, res) => {
      try {
          const streamUrl = String(req.query.url || '');
          if (!streamUrl) {
              return res.status(400).send('Missing url');
          }
          
          const controller = new AbortController();
          req.on('close', () => {
              controller.abort();
          });

          const headers: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.bilibili.com'
          };
          if (req.headers.range) {
              headers['Range'] = req.headers.range;
          }
          
          const response = await fetch(streamUrl, {
              headers,
              signal: controller.signal
          });
          
          if (!response.ok) {
              return res.status(response.status).send('Failed to fetch stream');
          }

           if (response.headers.has('content-type')) {
               res.setHeader('Content-Type', response.headers.get('content-type')!);
           }
           if (response.headers.has('content-length')) {
               res.setHeader('Content-Length', response.headers.get('content-length')!);
           }
           if (response.headers.has('content-range')) {
               res.setHeader('Content-Range', response.headers.get('content-range')!);
           }
           if (response.headers.has('accept-ranges')) {
               res.setHeader('Accept-Ranges', response.headers.get('accept-ranges')!);
           } else {
               res.setHeader('Accept-Ranges', 'bytes');
           }
           
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.setHeader('Cache-Control', 'public, max-age=31536000');

           if (response.status === 206) {
               res.status(206);
           }

           if (response.body) {
               const { Readable } = await import('stream');
               const readable = Readable.fromWeb(response.body as any);
               readable.pipe(res);
               readable.on('error', (err: any) => {
                   if (err.name !== 'AbortError' && err.message !== 'terminated' && !err.message?.includes('terminated')) {
                       console.error('Bilibili proxy stream error:', err);
                   }
               });
           } else {
               res.end();
           }
       } catch (e: any) {
           if (e.name === 'AbortError' || e.message === 'terminated' || e.message?.includes('terminated')) {
               return; // Ignore client disconnect
           }
           console.error("Proxy streaming error:", e);
           if (!res.headersSent) {
               res.status(500).send('Proxy streaming error');
           }
       }
   });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
