/**
 * 8bit チップチューン効果音エンジン（Web Audio API）
 * 外部音声ファイル不要。オシレーター(矩形波/三角波/ノコギリ波)とノイズで
 * レトロRPGらしい効果音をその場で合成する。
 *
 * 使い方: AudioEngine.play("attack")
 * ブラウザの自動再生ポリシー対策として、最初のクリック/キー入力で unlock する。
 * OBS ブラウザソースは音声が自動許可されるためそのまま鳴る。
 */
const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmGain = null;
  let muted = false;
  let unlocked = false;

  const BGM_VOL = 0.55;

  // 音名 → 周波数(Hz)
  const N = {
    C2:65.41,  D2:73.42,  E2:82.41,  F2:87.31,  G2:98.00,  A2:110.00, B2:123.47,
    C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00, B3:246.94,
    C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88,
    C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880.00, B5:987.77,
    C6:1046.50, D6:1174.66, E6:1318.51, F6:1396.91, G6:1567.98, A6:1760.00,
  };

  function _ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
      // BGM 専用バス（SFX とは別系統。ミュート時は 0 に）
      bgmGain = ctx.createGain();
      bgmGain.gain.value = muted ? 0 : BGM_VOL;
      bgmGain.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /** 単音。glideTo を指定すると周波数スイープ */
  function _tone(freq, start, dur, type = "square", vol = 0.3, glideTo = null, dest = null) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + dur);
    // 立ち上がり鋭く・減衰させて 8bit らしいエンベロープ
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(dest || masterGain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** ノイズバースト（打撃・ダメージ用） */
  function _noise(start, dur, vol = 0.3, filterFreq = 1200, filterType = "lowpass") {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /** 連続するメロディを鳴らす [{f, t, d, type, v}] */
  function _seq(t0, notes, type = "square", vol = 0.28) {
    for (const n of notes) {
      _tone(n.f, t0 + n.t, n.d ?? 0.1, n.type ?? type, n.v ?? vol, n.to ?? null);
    }
  }

  // ---- 効果音定義 ----
  const SFX = {
    // 通常攻撃: 高い矩形波ブリップ + 打撃ノイズ
    attack(t) {
      _tone(N.A5, t, 0.07, "square", 0.22, N.A4);
      _noise(t, 0.05, 0.18, 2400);
    },
    // 魔法: 上昇する炎のうねり
    magic(t) {
      _tone(N.E4, t, 0.32, "sawtooth", 0.18, N.E6);
      _tone(N.E5, t + 0.04, 0.26, "square", 0.10, N.B5);
      _noise(t, 0.32, 0.09, 900, "bandpass");
    },
    // 回復: やさしい三角波アルペジオ上昇
    heal(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.12 },
        { f: N.E5, t: 0.07, d: 0.12 },
        { f: N.G5, t: 0.14, d: 0.20 },
      ], "triangle", 0.24);
    },
    // 守る: 低い金属的なガード音
    defend(t) {
      _tone(N.C3, t, 0.18, "square", 0.28, N.G3);
      _noise(t, 0.07, 0.12, 600);
    },
    // 盗む: コイン音(マリオ風 2音)
    steal(t) {
      _tone(N.B5, t, 0.07, "square", 0.20);
      _tone(N.E6, t + 0.07, 0.22, "square", 0.20);
    },
    // 被ダメージ: ノイズ + 下降低音
    hurt(t) {
      _noise(t, 0.15, 0.28, 1400);
      _tone(N.G3, t, 0.16, "square", 0.22, N.C3);
    },
    // 敵撃破: ビブラート気味の下降 + 爆発ノイズ
    defeat(t) {
      _tone(N.A4, t, 0.09, "square", 0.24, N.A3);
      _tone(N.E4, t + 0.09, 0.09, "square", 0.24, N.E3);
      _tone(N.A3, t + 0.18, 0.26, "square", 0.24, N.A2);
      _noise(t + 0.18, 0.22, 0.18, 700);
    },
    // ボス出現: 低く重い警告音
    bossAppear(t) {
      _tone(N.C2, t, 0.45, "sawtooth", 0.26, N.C3);
      _tone(N.C3, t + 0.1, 0.4, "square", 0.12);
      _noise(t, 0.5, 0.1, 300);
    },
    // レベルアップ: 明るい上昇ファンファーレ
    levelup(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.10 },
        { f: N.E5, t: 0.10, d: 0.10 },
        { f: N.G5, t: 0.20, d: 0.10 },
        { f: N.C6, t: 0.30, d: 0.26 },
      ], "square", 0.26);
      _seq(t, [{ f: N.E6, t: 0.30, d: 0.26, v: 0.12 }], "triangle");
    },
    // 小ギフト
    giftSmall(t) {
      _tone(N.E5, t, 0.08, "square", 0.22);
      _tone(N.A5, t + 0.06, 0.12, "triangle", 0.16);
    },
    // 中ギフト: 宝箱パカッ
    giftMedium(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.10 },
        { f: N.G5, t: 0.10, d: 0.18 },
      ], "square", 0.24);
      _noise(t + 0.1, 0.1, 0.1, 3000, "highpass");
    },
    // 大ギフト: 派手な必殺技ファンファーレ
    giftLarge(t) {
      _seq(t, [
        { f: N.G4, t: 0.00, d: 0.10 },
        { f: N.C5, t: 0.10, d: 0.10 },
        { f: N.E5, t: 0.20, d: 0.10 },
        { f: N.G5, t: 0.30, d: 0.30 },
      ], "square", 0.28);
      _seq(t, [{ f: N.C6, t: 0.30, d: 0.30, v: 0.14 }], "sawtooth");
      _noise(t, 0.15, 0.12, 2000);
    },
    // 超大ギフト: 覚醒・壮大な上昇 + キラキラ
    giftSuper(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.10 },
        { f: N.E5, t: 0.10, d: 0.10 },
        { f: N.G5, t: 0.20, d: 0.10 },
        { f: N.C6, t: 0.30, d: 0.10 },
        { f: N.E6, t: 0.40, d: 0.10 },
        { f: N.G6, t: 0.50, d: 0.45 },
      ], "square", 0.26);
      // 持続コード
      _tone(N.C5, t + 0.5, 0.5, "triangle", 0.12);
      _tone(N.G5, t + 0.5, 0.5, "triangle", 0.10);
      _noise(t + 0.5, 0.4, 0.08, 5000, "highpass");
    },
    // 超弩級ギフト(ultra): 覚醒より長大・轟音つき
    giftUltra(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.10 }, { f: N.E5, t: 0.10, d: 0.10 },
        { f: N.G5, t: 0.20, d: 0.10 }, { f: N.C6, t: 0.30, d: 0.10 },
        { f: N.E6, t: 0.40, d: 0.10 }, { f: N.G6, t: 0.50, d: 0.10 },
        { f: N.C6, t: 0.60, d: 0.55 },
      ], "square", 0.27);
      _tone(N.C4, t, 0.6, "sawtooth", 0.16, N.C6);
      _tone(N.C3, t + 0.6, 0.6, "triangle", 0.13);
      _tone(N.G3, t + 0.6, 0.6, "triangle", 0.11);
      _noise(t, 0.5, 0.16, 400);
      _noise(t + 0.6, 0.5, 0.10, 5000, "highpass");
    },
    // 勇者ダウン: 暗く沈む下降
    heroDown(t) {
      _tone(N.A3, t, 0.5, "sawtooth", 0.26, N.A2);
      _tone(N.E3, t + 0.12, 0.5, "square", 0.16, N.E2);
      _noise(t, 0.4, 0.2, 500);
    },
    // ギフト蘇生: 力強い上昇ファンファーレ
    revive(t) {
      _seq(t, [
        { f: N.G4, t: 0.00, d: 0.10 }, { f: N.C5, t: 0.10, d: 0.10 },
        { f: N.E5, t: 0.20, d: 0.10 }, { f: N.G5, t: 0.30, d: 0.10 },
        { f: N.C6, t: 0.40, d: 0.34 },
      ], "square", 0.28);
      _seq(t, [{ f: N.E6, t: 0.40, d: 0.34, v: 0.14 }], "triangle");
      _noise(t, 0.12, 0.1, 4000, "highpass");
    },
    // ラストヒット: キラキラ降下
    lastHit(t) {
      _seq(t, [
        { f: N.G6, t: 0.00, d: 0.09 },
        { f: N.E6, t: 0.08, d: 0.09 },
        { f: N.C6, t: 0.16, d: 0.09 },
        { f: N.G5, t: 0.24, d: 0.18 },
      ], "triangle", 0.22);
    },
    // 応援ゲージMAX バースト
    supportBurst(t) {
      _tone(N.C4, t, 0.4, "sawtooth", 0.2, N.C6);
      _seq(t, [
        { f: N.C5, t: 0.25, d: 0.3, v: 0.16 },
        { f: N.E5, t: 0.25, d: 0.3, v: 0.14 },
        { f: N.G5, t: 0.25, d: 0.3, v: 0.12 },
      ], "square");
      _noise(t, 0.25, 0.1, 4000, "highpass");
    },
    // ゲーム開始ジングル
    gameStart(t) {
      _seq(t, [
        { f: N.C5, t: 0.00, d: 0.10 },
        { f: N.E5, t: 0.08, d: 0.10 },
        { f: N.G5, t: 0.16, d: 0.10 },
        { f: N.C6, t: 0.24, d: 0.22 },
      ], "square", 0.24);
    },
    // リザルトジングル: 勝利感のある短い曲
    result(t) {
      _seq(t, [
        { f: N.G4, t: 0.00, d: 0.14 },
        { f: N.C5, t: 0.14, d: 0.14 },
        { f: N.E5, t: 0.28, d: 0.14 },
        { f: N.G5, t: 0.42, d: 0.14 },
        { f: N.E5, t: 0.56, d: 0.14 },
        { f: N.G5, t: 0.70, d: 0.40 },
      ], "square", 0.26);
      _seq(t, [{ f: N.C6, t: 0.70, d: 0.40, v: 0.12 }], "triangle");
    },
  };

  // ---- BGM（ループするチップチューン。シーンごとに切替）----
  // 各トラックは 8分音符グリッドのメロディ＋ベースを持ち、ループ再生する。
  // tempo=BPM, melType=メロディ波形, *Vol=音量。null は休符。
  const TRACKS = {
    // フィールド: 明るく軽快な冒険曲
    field: {
      tempo: 130, melType: "square", melVol: 0.085, bassVol: 0.11,
      mel: [N.C5, N.E5, N.G5, N.E5,  N.F5, N.A5, N.G5, N.E5,
            N.D5, N.F5, N.E5, N.C5,  N.D5, N.G4, N.C5, null],
      bass: [N.C3, null, N.G2, null,  N.F2, null, N.G2, null],
    },
    // ボス: 緊迫した短調の戦闘曲
    boss: {
      tempo: 150, melType: "sawtooth", melVol: 0.08, bassVol: 0.12,
      mel: [N.A4, N.A4, N.C5, N.A4,  N.E5, null, N.D5, N.C5,
            N.A4, N.A4, N.F5, N.E5,  N.D5, N.C5, N.B4, null],
      bass: [N.A2, N.A2, N.F2, N.F2,  N.G2, N.G2, N.E2, N.E2],
    },
    // リザルト: 勝利感のある穏やかな曲
    result: {
      tempo: 122, melType: "square", melVol: 0.09, bassVol: 0.11,
      mel: [N.C5, N.E5, N.G5, N.C6,  N.B5, N.G5, N.C6, null,
            N.A5, N.F5, N.A5, N.C6,  N.G5, N.E5, N.C5, null],
      bass: [N.C3, null, N.F2, null,  N.G2, null, N.C3, null],
    },
  };

  let bgmTrack = null;   // 再生中トラック名
  let bgmTimer = null;   // スケジューラの setInterval ID
  let bgmStep = 0;       // 現在の 8分音符ステップ
  let bgmNextTime = 0;   // 次音の予約時刻(ctx時間)
  const BGM_AHEAD = 0.2; // 先読みスケジュール秒数

  // lookahead スケジューラ: ctx.currentTime より少し先まで音を予約する。
  // suspended 中やミュート中は時刻だけ進めて音は出さない（バックログ防止）。
  function _bgmSchedule() {
    if (!ctx || ctx.state !== "running" || muted || !bgmTrack) {
      if (ctx) bgmNextTime = ctx.currentTime + 0.05;
      return;
    }
    const tr = TRACKS[bgmTrack];
    const step8 = 60 / tr.tempo / 2; // 8分音符の長さ(秒)
    while (bgmNextTime < ctx.currentTime + BGM_AHEAD) {
      const m = tr.mel[bgmStep % tr.mel.length];
      const b = tr.bass[bgmStep % tr.bass.length];
      if (m) _tone(m, bgmNextTime, step8 * 0.9, tr.melType, tr.melVol, null, bgmGain);
      if (b) _tone(b, bgmNextTime, step8 * 0.96, "triangle", tr.bassVol, null, bgmGain);
      bgmNextTime += step8;
      bgmStep++;
    }
  }

  function playBgm(name) {
    if (bgmTrack === name) return;     // 既に同じ曲なら何もしない
    if (!TRACKS[name]) return;
    const c = _ensure();
    bgmTrack = name;
    bgmStep = 0;
    if (c) bgmNextTime = c.currentTime + 0.06;
    if (!bgmTimer) bgmTimer = setInterval(_bgmSchedule, 40);
  }

  function stopBgm() {
    bgmTrack = null;
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  // ---- 公開API ----
  function play(name) {
    if (muted) return;
    const c = _ensure();
    if (!c || !SFX[name]) return;
    try {
      SFX[name](c.currentTime + 0.001);
    } catch (e) {
      console.warn("[Audio] 再生失敗:", name, e);
    }
  }

  function unlock() {
    if (unlocked) return;
    const c = _ensure();
    if (c && c.state === "running") unlocked = true;
  }

  function toggleMute() {
    muted = !muted;
    // BGM バスを滑らかに上げ下げ（SFX は play 側で muted を見て抑止）
    if (bgmGain && ctx) {
      bgmGain.gain.setTargetAtTime(muted ? 0 : BGM_VOL, ctx.currentTime, 0.02);
    }
    return muted;
  }

  function isMuted() { return muted; }
  function isUnlocked() { return unlocked; }

  return { play, unlock, toggleMute, isMuted, isUnlocked, playBgm, stopBgm };
})();

window.AudioEngine = AudioEngine;
window.sfx = (name) => AudioEngine.play(name);
window.bgm = (name) => AudioEngine.playBgm(name);
