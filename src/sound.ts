// Small synthesized sound effects (no audio files). Muted state is remembered per device.
import { useSyncExternalStore } from "react";

export type SoundName = "move" | "capture" | "check" | "promote" | "win" | "lose" | "draw";

const STORAGE_KEY = "chess-base:muted";
let muted = readMuted();
let context: AudioContext | null = null;
const listeners = new Set<() => void>();

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Private mode: the choice lasts for this page load.
  }
  listeners.forEach((listener) => listener());
}

export function useMuted() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => muted
  );
}

function audio() {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

// A wooden "tock": a short filtered noise click over a quick low thump.
function tock(ctx: AudioContext, at: number, pitch: number, gain: number) {
  const length = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = pitch * 5;
  filter.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = gain * 0.9;
  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(at);

  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(pitch, at);
  thump.frequency.exponentialRampToValueAtTime(pitch * 0.55, at + 0.09);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(gain, at);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  thump.connect(thumpGain).connect(ctx.destination);
  thump.start(at);
  thump.stop(at + 0.12);
}

function note(ctx: AudioContext, at: number, frequency: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playSound(name: SoundName) {
  if (muted) return;
  let ctx: AudioContext | null = null;
  try {
    ctx = audio();
  } catch {
    return;
  }
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  if (name === "move") tock(ctx, now, 190, 0.22);
  if (name === "capture") {
    tock(ctx, now, 150, 0.26);
    tock(ctx, now + 0.085, 230, 0.2);
  }
  if (name === "check") {
    // The move's tock, then two quick rising notes: unmistakably "watch your king".
    tock(ctx, now, 190, 0.22);
    [740, 988].forEach((f, i) => note(ctx, now + 0.07 + i * 0.075, f, 0.22, 0.06));
  }
  if (name === "promote") [523, 784].forEach((f, i) => note(ctx, now + i * 0.09, f, 0.35, 0.07));
  if (name === "draw") [440, 440].forEach((f, i) => note(ctx, now + i * 0.2, f, 0.45, 0.06));
  if (name === "win") [392, 523, 659, 784].forEach((f, i) => note(ctx, now + i * 0.11, f, 0.5, 0.08));
  if (name === "lose") [392, 330, 262].forEach((f, i) => note(ctx, now + i * 0.16, f, 0.55, 0.07));
}

// The sound for one move-log entry.
export function soundForMove(entry: { captured: unknown[]; check: boolean; promotion?: string }): SoundName {
  if (entry.check) return "check";
  if (entry.promotion) return "promote";
  return entry.captured.length > 0 ? "capture" : "move";
}
