import path from 'path';
import fs from 'fs';

function resolveModelPath(filename: string): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'models', filename),
    path.join(cwd, 'Frontend', 'nexus-id', 'public', 'models', filename),
    path.join(__dirname, '..', '..', 'public', 'models', filename),
    path.join(__dirname, '..', 'public', 'models', filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

// Types for raw telemetry events
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
}

export interface ModelInferenceResult {
  engine: string;
  inference_time_ms: number;
  risk_score: number;
  mouse: {
    features: ExtractedMouseFeatures;
    label: number; // 0 = Human, 1 = Bot/Anomaly
    imposter_prob: number;
    human_prob: number;
  };
  keystroke: {
    features: ExtractedKeystrokeFeatures;
    label: number; // 0 = Human, 1 = Bot/Anomaly
    imposter_prob: number;
    human_prob: number;
  };
}

// Global cached singletons for ONNX Inference Sessions
let ortModule: any = null;
let mouseSession: any = null;
let keySession: any = null;
let initPromise: Promise<boolean> | null = null;

async function getOrInitSessions(): Promise<boolean> {
  if (mouseSession && keySession) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!ortModule) {
        ortModule = await import('onnxruntime-node');
      }

      const mouseModelPath = resolveModelPath('mouse.onnx');
      const keyModelPath = resolveModelPath('keystroke.onnx');

      const [mSess, kSess] = await Promise.all([
        ortModule.InferenceSession.create(mouseModelPath, { executionProviders: ['cpu'] }),
        ortModule.InferenceSession.create(keyModelPath, { executionProviders: ['cpu'] }),
      ]);

      mouseSession = mSess;
      keySession = kSess;
      return true;
    } catch (err) {
      console.warn('[ONNX Engine] Native session initialization fallback to TS math engine:', err);
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
    // Nominal human baseline if insufficient events
    return {
      mean_vel: 380.0,
      std_vel: 600.0,
      max_vel: 3500.0,
      mean_acc: 240.0,
      std_acc: 3500.0,
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
    velList.push((dist / dt) * 1000); // pixels per second
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

  // Idle percentage: time when distance == 0
  let idleTime = 0;
  let totalTime = dtList.reduce((a, b) => a + b, 0);
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

// 2. Keystroke Dynamics Feature Extraction
export function extractKeystrokeFeatures(events: KeyEventData[]): ExtractedKeystrokeFeatures {
  if (!events || events.length < 3) {
    // Nominal human typing values (seconds) from benchmark dataset
    return {
      mean_hold: 0.115,
      std_hold: 0.025,
      mean_dd: 0.450,
      std_dd: 0.350,
      mean_ud: 0.330,
      std_ud: 0.350,
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
        const dd = (ev.timestamp - lastKeydownTime) / 1000; // in seconds
        if (dd > 0 && dd < 5) downDownTimes.push(dd);
      }
      lastKeydownTime = ev.timestamp;

      if (lastKeyupTime !== null) {
        const ud = (ev.timestamp - lastKeyupTime) / 1000;
        if (ud > -0.5 && ud < 5) upDownTimes.push(ud);
      }
    } else if (ev.type === 'keyup') {
      const downTime = keydownMap.get(ev.key);
      if (downTime !== undefined) {
        const ht = (ev.timestamp - downTime) / 1000;
        if (ht > 0 && ht < 2) holdTimes.push(ht);
        keydownMap.delete(ev.key);
      }
      lastKeyupTime = ev.timestamp;
    }
  }

  const calcMeanStd = (arr: number[], defaultMean: number, defaultStd: number) => {
    if (arr.length === 0) return { mean: defaultMean, std: defaultStd };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return { mean: Number(mean.toFixed(4)), std: Number(Math.sqrt(variance).toFixed(4)) };
  };

  const ht = calcMeanStd(holdTimes, 0.115, 0.025);
  const dd = calcMeanStd(downDownTimes, 0.450, 0.350);
  const ud = calcMeanStd(upDownTimes, 0.330, 0.350);

  return {
    mean_hold: ht.mean,
    std_hold: ht.std,
    mean_dd: dd.mean,
    std_dd: dd.std,
    mean_ud: ud.mean,
    std_ud: ud.std,
  };
}

// 3. Multimodal ONNX Model Inference Engine
export async function evaluateTelemetry(
  keys: KeyEventData[],
  mouse: MouseEventData[]
): Promise<ModelInferenceResult> {
  const startTime = Date.now();

  const mouseFeatures = extractMouseFeatures(mouse);
  const keyFeatures = extractKeystrokeFeatures(keys);

  const isReady = await getOrInitSessions();

  if (isReady && ortModule && mouseSession && keySession) {
    try {
      // 1. Mouse Inference
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

      const mouseLabel = Number(mouseOutput.label.data[0]);
      const mouseHumanProb = Number(mouseOutput.probabilities.data[0]);
      const mouseImposterProb = Number(mouseOutput.probabilities.data[1]);

      // 2. Keystroke Inference
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

      const keyLabel = Number(keyOutput.label.data[0]);
      const keyHumanProb = Number(keyOutput.probabilities.data[0]);
      const keyImposterProb = Number(keyOutput.probabilities.data[1]);

      // Multimodal Fusion: Weighted combination of imposter probabilities
      const fusedImposterProb = keyImposterProb * 0.6 + mouseImposterProb * 0.4;
      const riskScore = Math.max(0, Math.min(100, Math.round(fusedImposterProb * 100)));

      return {
        engine: 'ONNX Runtime (Dual Random Forest)',
        inference_time_ms: Date.now() - startTime,
        risk_score: riskScore,
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

  // Graceful Fallback (Pure mathematical heuristic matching model boundary)
  const isKeyAnomaly = keyFeatures.mean_hold < 0.02 || keyFeatures.std_hold < 0.003;
  const isMouseAnomaly = mouseFeatures.max_vel > 20000 || mouseFeatures.std_acc < 5;

  const keyImposter = isKeyAnomaly ? 0.95 : 0.05;
  const mouseImposter = isMouseAnomaly ? 0.85 : 0.15;
  const fusedRisk = Math.round((keyImposter * 0.6 + mouseImposter * 0.4) * 100);

  return {
    engine: 'Mathematical Fallback Engine',
    inference_time_ms: Date.now() - startTime,
    risk_score: fusedRisk,
    mouse: {
      features: mouseFeatures,
      label: isMouseAnomaly ? 1 : 0,
      imposter_prob: mouseImposter,
      human_prob: 1 - mouseImposter,
    },
    keystroke: {
      features: keyFeatures,
      label: isKeyAnomaly ? 1 : 0,
      imposter_prob: keyImposter,
      human_prob: 1 - keyImposter,
    },
  };
}
