import "./style.css";
import { CHART } from "./data/chart.js";
import {
  adjustedHitTimeSeconds,
  applyJudgement,
  beatToSeconds,
  closestPendingNote,
  createSession,
  expireMissedNotes,
  judgeDeltaMs,
} from "./domain/rhythm.js";
import { AudioClock } from "./infrastructure/audio-clock.js";
import { createPhaserGame } from "./presentation/game-scene.js";

const ui = Object.fromEntries(
  ["score", "combo", "remaining", "judgement", "hit-button", "start-button", "offset", "offset-value", "result-dialog", "result-score", "result-breakdown", "retry-button"]
    .map((id) => [id, document.getElementById(id)]),
);

const audio = new AudioClock();
const game = createPhaserGame();
const maxWindowMs = 130;
const storageKey = "akita-rhythm-input-offset-ms";
let phase = "ready";
let session = null;
let songStartTime = 0;
let animationFrame = null;
let generation = 0;

const parsedOffset = Number.parseInt(localStorage.getItem(storageKey) ?? "0", 10);
ui.offset.value = String(Number.isFinite(parsedOffset) ? parsedOffset : 0);
updateOffsetLabel();

function chartNotes(startTime) {
  return CHART.notes.map((beat, index) => ({
    id: index,
    beat,
    timeSeconds: startTime + beatToSeconds(beat, CHART.bpm),
  }));
}

function updateOffsetLabel() {
  const value = Number(ui.offset.value);
  ui["offset-value"].value = `${value > 0 ? "+" : ""}${value} ms`;
  ui["offset-value"].textContent = ui["offset-value"].value;
}

function renderHud() {
  ui.score.textContent = String(session?.score ?? 0).padStart(5, "0");
  ui.combo.textContent = String(session?.combo ?? 0);
}

function setJudgement(message, className = "") {
  ui.judgement.textContent = message;
  ui.judgement.dataset.kind = className;
}

async function startGame() {
  if (phase === "countdown" || phase === "playing") return;
  try {
    if (!(await audio.ensureRunning())) throw new Error("音声を開始できませんでした");
  } catch (error) {
    setJudgement(`${error.message}。もう一度開始を押してください。`, "MISS");
    return;
  }

  generation += 1;
  const activeGeneration = generation;
  ui["result-dialog"].close();
  ui["start-button"].disabled = true;
  ui["hit-button"].disabled = true;
  ui.offset.disabled = true;
  phase = "countdown";
  songStartTime = audio.currentTime + CHART.startDelaySeconds;
  session = createSession(chartNotes(songStartTime));
  renderHud();
  ui.remaining.textContent = `${Math.ceil(beatToSeconds(CHART.endBeat, CHART.bpm))}秒`;
  setJudgement("3", "COUNTDOWN");

  audio.startMetronome({
    startTime: songStartTime,
    bpm: CHART.bpm,
    totalBeats: CHART.endBeat,
    onBeat: (beat, beatTime) => {
      const delay = Math.max(0, (beatTime - audio.currentTime) * 1000);
      window.setTimeout(() => {
        if (generation !== activeGeneration) return;
        if (beat === -2) setJudgement("2", "COUNTDOWN");
        if (beat === -1) setJudgement("1", "COUNTDOWN");
        if (beat === 0) {
          phase = "playing";
          ui["hit-button"].disabled = false;
          setJudgement("合図に合わせて押す", "READY");
        }
        if (beat >= 0) game.events.emit("rhythm:beat", beat);
      }, delay);
    },
  });
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(update);
}

function handleHit(eventTimeMs = performance.now()) {
  if (phase !== "playing" || !session) return;
  const eventAudioTime = audio.eventTimeToAudioSeconds(eventTimeMs);
  const adjustedTime = adjustedHitTimeSeconds(eventAudioTime, Number(ui.offset.value));
  const candidate = closestPendingNote(session.notes, adjustedTime, maxWindowMs);
  if (!candidate) {
    setJudgement("まだ合図ではありません", "MISS");
    game.events.emit("rhythm:judgement", { judgement: "MISS" });
    return;
  }

  const judgement = judgeDeltaMs(candidate.deltaMs);
  applyJudgement(session, candidate.note, judgement, candidate.deltaMs);
  const timing = candidate.deltaMs < -1 ? "早い" : candidate.deltaMs > 1 ? "遅い" : "中央";
  setJudgement(`${judgement} · ${timing} ${Math.round(Math.abs(candidate.deltaMs))}ms`, judgement);
  audio.playFeedback(judgement);
  game.events.emit("rhythm:judgement", { judgement });
  renderHud();
}

function update() {
  if ((phase !== "playing" && phase !== "countdown") || !session) return;
  const now = audio.currentTime;
  if (phase === "playing") {
    const misses = expireMissedNotes(session, now, maxWindowMs);
    if (misses.length) {
      setJudgement("MISS · 合図を逃しました", "MISS");
      game.events.emit("rhythm:judgement", { judgement: "MISS" });
      renderHud();
    }
    const elapsed = Math.max(0, now - songStartTime);
    const duration = beatToSeconds(CHART.endBeat, CHART.bpm);
    ui.remaining.textContent = `${Math.max(0, Math.ceil(duration - elapsed))}秒`;
    if (elapsed >= duration) {
      finishGame();
      return;
    }
  }
  animationFrame = requestAnimationFrame(update);
}

function finishGame() {
  phase = "result";
  audio.stopScheduler();
  cancelAnimationFrame(animationFrame);
  expireMissedNotes(session, Number.POSITIVE_INFINITY, maxWindowMs);
  renderHud();
  ui["hit-button"].disabled = true;
  ui["start-button"].disabled = false;
  ui.offset.disabled = false;
  ui["result-score"].textContent = `SCORE ${String(session.score).padStart(5, "0")} / MAX COMBO ${session.maxCombo}`;
  ui["result-breakdown"].innerHTML = Object.entries(session.counts)
    .map(([name, count]) => `<div><dt>${name}</dt><dd>${count}</dd></div>`)
    .join("");
  ui["result-dialog"].showModal();
  setJudgement("プレイ完了", "PERFECT");
}

function interruptGame() {
  if (phase !== "playing" && phase !== "countdown") return;
  generation += 1;
  phase = "interrupted";
  audio.stopScheduler();
  cancelAnimationFrame(animationFrame);
  ui["hit-button"].disabled = true;
  ui["start-button"].disabled = false;
  ui.offset.disabled = false;
  setJudgement("タブ移動で中断しました。最初から再開してください。", "MISS");
}

ui["start-button"].addEventListener("click", startGame);
ui["retry-button"].addEventListener("click", startGame);
ui["hit-button"].addEventListener("pointerdown", (event) => {
  event.preventDefault();
  handleHit(event.timeStamp);
});
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  event.preventDefault();
  handleHit(event.timeStamp);
});
ui["hit-button"].addEventListener("click", (event) => {
  if (event.detail === 0) handleHit(event.timeStamp);
});
ui.offset.addEventListener("input", () => {
  updateOffsetLabel();
  localStorage.setItem(storageKey, ui.offset.value);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) interruptGame();
});

window.__AKITA_RHYTHM_DEBUG__ = {
  get phase() { return phase; },
  get audioState() { return audio.context?.state ?? "uninitialized"; },
  get audioTime() { return audio.currentTime; },
  get session() { return session; },
  handleHit,
  finishGame,
};
