const LOOKAHEAD_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;

export class AudioClock {
  constructor() {
    this.context = null;
    this.master = null;
    this.timer = null;
    this.nextBeat = 0;
    this.nextBeatTime = 0;
    this.beatDuration = 0.5;
    this.onBeat = () => {};
  }

  async ensureRunning() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    return this.context.state === "running";
  }

  get currentTime() {
    return this.context?.currentTime ?? 0;
  }

  eventTimeToAudioSeconds(eventTimeMs) {
    if (!this.context) throw new Error("AudioContext has not started");
    if (typeof this.context.getOutputTimestamp === "function") {
      const timestamp = this.context.getOutputTimestamp();
      if (timestamp.contextTime > 0 && timestamp.performanceTime > 0) {
        return timestamp.contextTime + (eventTimeMs - timestamp.performanceTime) / 1000;
      }
    }
    return this.context.currentTime + (eventTimeMs - performance.now()) / 1000;
  }

  startMetronome({ startTime, bpm, totalBeats, onBeat }) {
    this.stopScheduler();
    this.nextBeat = -3;
    this.nextBeatTime = startTime - 1.5;
    this.beatDuration = 60 / bpm;
    this.totalBeats = totalBeats;
    this.onBeat = onBeat;
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_INTERVAL_MS);
    this.schedule();
  }

  schedule() {
    if (!this.context) return;
    const horizon = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
    while (this.nextBeatTime < horizon && this.nextBeat <= this.totalBeats) {
      if (this.nextBeat < 1 || this.nextBeat % 2 === 0) this.scheduleClick(this.nextBeatTime, this.nextBeat);
      this.onBeat(this.nextBeat, this.nextBeatTime);
      this.nextBeat += 1;
      this.nextBeatTime += this.beatDuration;
    }
  }

  scheduleClick(time, beat) {
    if (time < this.context.currentTime) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = beat < 0 ? "square" : "sine";
    oscillator.frequency.setValueAtTime(beat % 4 === 0 ? 740 : 520, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.8, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }

  playFeedback(judgement) {
    if (!this.context || judgement === "MISS") return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = judgement === "PERFECT" ? 1047 : judgement === "GOOD" ? 784 : 659;
    envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.35, this.context.currentTime + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.1);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.11);
  }

  stopScheduler() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
