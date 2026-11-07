import { NeteaseTrackInfo, searchNetEase, getNeteaseAudioUrl, fetchLyricsById } from "./lyricsService";
import { getApiUrl } from "./utils";

export type PlatformType = 'netease' | 'bilibili' | 'qishui';

export interface AbstractTrackInfo {
    platform: PlatformType;
    platformId: string;
    title: string;
    artist: string;
    album: string;
    coverUrl?: string;
    duration?: number;
    fee?: number; // 1 or 4 indicates a VIP song
}

export interface MusicProvider {
    id: PlatformType;
    name: string;
    search: (keyword: string, options?: { limit?: number; offset?: number }) => Promise<AbstractTrackInfo[]>;
    getAudioUrl: (platformId: string) => Promise<string | null>;
    getLyrics: (platformId: string) => Promise<{ lrc: string; tLrc?: string; metadata: string[] } | null>;
}

// ============================================
// 1. Netease Provider Implementation
// ============================================
class NeteaseProvider implements MusicProvider {
    id: PlatformType = 'netease';
    name = "网易云音乐";

    async search(keyword: string, options?: { limit?: number; offset?: number }): Promise<AbstractTrackInfo[]> {
        const results = await searchNetEase(keyword, options);
        return results.map(t => ({
            platform: 'netease',
            platformId: t.neteaseId,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverUrl: t.coverUrl,
            duration: t.duration,
            fee: t.fee
        }));
    }

    async getAudioUrl(platformId: string): Promise<string | null> {
        return getNeteaseAudioUrl(platformId);
    }

    async getLyrics(platformId: string) {
        return fetchLyricsById(platformId);
    }
}

// ============================================
// 2. Bilibili Provider Implementation
// ============================================
class BilibiliProvider implements MusicProvider {
    id: PlatformType = 'bilibili';
    name = "Bilibili";

    async search(keyword: string, options?: { limit?: number; offset?: number }): Promise<AbstractTrackInfo[]> {
        console.log(`[BilibiliProvider] Searching for: ${keyword}`);
        try {
            // Note: Our Bilibili proxy uses 'page' parameter, 1-indexed. We calculate from offset/limit if needed.
            const page = 1 + Math.floor((options?.offset || 0) / (options?.limit || 20));
            const response = await fetch(getApiUrl(`/api/bilibili/search?keyword=${encodeURIComponent(keyword)}&page=${page}`));
            if (!response.ok) throw new Error("Search failed");
            const data = await response.json();
            // Process coverUrls for client base path
            return data.map((t: any) => ({
                ...t,
                coverUrl: t.coverUrl ? getApiUrl(t.coverUrl) : undefined
            }));
        } catch (e) {
            console.error("Bilibili Search Error:", e);
            return [];
        }
    }

    async getAudioUrl(platformId: string): Promise<string | null> {
        try {
            return getApiUrl(`/api/bilibili/stream/${platformId}`);
        } catch (e) {
            console.error("Bilibili Audio Error:", e);
            return null;
        }
    }

    async getLyrics(platformId: string) {
        // Bilibili videos rarely have structured LRC that we can fetch easily through this API at the moment.
        // We mock it or return null so that the player handles it gracefully.
        return null; // Let the player just play the song and maybe it doesn't need lyrics
    }
}

// ============================================
// 3. Pool Manager
// ============================================
class SourceManager {
    private providers: Map<PlatformType, MusicProvider> = new Map();
    private defaultPriority: PlatformType[] = ['bilibili', 'netease'];

    constructor() {
        this.register(new NeteaseProvider());
        this.register(new BilibiliProvider());
    }

    register(provider: MusicProvider) {
        this.providers.set(provider.id, provider);
    }

    getProvider(platform: PlatformType): MusicProvider | undefined {
        return this.providers.get(platform);
    }

    getPriorityList(): PlatformType[] {
        return this.defaultPriority;
    }

    setPriorityList(list: PlatformType[]) {
        this.defaultPriority = list;
    }

    /**
     * Search across all providers in parallel and interleave the results.
     */
    async searchPool(keyword: string, options?: { limit?: number; offset?: number }): Promise<AbstractTrackInfo[]> {
        const promises = this.defaultPriority.map(async (platform) => {
            const provider = this.providers.get(platform);
            if (provider) {
                try {
                    const results = await provider.search(keyword, options);
                    return results || [];
                } catch (e) {
                    console.error(`[SourceManager] Provider ${platform} failed:`, e);
                    return [];
                }
            }
            return [];
        });

        const resultsArrays = await Promise.all(promises);
        
        const allResults: AbstractTrackInfo[] = [];
        let maxLength = 0;
        for (const arr of resultsArrays) {
            if (arr.length > maxLength) maxLength = arr.length;
        }

        for (let i = 0; i < maxLength; i++) {
            for (const arr of resultsArrays) {
                if (i < arr.length) {
                    allResults.push(arr[i]);
                }
            }
        }

        // Move VIP/paid songs to the end to prioritize free content
        const normalResults: AbstractTrackInfo[] = [];
        const outlierResults: AbstractTrackInfo[] = [];

        for (const track of allResults) {
            // fee=1 or 4 usually indicates VIP/paid content on Netease
            if (track.fee === 1 || track.fee === 4) {
                outlierResults.push(track);
            } else {
                normalResults.push(track);
            }
        }

        return [...normalResults, ...outlierResults];
    }
}

export const sourceManager = new SourceManager();
