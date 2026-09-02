import { DECK_SLIDE_COUNT } from "./content";

export function clampDeckIndex(index: number): number {
  return Math.min(DECK_SLIDE_COUNT - 1, Math.max(0, index));
}
export function parseDeckHash(hash: string): number | null {
  const match = /^#slide-(\d{2})$/u.exec(hash);
  if (!match) return null;
  const slideNumber = Number(match[1]);
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > DECK_SLIDE_COUNT) {
    return null;
  }
  return slideNumber - 1;
}

export function deckIndexForKey(
  key: string,
  shiftKey: boolean,
  currentIndex: number,
): number | null {
  if (key === "Home") return 0;
  if (key === "End") return DECK_SLIDE_COUNT - 1;
  if (key === " " && shiftKey) return clampDeckIndex(currentIndex - 1);
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(key)) {
    return clampDeckIndex(currentIndex - 1);
  }
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(key)) {
    return clampDeckIndex(currentIndex + 1);
  }
  return null;
}
