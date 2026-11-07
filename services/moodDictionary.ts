import { getApiUrl, matchTrackFromList } from './utils';
import { searchNetEase } from './lyricsService';

const DICT_KEY = 'aura_mood_dictionary';

export interface MoodDict {
    [songId: string]: string[]; // Array of tags
}

export function getMoodDictionary(): MoodDict {
    try {
        const stored = localStorage.getItem(DICT_KEY);
        if (stored) return JSON.parse(stored);
    } catch {}
    return {};
}

export function saveMoodDictionary(dict: MoodDict) {
    localStorage.setItem(DICT_KEY, JSON.stringify(dict));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mood-dictionary-updated'));
    }
}

let isFetching = false;
let queue: string[] = [];

// Fetches tags for a Netease song by checking playlists that contain it
export async function fetchTagsForSong(neteaseId: string | number): Promise<string[]> {
    try {
        const url = getApiUrl(`/api/netease/simi/playlist?id=${neteaseId}`);
        const res = await fetch(url);
        
        if (!res.ok) {
            return [];
        }
        
        const data = await res.json();
        
        let tags = new Set<string>();
        if (data.playlists && Array.isArray(data.playlists)) {
            for (const pl of data.playlists) {
                if (pl.tags && Array.isArray(pl.tags)) {
                    pl.tags.forEach((t: string) => tags.add(t));
                }
            }
        }
        return Array.from(tags);
    } catch(e) {
        // Silently ignore fetch errors in background tasks to avoid console spam
        return [];
    }
}

// Background warming strategy
export async function resolveSongEmotionWithGemini(song: any): Promise<string | null> {
    try {
        if (!song || (!song.lyrics && !song.id)) return null;

        // Ensure we have lyrics. If not, maybe we can't reliably resolve? 
        // We'll require lyrics to be passed in, or we just send title/artist if lyrics missing.
        let lyricsStr = '';
        if (Array.isArray(song.lyrics)) {
            lyricsStr = song.lyrics.map((l: any) => l.text).join('\n');
        }

        const formData = new FormData();
        formData.append('lyrics', lyricsStr);
        formData.append('title', song.title || '');
        formData.append('artist', song.artist || '');

        const response = await fetch(getApiUrl('/api/gemini/emotion'), {
            method: 'POST',
            body: formData
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.category || null; // Return the exact string category e.g., '快乐时光'
    } catch(e) {
        console.error("Failed to resolve emotion with API", e);
        return null;
    }
}

// Background warming strategy
export async function startBackgroundMoodWarming(favorites: any[], onProgress?: () => void) {
    if (isFetching) return;
    
    const dict = getMoodDictionary();
    const needsFetch = favorites.filter(song => {
        // Fetch if not present, OR if it's empty (meaning we retry previously failed or empty tags)
        return !dict[song.id] || (Array.isArray(dict[song.id]) && dict[song.id].length === 0);
    });
    
    if (needsFetch.length === 0) return;
    
    isFetching = true;
    try {
        for (const song of needsFetch) {
            // Delay to avoid hitting rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            let fetchId = song.platformId || song.neteaseId;
            const isNetease = (song.isNetease || song.platform === 'netease' || song.neteaseId) && fetchId;

            if (!isNetease) {
                // If not netease, search netease to find a matching ID
                const cleanTitle = song.title.replace(/【.*?】/g, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').split('-').pop()?.trim() || song.title;
                const artistToUse = song.artist === "Bilibili" ? "" : (song.artist || "");
                
                try {
                    const candidates = await searchNetEase(`${cleanTitle} ${artistToUse}`.trim(), { limit: 10 });
                    if (candidates && candidates.length > 0) {
                        const targetDuration = song.duration ? song.duration / 1000 : 0;
                        const match = matchTrackFromList(candidates, cleanTitle, artistToUse, targetDuration);
                        if (match) {
                            fetchId = match.neteaseId || match.id;
                        }
                    }
                } catch(e) {
                    // Ignore search errors
                }
            }

            if (!fetchId) {
                // Save empty tags to avoid re-fetching failed matches
                const currentDict = getMoodDictionary();
                currentDict[song.id] = [];
                saveMoodDictionary(currentDict);
                if (onProgress) onProgress();
                continue;
            }

            const tags = await fetchTagsForSong(fetchId!);
            
            // Save even if empty, to avoid re-fetching
            const currentDict = getMoodDictionary();
            currentDict[song.id] = tags;
            saveMoodDictionary(currentDict);
            
            if (onProgress) onProgress();
        }
    } finally {
        isFetching = false;
    }
}
