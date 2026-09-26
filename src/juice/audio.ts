/**
 * Ambient audio (F22): a synthesized sea loop and random bird chirps, both WebAudio, no files.
 * The AudioContext is created only after the player turns sound on (a user gesture).
 */

interface Ambient {
  ctx: AudioContext;
  master: GainNode;
  sea: GainNode;
  birds: GainNode;
}

let ambient: Ambient | null = null;

/** The shared AudioContext, or null while sound has never been turned on. */
export function getAudio(): AudioContext | null {
  return ambient?.ctx ?? null;
}

/** Master gain other code can connect to so it respects mute. Null before sound is on. */
export function getMasterGain(): GainNode | null {
  return ambient?.master ?? null;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Brown-ish noise: soft and wave-like rather than hissy.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function build(): Ambient | null {
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Sea: looped noise through a lowpass, with a slow LFO swelling the volume like waves.
  const sea = ctx.createGain();
  sea.gain.value = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 6);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  const swell = ctx.createGain();
  swell.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.4;
  lfo.connect(lfoDepth).connect(swell.gain);
  src.connect(lp).connect(swell).connect(sea).connect(master);
  src.start();
  lfo.start();

  const birds = ctx.createGain();
  birds.gain.value = 0;
  birds.connect(master);
  return { ctx, master, sea, birds };
}

/** Creates the context on first call (must be inside a user gesture) and resumes it. */
export function enableAudio(): void {
  if (!ambient) ambient = build();
  void ambient?.ctx.resume();
}

export function setMasterVolume(on: boolean): void {
  if (!ambient) return;
  const g = ambient.master.gain;
  g.setTargetAtTime(on ? 0.9 : 0, ambient.ctx.currentTime, 0.2);
}

/** Proximity mix in [0, 1] for each loop; eased so walking around never clicks. */
export function setAmbientMix(sea: number, birds: number): void {
  if (!ambient) return;
  const t = ambient.ctx.currentTime;
  ambient.sea.gain.setTargetAtTime(0.05 + 0.5 * sea, t, 0.6);
  ambient.birds.gain.setTargetAtTime(0.25 * birds, t, 0.6);
}

/** One short two-note chirp into the bird bus. */
export function chirp(): void {
  if (!ambient) return;
  const { ctx, birds } = ambient;
  const t0 = ctx.currentTime + 0.02;
  const notes = 1 + Math.floor(Math.random() * 3);
  const base = 2400 + Math.random() * 1600;
  for (let n = 0; n < notes; n++) {
    const t = t0 + n * (0.09 + Math.random() * 0.05);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(env).connect(birds);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}
