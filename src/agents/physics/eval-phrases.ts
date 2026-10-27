/** Equivalent exam vocabulary for Physics's deterministic concept checks. */
export function physicsPhrasePresent(text: string, phrase: string) {
  const lower = text.toLowerCase();
  if (lower.includes(phrase.toLowerCase())) return true;
  if (phrase.toLowerCase() === "inward") {
    return /\btowards? (?:the )?cent(?:re|er)\b/.test(lower);
  }
  if (phrase.toLowerCase() === "resultant") return /\bnet force\b/.test(lower);
  if (phrase.toLowerCase() === "centre") return /\binwards?\b|\bcenter\b/.test(lower);
  if (phrase.toLowerCase() === "weight") return /\bforce of gravity\b|\bgravitational force\b/.test(lower);
  if (phrase.toLowerCase() === "zero") return /\bno (?:(?:net|resultant) force|acceleration)\b/.test(lower);
  return false;
}
