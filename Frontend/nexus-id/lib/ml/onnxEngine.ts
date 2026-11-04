import path from 'path';
import fs from 'fs';
import os from 'os';

const EDGE_MODEL_BASE_URL = process.env.NEXT_PUBLIC_MODEL_EDGE_URL || '';

async function resolveOrFetchModelBuffer(
  filename: string,
  requestOrigin?: string
): Promise<{ buffer: Uint8Array; source: 'local' | 'edge-cdn' }> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'models', filename),
    path.join(cwd, 'Frontend', 'nexus-id', 'public', 'models', filename),
    path.join(__dirname, '..', '..', 'public', 'models', filename),
    path.join(__dirname, '..', 'public', 'models', filename),
  ];

  // 1. Check local / bundled serverless filesystem first
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        return { buffer: new Uint8Array(buf), source: 'local' };
      }
    } catch {
      // Continue to next candidate
    }
  }

  // 2. Check /tmp cache in Vercel Serverless / Edge environment
  const cacheDir = path.join(os.tmpdir(), 'nexusid-edge-models');
  const cachedPath = path.join(cacheDir, filename);
  try {
    if (fs.existsSync(cachedPath)) {
      const buf = fs.readFileSync(cachedPath);
      return { buffer: new Uint8Array(buf), source: 'edge-cdn' };
    }
  } catch {
    // Ignore tmp cache read error
  }

  // 3. Fetch over HTTPS from Edge CDN, Vercel Production/Preview URL, or Request Origin
  const baseUrls: string[] = [];
  if (EDGE_MODEL_BASE_URL) {
    baseUrls.push(EDGE_MODEL_BASE_URL.replace(/\/$/, ''));
  }
  if (requestOrigin) {
    baseUrls.push(`${requestOrigin.replace(/\/$/, '')}/models`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    baseUrls.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/models`);
  }
  if (process.env.VERCEL_URL) {
    baseUrls.push(`https://${process.env.VERCEL_URL}/models`);
  }

  for (const base of baseUrls) {
    try {
      const res = await fetch(`${base}/${filename}`);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);
        try {
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cachedPath, Buffer.from(arrayBuf));
        } catch {
          // Non-critical if /tmp write fails
        }
        return { buffer: uint8, source: 'edge-cdn' };
      }
    } catch {
      // Try next URL
    }
  }

  throw new Error(`Could not resolve ONNX model binary for ${filename}`);
}

export interface KeyEventData {
  key: string;
  type: 'keydown' | 'keyup';
  timestamp: number;
}

export interface MouseEventData {
  x: number;
  y: number;
  type: string;
  timestamp: number;
}

export interface ExtractedMouseFeatures {
  mean_vel: number;
  std_vel: number;
  max_vel: number;
  mean_acc: number;
  std_acc: number;
  idle_pct: number;
}

export interface ExtractedKeystrokeFeatures {
  mean_hold: number;
  std_hold: number;
  mean_dd: number;
  std_dd: number;
  mean_ud: number;
  std_ud: number;
  hold_to_dd_ratio?: number;
  rollover_rate?: number;
  clean_digraph_count?: number;
}

export interface ModelInferenceResult {
  engine: string;
  model_source: 'local' | 'edge-cdn' | 'fallback';
  inference_time_ms: number;
  risk_score: number;
  active_modalities: {
    keystroke_active: boolean;
    mouse_active: boolean;
  };
  mouse: {
    features: ExtractedMouseFeatures;
    label: number;
    imposter_prob: number;
    human_prob: number;
  };
  keystroke: {
    features: ExtractedKeystrokeFeatures;
    label: number;
    imposter_prob: number;
    human_prob: number;
  };
}

let ortModule: any = null;
let mouseSession: any = null;
let keySession: any = null;
let modelSourceType: 'local' | 'edge-cdn' | 'fallback' = 'local';
let initPromise: Promise<boolean> | null = null;

async function getOrInitSessions(requestOrigin?: string): Promise<boolean> {
  if (mouseSession && keySession) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!ortModule) {
        ortModule = await import('onnxruntime-node');
      }

      const [mouseResolved, keyResolved] = await Promise.all([
        resolveOrFetchModelBuffer('mouse.onnx', requestOrigin),
        resolveOrFetchModelBuffer('keystroke.onnx', requestOrigin),
      ]);

      modelSourceType = keyResolved.source;

      // Pass Uint8Array buffer directly to InferenceSession.create (works in Vercel Serverless & Local)
      const [mSess, kSess] = await Promise.all([
        ortModule.InferenceSession.create(mouseResolved.buffer, { executionProviders: ['cpu'] }),
        ortModule.InferenceSession.create(keyResolved.buffer, { executionProviders: ['cpu'] }),
      ]);

      mouseSession = mSess;
      keySession = kSess;
      return true;
    } catch (err) {
      console.warn('[ONNX Engine] Native session initialization fallback to TS math engine:', err);
      modelSourceType = 'fallback';
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

// 1. Mouse Kinematics Feature Extraction
export function extractMouseFeatures(events: MouseEventData[]): ExtractedMouseFeatures {
  if (!events || events.length < 3) {
    return {
      mean_vel: 380.0,
      std_vel: 600.0,
      max_vel: 2400.0,
      mean_acc: 240.0,
      std_acc: 1800.0,
      idle_pct: 0.15,
    };
  }

  const dtList: number[] = [];
  const distList: number[] = [];
  const velList: number[] = [];

  for (let i = 1; i < events.length; i++) {
    const dt = Math.max(1, events[i].timestamp - events[i - 1].timestamp);
    const dx = events[i].x - events[i - 1].x;
    const dy = events[i].y - events[i - 1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    dtList.push(dt);
    distList.push(dist);
    velList.push((dist / dt) * 1000);
  }

  const accList: number[] = [];
  for (let i = 1; i < velList.length; i++) {
    const dt = dtList[i];
    accList.push(Math.abs(velList[i] - velList[i - 1]) / (dt / 1000));
  }

  const mean_vel = velList.reduce((a, b) => a + b, 0) / velList.length;
  const var_vel = velList.reduce((a, b) => a + Math.pow(b - mean_vel, 2), 0) / velList.length;
  const std_vel = Math.sqrt(var_vel);
  const max_vel = Math.max(...velList);

  const mean_acc = accList.length > 0 ? accList.reduce((a, b) => a + b, 0) / accList.length : 200.0;
  const var_acc =
    accList.length > 0
      ? accList.reduce((a, b) => a + Math.pow(b - mean_acc, 2), 0) / accList.length
      : 1000.0;
  const std_acc = Math.sqrt(var_acc);

  let idleTime = 0;
  const totalTime = dtList.reduce((a, b) => a + b, 0);
  for (let i = 0; i < distList.length; i++) {
    if (distList[i] < 2) idleTime += dtList[i];
  }
  const idle_pct = totalTime > 0 ? Math.min(1.0, idleTime / totalTime) : 0.1;

  return {
    mean_vel: Number(mean_vel.toFixed(2)),
    std_vel: Number(std_vel.toFixed(2)),
    max_vel: Number(max_vel.toFixed(2)),
    mean_acc: Number(mean_acc.toFixed(2)),
    std_acc: Number(std_acc.toFixed(2)),
    idle_pct: Number(idle_pct.toFixed(4)),
  };
}

// 2. Keystroke Dynamics Feature Extraction (Filters out cognitive thinking pauses > 850ms!)
export function extractKeystrokeFeatures(events: KeyEventData[]): ExtractedKeystrokeFeatures {
  if (!events || events.length < 3) {
    return {
      mean_hold: 0.102,
      std_hold: 0.018,
      mean_dd: 0.245,
      std_dd: 0.055,
      mean_ud: 0.143,
      std_ud: 0.052,
      hold_to_dd_ratio: 0.416,
      rollover_rate: 0.05,
      clean_digraph_count: 0,
    };
  }

  const holdTimes: number[] = [];
  const downDownTimes: number[] = [];
  const upDownTimes: number[] = [];

  const keydownMap = new Map<string, number>();
  let lastKeydownTime: number | null = null;
  let lastKeyupTime: number | null = null;

  for (const ev of events) {
    if (ev.type === 'keydown') {
      keydownMap.set(ev.key, ev.timestamp);

      if (lastKeydownTime !== null) {
        const dd = (ev.timestamp - lastKeydownTime) / 1000;
        if (dd > 0.002 && dd <= 0.85) {
          downDownTimes.push(dd);
        }
      }
      lastKeydownTime = ev.timestamp;

      if (lastKeyupTime !== null) {
        const ud = (ev.timestamp - lastKeyupTime) / 1000;
        if (ud >= -0.25 && ud <= 0.75) {
          upDownTimes.push(ud);
        }
      }
    } else if (ev.type === 'keyup') {
      const downTime = keydownMap.get(ev.key);
      if (downTime !== undefined) {
        const ht = (ev.timestamp - downTime) / 1000;
        if (ht > 0.002 && ht <= 0.5) {
          holdTimes.push(ht);
        }
        keydownMap.delete(ev.key);
      }
      lastKeyupTime = ev.timestamp;
    }
  }

  const calcRobustMeanStd = (arr: number[], defaultMean: number, defaultStd: number) => {
    if (arr.length === 0) return { mean: defaultMean, std: defaultStd };
    let filtered = [...arr].sort((a, b) => a - b);
    if (filtered.length >= 6) {
      filtered = filtered.slice(1, filtered.length - 1);
    }
    const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    const variance =
      filtered.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / filtered.length;
    return {
      mean: Number(mean.toFixed(4)),
      std: Number(Math.max(0.006, Math.sqrt(variance)).toFixed(4)),
    };
  };

  const ht = calcRobustMeanStd(holdTimes, 0.102, 0.018);
  const dd = calcRobustMeanStd(downDownTimes, 0.245, 0.055);
  const ud = calcRobustMeanStd(upDownTimes, 0.143, 0.052);

  const holdToDdRatio = Number((ht.mean / Math.max(0.05, dd.mean)).toFixed(4));
  const rollovers = upDownTimes.filter((v) => v < 0).length;
  const rolloverRate =
    upDownTimes.length > 0 ? Number((rollovers / upDownTimes.length).toFixed(4)) : 0;

  return {
    mean_hold: ht.mean,
    std_hold: ht.std,
    mean_dd: dd.mean,
    std_dd: dd.std,
    mean_ud: ud.mean,
    std_ud: ud.std,
    hold_to_dd_ratio: holdToDdRatio,
    rollover_rate: rolloverRate,
    clean_digraph_count: Math.max(holdTimes.length, downDownTimes.length),
  };
}

// 3. Modality-Gated ONNX Model Inference Engine
export async function evaluateTelemetry(
  keys: KeyEventData[],
  mouse: MouseEventData[],
  requestOrigin?: string
): Promise<ModelInferenceResult> {
  const startTime = Date.now();

  const keyFeatures = extractKeystrokeFeatures(keys);
  const mouseFeatures = extractMouseFeatures(mouse);

  const keystrokeActive =
    Array.isArray(keys) && keys.length >= 6 && (keyFeatures.clean_digraph_count ?? 0) >= 3;
  const mouseActive = Array.isArray(mouse) && mouse.length >= 4;

  const isRoboticMouse =
    mouseActive &&
    (mouseFeatures.max_vel > 25000 ||
      (mouseFeatures.mean_vel > 12000 && mouseFeatures.std_vel < 50) ||
      mouseFeatures.std_acc < 2);

  const isRoboticKeystroke =
    keystrokeActive &&
    (keyFeatures.mean_hold < 0.012 || (keyFeatures.mean_dd < 0.025 && keyFeatures.std_hold < 0.005));

  const isReady = await getOrInitSessions(requestOrigin);

  if (isReady && ortModule && mouseSession && keySession) {
    try {
      let mouseImposterProb = 0.06;
      let mouseHumanProb = 0.94;
      let mouseLabel = 0;

      if (mouseActive) {
        const mouseArray = Float32Array.from([
          mouseFeatures.mean_vel,
          mouseFeatures.std_vel,
          mouseFeatures.max_vel,
          mouseFeatures.mean_acc,
          mouseFeatures.std_acc,
          mouseFeatures.idle_pct,
        ]);
        const mouseTensor = new ortModule.Tensor('float32', mouseArray, [1, 6]);
        const mouseOutput = await mouseSession.run({ float_input: mouseTensor });

        const rawMouseImposter = Number(mouseOutput.probabilities.data[1]);
        mouseImposterProb = isRoboticMouse
          ? Math.max(0.92, rawMouseImposter)
          : Math.min(0.18, rawMouseImposter * 0.22);
        mouseHumanProb = 1 - mouseImposterProb;
        mouseLabel = mouseImposterProb > 0.5 ? 1 : 0;
      }

      let keyImposterProb = 0.04;
      let keyHumanProb = 0.96;
      let keyLabel = 0;

      if (keystrokeActive) {
        const keyArray = Float32Array.from([
          keyFeatures.mean_hold,
          keyFeatures.std_hold,
          keyFeatures.mean_dd,
          keyFeatures.std_dd,
          keyFeatures.mean_ud,
          keyFeatures.std_ud,
        ]);
        const keyTensor = new ortModule.Tensor('float32', keyArray, [1, 6]);
        const keyOutput = await keySession.run({ float_input: keyTensor });

        const rawKeyImposter = Number(keyOutput.probabilities.data[1]);
        keyImposterProb = isRoboticKeystroke
          ? Math.max(0.95, rawKeyImposter)
          : Math.min(0.25, rawKeyImposter * 0.45);
        keyHumanProb = 1 - keyImposterProb;
        keyLabel = keyImposterProb > 0.5 ? 1 : 0;
      }

      let fusedImposterProb = 0.05;
      if (keystrokeActive && mouseActive) {
        fusedImposterProb = isRoboticMouse
          ? Math.max(keyImposterProb, mouseImposterProb)
          : keyImposterProb * 0.85 + mouseImposterProb * 0.15;
      } else if (keystrokeActive) {
        fusedImposterProb = keyImposterProb;
      } else if (mouseActive) {
        fusedImposterProb = mouseImposterProb;
      }

      const riskScore = Math.max(0, Math.min(100, Math.round(fusedImposterProb * 100)));

      return {
        engine: `ONNX Edge Runtime (${modelSourceType === 'edge-cdn' ? 'Edge CDN' : 'Local'})`,
        model_source: modelSourceType,
        inference_time_ms: Date.now() - startTime,
        risk_score: riskScore,
        active_modalities: {
          keystroke_active: keystrokeActive,
          mouse_active: mouseActive,
        },
        mouse: {
          features: mouseFeatures,
          label: mouseLabel,
          imposter_prob: Number(mouseImposterProb.toFixed(4)),
          human_prob: Number(mouseHumanProb.toFixed(4)),
        },
        keystroke: {
          features: keyFeatures,
          label: keyLabel,
          imposter_prob: Number(keyImposterProb.toFixed(4)),
          human_prob: Number(keyHumanProb.toFixed(4)),
        },
      };
    } catch (onnxRunErr) {
      console.warn('[ONNX Engine] Execution warning, using math fallback:', onnxRunErr);
    }
  }

  const keyImposter = isRoboticKeystroke ? 0.95 : 0.05;
  const mouseImposter = isRoboticMouse ? 0.92 : 0.06;
  const fusedRisk = Math.round(Math.max(keyImposter, mouseImposter) * 100);

  return {
    engine: 'Mathematical Fallback Engine',
    model_source: 'fallback',
    inference_time_ms: Date.now() - startTime,
    risk_score: fusedRisk,
    active_modalities: {
      keystroke_active: keystrokeActive,
      mouse_active: mouseActive,
    },
    mouse: {
      features: mouseFeatures,
      label: isRoboticMouse ? 1 : 0,
      imposter_prob: mouseImposter,
      human_prob: 1 - mouseImposter,
    },
    keystroke: {
      features: keyFeatures,
      label: isRoboticKeystroke ? 1 : 0,
      imposter_prob: keyImposter,
      human_prob: 1 - keyImposter,
    },
  };
}
