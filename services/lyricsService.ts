import { fetchViaProxy, getApiUrl, matchTrackFromList } from "./utils";

const LYRIC_API_BASE = getApiUrl("/api/netease");
const METING_API = getApiUrl("/api/netease"); // Deprecated basically, meting doesn't exist but we can use song/url?id=
const NETEASE_SEARCH_API = getApiUrl("/api/netease/cloudsearch");
const NETEASE_API_BASE = getApiUrl("/api/netease");
const NETEASECLOUD_API_BASE = getApiUrl("/api/netease");

const METADATA_KEYWORDS = [
  "歌词贡献者",
  "翻译贡献者",
  "作词",
  "作曲",
  "编曲",
  "制作",
  "词曲",
  "词 / 曲",
  "lyricist",
  "composer",
  "arrange",
  "translation",
  "translator",
  "producer",
];

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const metadataKeywordRegex = new RegExp(
  `^(${METADATA_KEYWORDS.map(escapeRegex).join("|")})\\s*[:：]`,
  "iu",
);

const TIMESTAMP_REGEX = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

interface NeteaseApiArtist {
  name?: string;
}

interface NeteaseApiAlbum {
  name?: string;
  picUrl?: string;
}

interface NeteaseApiSong {
  id: number;
  name?: string;
  ar?: NeteaseApiArtist[];
  al?: NeteaseApiAlbum;
  dt?: number;
}

interface NeteaseSearchResponse {
  result?: {
    songs?: NeteaseApiSong[];
  };
}

interface NeteasePlaylistResponse {
  songs?: NeteaseApiSong[];
}

interface NeteaseSongDetailResponse {
  code?: number;
  songs?: NeteaseApiSong[];
}

export interface NeteaseTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  duration?: number;
  fee?: number;
  isNetease: true;
  neteaseId: string;
}

type SearchOptions = {
  limit?: number;
  offset?: number;
};

const formatArtists = (artists?: any[]) =>
  (artists ?? [])
    .map((artist) => artist.name?.trim())
    .filter(Boolean)
    .join("/") || "";

const mapNeteaseSongToTrack = (song: any): NeteaseTrackInfo => ({
  id: song.id.toString(),
  title: song.name?.trim() ?? "",
  artist: formatArtists(song.ar || song.artists),
  album: (song.al || song.album)?.name?.trim() ?? "",
  coverUrl: (song.al || song.album)?.picUrl,
  duration: song.dt || song.duration,
  fee: song.fee,
  isNetease: true,
  neteaseId: song.id.toString(),
});

const isMetadataTimestampLine = (line: string): boolean => {
  const trimmed = line.trim();
  const match = trimmed.match(TIMESTAMP_REGEX);
  if (!match) return false;
  const content = match[4].trim();
  return metadataKeywordRegex.test(content);
};

const parseTimestampMetadata = (line: string) => {
  const match = line.trim().match(TIMESTAMP_REGEX);
  return match ? match[4].trim() : line.trim();
};

const isMetadataJsonLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const json = JSON.parse(trimmed);
    if (json.c && Array.isArray(json.c)) {
      const content = json.c.map((item: any) => item.tx || "").join("");
      return metadataKeywordRegex.test(content);
    }
  } catch {
    // ignore invalid json
  }
  return false;
};

const parseJsonMetadata = (line: string) => {
  try {
    const json = JSON.parse(line.trim());
    if (json.c && Array.isArray(json.c)) {
      return json.c
        .map((item: any) => item.tx || "")
        .join("")
        .trim();
    }
  } catch {
    // ignore
  }
  return line.trim();
};

const extractMetadataLines = (content: string) => {
  const metadataSet = new Set<string>();
  const bodyLines: string[] = [];

  content.split("\n").forEach((line) => {
    if (!line.trim()) return;
    if (isMetadataTimestampLine(line)) {
      metadataSet.add(parseTimestampMetadata(line));
    } else if (isMetadataJsonLine(line)) {
      metadataSet.add(parseJsonMetadata(line));
    } else {
      bodyLines.push(line);
    }
  });

  return {
    clean: bodyLines.join("\n").trim(),
    metadata: Array.from(metadataSet),
  };
};

export const getNeteaseAudioUrl = (id: string) => {
  return getApiUrl(`/api/audio/netease/${id}`);
};

// Implements the search logic from the user provided code snippet
export const searchNetEase = async (
  keyword: string,
  options: SearchOptions = {},
): Promise<NeteaseTrackInfo[]> => {
  const { limit = 20, offset = 0 } = options;
  const searchApiUrl = `${NETEASE_SEARCH_API}?keywords=${encodeURIComponent(
    keyword,
  )}&limit=${limit}&offset=${offset}`;

  try {
    const parsedSearchApiResponse = (await fetchViaProxy(
      searchApiUrl,
    )) as NeteaseSearchResponse;
    const songs = parsedSearchApiResponse.result?.songs ?? [];

    if (songs.length === 0) {
      return [];
    }

    return songs.map(mapNeteaseSongToTrack);
  } catch (error) {
    console.error("NetEase search error", error);
    return [];
  }
};

export const searchNetEasePlaylists = async (
  keyword: string,
  limit: number = 5
) => {
  const searchApiUrl = `${NETEASE_SEARCH_API}?keywords=${encodeURIComponent(
    keyword
  )}&limit=${limit}&offset=0&type=1000`;

  try {
    const res = await fetchViaProxy(searchApiUrl);
    return res?.result?.playlists || [];
  } catch (error) {
    console.error("NetEase playlist search error", error);
    return [];
  }
};

export const fetchNeteasePlaylist = async (
  playlistId: string,
): Promise<NeteaseTrackInfo[]> => {
  try {
    // 使用網易雲音樂 API 獲取歌單所有歌曲
    // 由於接口限制，需要分頁獲取，每次獲取 50 首
    const allTracks: NeteaseTrackInfo[] = [];
    const limit = 50;
    let offset = 0;
    let shouldContinue = true;

    while (shouldContinue) {
      const url = `${NETEASECLOUD_API_BASE}/playlist/track/all?id=${playlistId}&limit=${limit}&offset=${offset}`;
      const data = (await fetchViaProxy(url)) as NeteasePlaylistResponse;
      const songs = data.songs ?? [];
      if (songs.length === 0) {
        break;
      }

      const tracks = songs.map(mapNeteaseSongToTrack);

      allTracks.push(...tracks);

      // Continue fetching if the current page was full
      if (songs.length < limit) {
        shouldContinue = false;
      } else {
        offset += limit;
      }
    }

    return allTracks;
  } catch (e) {
    console.error("Playlist fetch error", e);
    return [];
  }
};

export const fetchNeteaseSong = async (
  songId: string,
): Promise<NeteaseTrackInfo | null> => {
  try {
    const url = `${NETEASECLOUD_API_BASE}/song/detail?ids=${songId}`;
    const data = (await fetchViaProxy(
      url,
    )) as NeteaseSongDetailResponse;
    const track = data.songs?.[0];
    if (data.code === 200 && track) {
      return mapNeteaseSongToTrack(track);
    }
    return null;
  } catch (e) {
    console.error("Song fetch error", e);
    return null;
  }
};

// Keeps the old search for lyric matching fallbacks
export const searchAndMatchLyrics = async (
  title: string,
  artist: string,
  durationSec: number = 0
): Promise<{ lrc: string; tLrc?: string; metadata: string[] } | null> => {
  try {
    const songs = await searchNetEase(`${title} ${artist}`, { limit: 10 });

    if (songs.length === 0) {
      console.warn("No songs found on Cloud");
      return null;
    }

    const matchedSong = matchTrackFromList(songs, title, artist, durationSec);
    const songId = matchedSong ? matchedSong.id : songs[0].id;
    console.log(`Matched Song ID: ${songId} (original title: ${title}, matched: ${matchedSong ? matchedSong.title : songs[0].title})`);

    const lyricsResult = await fetchLyricsById(songId);
    return lyricsResult;
  } catch (error) {
    console.error("Cloud lyrics match failed:", error);
    return null;
  }
};

export const fetchLyricsById = async (
  songId: string,
): Promise<{ lrc: string; tLrc?: string; metadata: string[] } | null> => {
  try {
    // 使用網易雲音樂 API 獲取歌詞
    const lyricUrl = `${NETEASECLOUD_API_BASE}/lyric/new?id=${songId}`;
    const lyricData = await fetchViaProxy(lyricUrl);

    const yrc = lyricData.yrc?.lyric;
    const lrc = lyricData.lrc?.lyric;
    const tLrc = lyricData.tlyric?.lyric;

    let originalLrc = yrc || lrc;

    if (!originalLrc) return null;

    // Extract metadata from original lyrics
    const { clean: cleanOriginal, metadata: originalMetadata } =
      extractMetadataLines(originalLrc);

    // Extract metadata from translation if available
    let cleanTranslation: string | undefined;
    let translationMetadata: string[] = [];
    if (tLrc) {
      const result = extractMetadataLines(tLrc);
      cleanTranslation = result.clean;
      translationMetadata = result.metadata;
    }

    const metadataSet = new Set([...originalMetadata, ...translationMetadata]);
    if (lyricData.lyricUser?.nickname) {
      metadataSet.add(`歌词贡献者: ${lyricData.lyricUser.nickname}`);
    }
    if (lyricData.transUser?.nickname) {
      metadataSet.add(`翻译贡献者: ${lyricData.transUser.nickname}`);
    }

        return {
      lrc: cleanOriginal || originalLrc,
      tLrc: cleanTranslation,
      metadata: Array.from(metadataSet),
    };
  } catch (e) {
    console.error("Lyric fetch error", e);
    return null;
  }
};

const formatLrcLibResponse = (data: any) => {
  if (!data || (!data.syncedLyrics && !data.plainLyrics)) return null;
  const lrc = data.syncedLyrics || data.plainLyrics;
  
  const { clean: cleanOriginal, metadata: originalMetadata } = extractMetadataLines(lrc);
  
  const metadataSet = new Set([...originalMetadata]);
  if (data.albumName) metadataSet.add(`Album: ${data.albumName}`);
  
  return {
      lrc: cleanOriginal || lrc,
      tLrc: undefined,
      metadata: Array.from(metadataSet)
  };
};

export const fetchLrcLibFuzzy = async (title: string, artist: string, duration?: number) => {
  try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(title + " " + artist)}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      let bestMatch = data[0];
      if (duration && duration > 0) {
          const tolerance = 5;
          const match = data.find(item => Math.abs(item.duration - duration) <= tolerance);
          if (match) bestMatch = match;
      }
      return formatLrcLibResponse(bestMatch);
  } catch(e) {
      console.error("Lrclib fuzzy search error", e);
      return null;
  }
};

export const fetchLrcLibLyrics = async (
  title: string,
  artist: string,
  duration?: number
): Promise<{ lrc: string; tLrc?: string; metadata: string[] } | null> => {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (duration && duration > 0) {
      params.append('duration', Math.round(duration).toString());
    }
    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
       if (response.status === 404) {
           return fetchLrcLibFuzzy(title, artist, duration);
       }
       return null;
    }
    const data = await response.json();
    return formatLrcLibResponse(data);
  } catch (error) {
    console.error("LrcLib fetch error", error);
    return null;
  }
};
