export const EMOTION_CATEGORIES = {
    POSITIVE: {
        id: 'positive',
        name: '快乐时光',
        keywords: ['欢快', '动感', '快乐', '节奏', '激情', '愉悦'],
        baseWeight: 1.0
    },
    NEUTRAL: {
        id: 'neutral',
        name: 'Chill 放松',
        keywords: ['治愈', '放松', '清新', '下午茶', '轻音乐', '安静', '慵懒', '睡眠', '午后', '发呆', '散步'],
        baseWeight: 1.2
    },
    NEGATIVE: {
        id: 'negative',
        name: '深夜 emo',
        keywords: ['伤感', '孤独', '夜晚', '思念', '寂寞', '遗憾', '催泪', 'emo', '心碎', '深夜', '痛', '失恋', '爱而不得'],
        baseWeight: 1.5 // 夜晚、emo类权重更高，宁愿判定为emo也不要判定为快乐
    }
};

/**
 * 分析并解决标签中的情绪冲突
 * 核心逻辑：计算各类情绪标签的权重总和，只保留得分最高的情绪类型的标签，过滤掉其他冲突情绪的标签。
 */
export function resolveTagConflicts(tags: string[]): { resolvedTags: string[], hadConflict: boolean } {
    if (!tags || !Array.isArray(tags) || tags.length === 0) return { resolvedTags: [], hadConflict: false };

    let scores = { positive: 0, neutral: 0, negative: 0 };
    let matchedTags = { 
        positive: new Set<string>(), 
        neutral: new Set<string>(), 
        negative: new Set<string>() 
    };

    // 1. 遍历所有标签，计算各情绪维度的得分
    for (const tag of tags) {
        const tagLower = tag.toLowerCase();
        
        // 判定负面（emo）
        for (const kw of EMOTION_CATEGORIES.NEGATIVE.keywords) {
            if (tagLower.includes(kw)) {
                scores.negative += EMOTION_CATEGORIES.NEGATIVE.baseWeight;
                matchedTags.negative.add(tag);
                break; // 当前标签在这个维度匹配中只算一次
            }
        }
        
        // 判定中性（放松）
        for (const kw of EMOTION_CATEGORIES.NEUTRAL.keywords) {
            if (tagLower.includes(kw)) {
                scores.neutral += EMOTION_CATEGORIES.NEUTRAL.baseWeight;
                matchedTags.neutral.add(tag);
                break;
            }
        }
        
        // 判定正面（快乐）
        for (const kw of EMOTION_CATEGORIES.POSITIVE.keywords) {
            if (tagLower.includes(kw)) {
                scores.positive += EMOTION_CATEGORIES.POSITIVE.baseWeight;
                matchedTags.positive.add(tag);
                break;
            }
        }
    }

    const emotionCount = (scores.positive > 0 ? 1 : 0) + (scores.neutral > 0 ? 1 : 0) + (scores.negative > 0 ? 1 : 0);
    const hadConflict = emotionCount > 1;

    // 如果没有任何情绪标签，直接返回原始标签
    if (scores.positive === 0 && scores.neutral === 0 && scores.negative === 0) {
        return { resolvedTags: tags, hadConflict: false };
    }

    // 2. 决策：选出最终胜利的情绪（权重最大者，如果同分，优先倾向于 emo -> 放松 -> 快乐）
    const maxScore = Math.max(scores.positive, scores.neutral, scores.negative);
    
    let winner = 'positive';
    if (scores.negative === maxScore) {
        winner = 'negative';
    } else if (scores.neutral === maxScore) {
        winner = 'neutral';
    }

    // 3. 过滤：清理掉与胜利情绪相冲突的其他情绪标签
    const invalidEmotionTags = new Set<string>();
    for (const key of Object.keys(matchedTags)) {
        if (key !== winner) {
            matchedTags[key as keyof typeof matchedTags].forEach(t => invalidEmotionTags.add(t));
        }
    }

    // 确保被胜利方包含的标签不被误杀（防止一个标签兼具多个分类）
    const validEmotionTags = matchedTags[winner as keyof typeof matchedTags];
    validEmotionTags.forEach(t => invalidEmotionTags.delete(t));

    // 返回过滤后的标签列表
    return { 
        resolvedTags: tags.filter(t => !invalidEmotionTags.has(t)), 
        hadConflict 
    };
}
