import { hashString } from '@ai-knowledge-inbox/domain';

export interface TextChunk {
  ordinal: number;
  text: string;
  tokenCount: number;
  contentHash: string;
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Approximating tokens: words count + character estimate / 4
  const words = text.trim().split(/\s+/).length;
  const charTokens = Math.ceil(text.length / 4);
  return Math.max(words, charTokens);
}

export function chunkText(
  text: string,
  targetTokens = 800,
  overlapTokens = 120
): TextChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: TextChunk[] = [];
  let ordinal = 0;

  let currentParaList: string[] = [];
  let currentTokenCount = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokenCount(para);

    // Single long paragraph case
    if (paraTokens > targetTokens) {
      // Flush any pending paragraphs
      if (currentParaList.length > 0) {
        const chunkTextStr = currentParaList.join('\n\n');
        chunks.push({
          ordinal: ordinal++,
          text: chunkTextStr,
          tokenCount: estimateTokenCount(chunkTextStr),
          contentHash: hashString(chunkTextStr),
        });
        currentParaList = [];
        currentTokenCount = 0;
      }

      // Sliding window over long paragraph
      const words = para.split(/\s+/);
      const targetWords = Math.floor(targetTokens * 0.75); // approx words per chunk
      const overlapWords = Math.floor(overlapTokens * 0.75);
      const step = Math.max(1, targetWords - overlapWords);

      for (let i = 0; i < words.length; i += step) {
        const windowWords = words.slice(i, i + targetWords);
        if (windowWords.length === 0) break;
        const windowText = windowWords.join(' ');
        chunks.push({
          ordinal: ordinal++,
          text: windowText,
          tokenCount: estimateTokenCount(windowText),
          contentHash: hashString(windowText),
        });
        if (i + targetWords >= words.length) break;
      }
      continue;
    }

    if (currentTokenCount + paraTokens > targetTokens && currentParaList.length > 0) {
      const chunkTextStr = currentParaList.join('\n\n');
      chunks.push({
        ordinal: ordinal++,
        text: chunkTextStr,
        tokenCount: estimateTokenCount(chunkTextStr),
        contentHash: hashString(chunkTextStr),
      });

      // Overlap: retain ending paragraph if it fits in overlap
      const lastPara = currentParaList[currentParaList.length - 1];
      if (lastPara && estimateTokenCount(lastPara) <= overlapTokens) {
        currentParaList = [lastPara, para];
        currentTokenCount = estimateTokenCount(lastPara) + paraTokens;
      } else {
        currentParaList = [para];
        currentTokenCount = paraTokens;
      }
    } else {
      currentParaList.push(para);
      currentTokenCount += paraTokens;
    }
  }

  if (currentParaList.length > 0) {
    const chunkTextStr = currentParaList.join('\n\n');
    chunks.push({
      ordinal: ordinal++,
      text: chunkTextStr,
      tokenCount: estimateTokenCount(chunkTextStr),
      contentHash: hashString(chunkTextStr),
    });
  }

  return chunks;
}
