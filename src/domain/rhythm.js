export const JUDGEMENT_WINDOWS_MS = Object.freeze({
  PERFECT: 35,
  GOOD: 80,
  OK: 130,
});

export const SCORE_VALUES = Object.freeze({
  PERFECT: 1000,
  GOOD: 600,
  OK: 250,
  MISS: 0,
});

export function beatToSeconds(beat, bpm) {
  if (!Number.isFinite(beat) || !Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError("beat and a positive bpm are required");
  }
  return beat * (60 / bpm);
}

export function performanceMsToAudioSeconds(performanceMs, timestamp) {
  if (!Number.isFinite(performanceMs)) throw new TypeError("performanceMs must be finite");
  const { contextTime, performanceTime } = timestamp;
  if (!Number.isFinite(contextTime) || !Number.isFinite(performanceTime)) {
    throw new TypeError("timestamp must contain finite contextTime and performanceTime");
  }
  return contextTime + (performanceMs - performanceTime) / 1000;
}

export function adjustedHitTimeSeconds(audioTimeSeconds, inputOffsetMs) {
  return audioTimeSeconds - inputOffsetMs / 1000;
}

export function judgeDeltaMs(deltaMs, windows = JUDGEMENT_WINDOWS_MS) {
  const absolute = Math.abs(deltaMs);
  if (absolute <= windows.PERFECT) return "PERFECT";
  if (absolute <= windows.GOOD) return "GOOD";
  if (absolute <= windows.OK) return "OK";
  return "MISS";
}

export function scoreFor(judgement, comboBeforeHit = 0) {
  const base = SCORE_VALUES[judgement] ?? 0;
  const comboBonus = judgement === "MISS" ? 0 : Math.min(comboBeforeHit, 20) * 10;
  return base + comboBonus;
}

export function closestPendingNote(notes, audioTimeSeconds, maxWindowMs = 130) {
  let candidate = null;
  for (const note of notes) {
    if (note.judged) continue;
    const deltaMs = (audioTimeSeconds - note.timeSeconds) * 1000;
    if (Math.abs(deltaMs) > maxWindowMs) continue;
    if (!candidate || Math.abs(deltaMs) < Math.abs(candidate.deltaMs)) {
      candidate = { note, deltaMs };
    }
  }
  return candidate;
}

export function createSession(notes) {
  return {
    notes: notes.map((note) => ({ ...note, judged: false, judgement: null, deltaMs: null })),
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { PERFECT: 0, GOOD: 0, OK: 0, MISS: 0 },
  };
}

export function applyJudgement(session, note, judgement, deltaMs = null) {
  if (note.judged) return session;
  const comboBeforeHit = session.combo;
  note.judged = true;
  note.judgement = judgement;
  note.deltaMs = deltaMs;
  session.score += scoreFor(judgement, comboBeforeHit);
  session.combo = judgement === "MISS" ? 0 : comboBeforeHit + 1;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  session.counts[judgement] += 1;
  return session;
}

export function expireMissedNotes(session, audioTimeSeconds, missWindowMs = 130) {
  const expired = [];
  for (const note of session.notes) {
    if (!note.judged && audioTimeSeconds > note.timeSeconds + missWindowMs / 1000) {
      applyJudgement(session, note, "MISS");
      expired.push(note);
    }
  }
  return expired;
}
