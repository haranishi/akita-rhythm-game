import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustedHitTimeSeconds,
  applyJudgement,
  beatToSeconds,
  closestPendingNote,
  createSession,
  expireMissedNotes,
  judgeDeltaMs,
  performanceMsToAudioSeconds,
  scoreFor,
} from "../src/domain/rhythm.js";

test("120 BPMのbeat 4は2秒へ変換される", () => {
  assert.equal(beatToSeconds(4, 120), 2);
});

test("performance時計をAudioContext時計へ変換する", () => {
  const timestamp = { contextTime: 10, performanceTime: 5000 };
  assert.equal(performanceMsToAudioSeconds(5050, timestamp), 10.05);
});

test("正の入力補正は遅れた入力を早く扱う", () => {
  assert.equal(adjustedHitTimeSeconds(10.05, 50), 10);
});

test("判定窓の境界値を含む", () => {
  assert.equal(judgeDeltaMs(35), "PERFECT");
  assert.equal(judgeDeltaMs(-35), "PERFECT");
  assert.equal(judgeDeltaMs(80), "GOOD");
  assert.equal(judgeDeltaMs(-130), "OK");
  assert.equal(judgeDeltaMs(130.001), "MISS");
});

test("最も近い未判定ノーツだけを選ぶ", () => {
  const session = createSession([{ id: 1, timeSeconds: 1 }, { id: 2, timeSeconds: 1.1 }]);
  const candidate = closestPendingNote(session.notes, 1.08);
  assert.equal(candidate.note.id, 2);
  applyJudgement(session, candidate.note, "PERFECT", candidate.deltaMs);
  assert.equal(closestPendingNote(session.notes, 1.08).note.id, 1);
});

test("期限切れMISSは一度しか記録されない", () => {
  const session = createSession([{ id: 1, timeSeconds: 1 }]);
  assert.equal(expireMissedNotes(session, 1.14).length, 1);
  assert.equal(expireMissedNotes(session, 2).length, 0);
  assert.equal(session.counts.MISS, 1);
});

test("コンボ得点とMISSリセット", () => {
  const session = createSession([{ id: 1, timeSeconds: 1 }, { id: 2, timeSeconds: 2 }]);
  applyJudgement(session, session.notes[0], "PERFECT", 0);
  assert.equal(session.score, scoreFor("PERFECT", 0));
  applyJudgement(session, session.notes[1], "MISS");
  assert.equal(session.combo, 0);
  assert.equal(session.maxCombo, 1);
});

test("不正なBPMを拒否する", () => {
  assert.throws(() => beatToSeconds(4, 0), RangeError);
});
