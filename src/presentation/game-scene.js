import Phaser from "phaser";

export class TowerScene extends Phaser.Scene {
  constructor() {
    super("tower");
    this.pulse = 0;
    this.shakeUntil = 0;
  }

  create() {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#171c26");
    this.draw(0);
    this.game.events.on("rhythm:beat", this.onBeat, this);
    this.game.events.on("rhythm:judgement", this.onJudgement, this);
  }

  shutdown() {
    this.game.events.off("rhythm:beat", this.onBeat, this);
    this.game.events.off("rhythm:judgement", this.onJudgement, this);
  }

  onBeat() {
    this.pulse = 1;
  }

  onJudgement({ judgement }) {
    if (judgement === "MISS") this.shakeUntil = this.time.now + 240;
    else this.pulse = judgement === "PERFECT" ? 1.5 : 1.15;
  }

  update(_time, delta) {
    this.pulse = Math.max(0, this.pulse - delta / 260);
    this.draw(this.pulse);
  }

  draw(pulse) {
    const g = this.graphics;
    const width = this.scale.width;
    const height = this.scale.height;
    const centerX = width / 2;
    const shake = this.time.now < this.shakeUntil ? Math.sin(this.time.now * 0.13) * 7 : 0;
    g.clear();

    g.fillStyle(0x10131a, 1);
    g.fillRect(0, 0, width, height);
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 97) % width;
      const y = (i * 53) % Math.floor(height * 0.7);
      g.fillStyle(0xdde6f2, i % 3 === 0 ? 0.55 : 0.25);
      g.fillCircle(x, y, i % 4 === 0 ? 1.7 : 1);
    }

    const glow = 38 + pulse * 18;
    g.fillStyle(0xf6b94b, 0.09 + pulse * 0.05);
    g.fillCircle(centerX, height * 0.28, 100 + glow);
    g.lineStyle(5, 0xf6b94b, 0.3 + pulse * 0.3);
    g.strokeCircle(centerX, height * 0.28, 70 + pulse * 10);
    g.fillStyle(0xffd66b, 0.9);
    g.fillCircle(centerX, height * 0.28, 25 + pulse * 8);

    g.fillStyle(0x5a6475, 1);
    g.fillRoundedRect(centerX - 20 + shake, height * 0.32, 40, height * 0.5, 8);
    for (let row = 0; row < 5; row += 1) {
      const y = height * 0.38 + row * 42;
      g.fillStyle(row % 2 ? 0xef776f : 0x67c6b8, 0.85);
      g.fillRoundedRect(centerX - 48 + shake, y, 96, 24, 12);
    }

    g.lineStyle(2, 0xffffff, 0.12);
    g.lineBetween(30, height - 36, width - 30, height - 36);
  }
}

export function createPhaserGame(parent = "game") {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 720,
    height: 460,
    backgroundColor: "#10131a",
    scene: TowerScene,
    render: { antialias: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}
