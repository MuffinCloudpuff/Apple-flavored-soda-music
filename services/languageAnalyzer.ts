export const REGIONAL_TAGS = ['欧美', '华语', '中文', '粤语', '国语', '日韩', '日语', '韩语', '英语', '轻音乐'];

export function detectLyricsLanguage(lyrics: { text: string }[] | undefined): string | null {
    if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) return null;
    
    let text = lyrics.map(l => l.text).join('').replace(/\s+/g, '');
    if (text.length === 0) return null;

    // Remove common symbols
    text = text.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '');

    const chineseMatch = text.match(/[\u4e00-\u9fa5]/g);
    const japaneseMatch = text.match(/[\u3040-\u30ff]/g);
    const koreanMatch = text.match(/[\uac00-\ud7af]/g);
    const englishMatch = text.match(/[A-Za-z]/g);

    const cnCount = chineseMatch ? chineseMatch.length : 0;
    const jpCount = japaneseMatch ? japaneseMatch.length : 0;
    const krCount = koreanMatch ? koreanMatch.length : 0;
    const enCount = englishMatch ? englishMatch.length : 0;

    const maxCount = Math.max(cnCount, jpCount, krCount, enCount);
    
    // threshold: requires reasonable amount of text to be confident
    if (maxCount < 10 && text.length > 50) {
        // If not matching C/J/K/E, maybe instrumental or weird chars.
        return null;
    }

    if (maxCount === jpCount && jpCount > 0) return '日韩';
    if (maxCount === krCount && krCount > 0) return '日韩';
    if (maxCount === cnCount && cnCount > 0) return '华语';
    if (maxCount === enCount && enCount > 0) return '欧美';

    return null;
}

export function calculateChineseProportion(text: string): number {
    if (!text) return 0;
    const cleanText = text.replace(/\s+/g, '');
    if (cleanText.length === 0) return 0;
    
    const chineseMatch = cleanText.match(/[\u4e00-\u9fa5]/g);
    const chineseCount = chineseMatch ? chineseMatch.length : 0;
    
    return chineseCount / cleanText.length;
}

export function isChinesePlaylist(tracks: { title: string, artist: string }[], minProportion: number = 0.5): boolean {
    if (!tracks || tracks.length === 0) return false;
    
    const chineseTracksCount = tracks.filter(t => {
        const titleProp = calculateChineseProportion(t.title);
        const artistProp = calculateChineseProportion(t.artist);
        // A track is likely Chinese if its title or artist has a high Chinese character proportion
        return titleProp > 0.3 || artistProp > 0.3;
    }).length;
    
    return (chineseTracksCount / tracks.length) >= minProportion;
}

export function resolveRegionalTagConflicts(tags: string[], actualLang: string | null, textForGuessing: string = ''): string[] {
    let detectedLang = actualLang;
    
    const hasChineseTag = tags.some(t => ['华语', '中文', '国语', '粤语'].some(kw => t.includes(kw)));
    const hasWesternTag = tags.some(t => ['欧美', '英语', '英文'].some(kw => t.includes(kw)));
    const hasJKTag = tags.some(t => ['日韩', '日语', '韩语', '日文', '韩文'].some(kw => t.includes(kw)));
    
    // If there are contradicting tags and we don't have actualLang, use text for guessing
    if (!detectedLang && ((hasChineseTag && hasWesternTag) || (hasChineseTag && hasJKTag) || (hasWesternTag && hasJKTag))) {
        if (textForGuessing) {
            const cnProp = calculateChineseProportion(textForGuessing);
            detectedLang = cnProp > 0.2 ? '华语' : '欧美';
        } else {
            // Default to Chinese if there's an irresolvable conflict and no text
            detectedLang = hasChineseTag ? '华语' : (hasWesternTag ? '欧美' : '日韩');
        }
    }

    if (!detectedLang) return tags; // Can't detect confidently and no conflict, leave tags alone
    
    // Mappings between our detected groups and common tags
    const groups = {
        '华语': ['华语', '中文', '国语', '粤语'],
        '欧美': ['欧美', '英语', '英文'],
        '日韩': ['日韩', '日语', '韩语', '日文', '韩文']
    };

    const isChineseDetected = detectedLang === '华语';
    const isWesternDetected = detectedLang === '欧美';
    const isJKDetected = detectedLang === '日韩';
    
    return tags.filter(tag => {
        // Find if this tag belongs to ANY regional category
        let tagGroup: string | null = null;
        for (const [groupName, keywords] of Object.entries(groups)) {
            if (keywords.some(kw => tag.includes(kw))) {
                tagGroup = groupName;
                break;
            }
        }
        
        // If it's not a regional tag, keep it
        if (!tagGroup) return true;
        
        // If it IS a regional tag, it MUST match the actual detected language
        if (tagGroup === '华语' && !isChineseDetected) return false;
        if (tagGroup === '欧美' && !isWesternDetected) return false;
        if (tagGroup === '日韩' && !isJKDetected) return false;
        
        return true; 
    });
}
