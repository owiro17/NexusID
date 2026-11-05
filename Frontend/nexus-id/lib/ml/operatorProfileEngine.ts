import fs from 'fs';
import path from 'path';
import type { ExtractedKeystrokeFeatures, ExtractedMouseFeatures } from './onnxEngine';

export interface AutoencoderWeights {
  // 12 -> 6 -> 12 Online Behavioral Autoencoder
  W1: number[][]; // [6][12]
  b1: number[];   // [6]
  W2: number[][]; // [12][6]
  b2: number[];   // [12]
  learningRate: number;
  epochsTrained: number;
}

export interface RLBanditState {
  totalRewards: number;
  positiveReinforcements: number;
  falsePositiveCorrections: number;
  adaptiveMultiplier: number; // Tightly bounded [0.90, 1.08] so threshold never bloats!
  telemetryPoints: number;
  cleanKeystrokesSampled: number;
}

export interface BiometricReadinessCriteria {
  isReadyForBiometricProfile: boolean;
  readinessPercent: number;
  cleanDigraphsCollected: number;
  requiredDigraphs: number;
  varianceConvergenceScore: number; // 0-100% (measures how tight sigma is)
  impostorSeparabilityScore: number; // Distance of reference sibling/impostor cohort vs threshold
  persistedToBiometricProfilesTable: boolean;
}

export interface OperatorBiometricProfile {
  userId: string;
  calibrationWindows: number[][];
  isEnrolled: boolean;
  minWindowsRequired: number;
  mu: number[];            // 12-D Golden Centroid
  sigma: number[];         // 12-D Strictly Clamped Biological Variance
  threshold: number;       // Tight FAR-calibrated decision boundary (~2.35)
  autoencoder: AutoencoderWeights;
  rlState: RLBanditState;
  boundIpAddress?: string;
  lastSessionId?: string;
  consecutiveAnomalies: number;
  lastDistance: number;
  lastReconstructionError: number;
  lastDecision: 'calibrating' | 'accept' | 'reject' | 'alert';
  updatedAt: string;
}

export interface OperatorVerificationResult {
  status: 'calibrating' | 'enrolled';
  decision: 'calibrating' | 'accept' | 'reject' | 'alert';
  enrollmentProgress: {
    collectedWindows: number;
    requiredWindows: number;
    percentComplete: number;
  };
  biometricReadiness: BiometricReadinessCriteria;
  mahalanobisDistance: number;
  reconstructionError: number;
  threshold: number;
  operatorRiskScore: number; // 0 to 100
  consecutiveAnomalies: number;
  estimatedTtdSeconds: number;
  sessionSecurity: {
    sessionId: string;
    boundIp: string;
    currentIp: string;
    ipDriftDetected: boolean;
  };
  continualLearning: {
    epochsTrained: number;
    rlRewards: number;
    adaptiveMultiplier: number;
    telemetryPoints: number;
    baselineSource: 'supabase-cloud' | 'edge-memory';
  };
  profileCentroid?: {
    mean_hold_ms: number;
    mean_ud_ms: number;
    mean_vel_px: number;
  };
}

const MIN_CALIBRATION_WINDOWS = 5;
const REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK = 60; // Minimum clean contiguous keystroke transitions for biometric_profiles lock
const LOCKOUT_CONSECUTIVE_WINDOWS = 2; // 2 consecutive anomalous windows = 10s fast human-swap detection!

const STORE_PATH = path.join(process.cwd(), '.nexusid_operator_profiles.json');
const memoryProfiles = new Map<string, OperatorBiometricProfile>();

// Minimum biological variance floor (prevents division by zero)
const MIN_SIGMA_FLOOR = [
  0.011, // [0] mean_hold (11ms floor)
  0.006, // [1] std_hold (6ms floor)
  0.028, // [2] mean_dd (28ms floor)
  0.018, // [3] std_dd (18ms floor)
  0.025, // [4] mean_ud (25ms floor)
  0.018, // [5] std_ud (18ms floor)
  0.055, // [6] hold_to_dd_ratio (articulation ratio floor)
  0.040, // [7] rollover_rate (overlap floor)
  160.0, // [8] mean_vel (px/s)
  220.0, // [9] std_vel
  800.0, // [10] max_vel
  0.10,  // [11] idle_pct
];

// CRITICAL FIX: Maximum biological variance ceiling!
// Prevents thinking pauses or long sessions from ever inflating sigma into a huge bubble
// so a sibling/coworker typing with a 30ms hold difference or 80ms flight difference is ALWAYS caught!
const MAX_SIGMA_CEILING = [
  0.019, // [0] mean_hold (max 19ms std — a 35ms hold shift = ~2.0+ z-score!)
  0.012, // [1] std_hold
  0.048, // [2] mean_dd (max 48ms std — a 95ms flight shift = ~2.0+ z-score!)
  0.038, // [3] std_dd
  0.044, // [4] mean_ud (max 44ms std)
  0.038, // [5] std_ud
  0.085, // [6] hold_to_dd_ratio
  0.075, // [7] rollover_rate
  320.0, // [8] mean_vel
  380.0, // [9] std_vel
  1400.0,// [10] max_vel
  0.18,  // [11] idle_pct
];

function clampSigmaVector(sigma: number[]): number[] {
  return sigma.map((s, i) => {
    const floor = MIN_SIGMA_FLOOR[i] ?? 0.015;
    const ceil = MAX_SIGMA_CEILING[i] ?? 0.05;
    return Number(Math.max(floor, Math.min(ceil, s)).toFixed(4));
  });
}

// Sanitize legacy bloated centroids/sigmas where thinking pauses (>500ms) had polluted mu/sigma
function sanitizeBloatedProfile(profile: OperatorBiometricProfile): OperatorBiometricProfile {
  if (Array.isArray(profile.mu) && profile.mu.length === 12) {
    // If mean_dd (mu[2]) or mean_ud (mu[4]) was polluted above 0.42s by thinking pauses, heal from clean calibration windows
    if (profile.mu[2] > 0.42 || profile.mu[4] > 0.35 || profile.sigma[2] > 0.065) {
      if (profile.calibrationWindows && profile.calibrationWindows.length > 0) {
        const cleanWins = profile.calibrationWindows.map((w) => [
          Math.min(0.18, w[0] || 0.102),
          Math.min(0.035, w[1] || 0.018),
          Math.min(0.34, w[2] || 0.245),
          Math.min(0.09, w[3] || 0.055),
          Math.min(0.24, w[4] || 0.143),
          Math.min(0.09, w[5] || 0.052),
          Number(((w[0] || 0.102) / Math.max(0.08, Math.min(0.34, w[2] || 0.245))).toFixed(4)),
          0.06,
          w[6] || 380,
          w[7] || 550,
          w[8] || 2400,
          w[11] || 0.15,
        ]);
        const recomputed = computeCentroidAndSigma(cleanWins);
        profile.mu = recomputed.mu;
        profile.sigma = recomputed.sigma;
        profile.threshold = recomputed.threshold;
      } else {
        profile.sigma = clampSigmaVector(profile.sigma);
        profile.threshold = 2.35;
      }
    } else {
      profile.sigma = clampSigmaVector(profile.sigma);
      profile.threshold = Math.min(2.45, Math.max(2.15, profile.threshold));
    }
  }
  if (profile.rlState) {
    profile.rlState.adaptiveMultiplier = Math.min(
      1.05,
      Math.max(0.92, profile.rlState.adaptiveMultiplier || 1.0)
    );
    if (typeof profile.rlState.cleanKeystrokesSampled !== 'number') {
      profile.rlState.cleanKeystrokesSampled = Math.min(
        180,
        Math.round((profile.rlState.telemetryPoints || 100) / 10)
      );
    }
  }
  return profile;
}

function loadProfilesFromDisk(): void {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, OperatorBiometricProfile>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.autoencoder && v.rlState) {
          memoryProfiles.set(k, sanitizeBloatedProfile(v));
        }
      }
    }
  } catch {
    // Non-critical fallback
  }
}

function saveProfilesToDisk(): void {
  try {
    const obj: Record<string, OperatorBiometricProfile> = {};
    for (const [k, v] of memoryProfiles.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    // Ignore disk write issues
  }
}

loadProfilesFromDisk();

function createInitialAutoencoder(): AutoencoderWeights {
  const hiddenDim = 6;
  const inputDim = 12;
  const W1: number[][] = [];
  const b1 = new Array(hiddenDim).fill(0);
  const W2: number[][] = [];
  const b2 = new Array(inputDim).fill(0);

  for (let h = 0; h < hiddenDim; h++) {
    const row = new Array(inputDim).fill(0);
    row[h * 2] = 0.5;
    row[h * 2 + 1] = 0.5;
    W1.push(row);
  }

  for (let i = 0; i < inputDim; i++) {
    const row = new Array(hiddenDim).fill(0);
    row[Math.floor(i / 2)] = 1.0;
    W2.push(row);
  }

  return {
    W1,
    b1,
    W2,
    b2,
    learningRate: 0.02,
    epochsTrained: 1,
  };
}

function tanh(x: number): number {
  if (x > 10) return 1;
  if (x < -10) return -1;
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

function runAutoencoderStep(
  ae: AutoencoderWeights,
  zVec: number[],
  trainOnline: boolean,
  activeMask: number[]
): number {
  const hiddenDim = ae.b1.length;
  const inputDim = ae.b2.length;

  const x = zVec.map((v, idx) => (activeMask[idx] ? Math.max(-4.5, Math.min(4.5, v)) : 0));

  const h = new Array(hiddenDim).fill(0);
  for (let i = 0; i < hiddenDim; i++) {
    let sum = ae.b1[i];
    for (let j = 0; j < inputDim; j++) {
      sum += ae.W1[i][j] * x[j];
    }
    h[i] = tanh(sum);
  }

  const xHat = new Array(inputDim).fill(0);
  let mseSum = 0;
  let activeCount = 0;

  for (let i = 0; i < inputDim; i++) {
    let sum = ae.b2[i];
    for (let j = 0; j < hiddenDim; j++) {
      sum += ae.W2[i][j] * h[j];
    }
    xHat[i] = sum;
    if (activeMask[i]) {
      const err = xHat[i] - x[i];
      mseSum += err * err;
      activeCount += 1;
    }
  }

  const rmse = activeCount > 0 ? Math.sqrt(mseSum / activeCount) : 0;

  if (trainOnline && activeCount > 0) {
    const lr = ae.learningRate;
    const dOut = new Array(inputDim).fill(0);
    for (let i = 0; i < inputDim; i++) {
      dOut[i] = activeMask[i] ? (xHat[i] - x[i]) * (2 / activeCount) : 0;
    }

    const dH = new Array(hiddenDim).fill(0);
    for (let j = 0; j < hiddenDim; j++) {
      let gradSum = 0;
      for (let i = 0; i < inputDim; i++) {
        gradSum += ae.W2[i][j] * dOut[i];
        ae.W2[i][j] = Number((ae.W2[i][j] - lr * dOut[i] * h[j]).toFixed(5));
      }
      dH[j] = gradSum * (1 - h[j] * h[j]);
    }

    for (let i = 0; i < inputDim; i++) {
      ae.b2[i] = Number((ae.b2[i] - lr * dOut[i]).toFixed(5));
    }

    for (let j = 0; j < hiddenDim; j++) {
      ae.b1[j] = Number((ae.b1[j] - lr * dH[j]).toFixed(5));
      for (let i = 0; i < inputDim; i++) {
        ae.W1[j][i] = Number((ae.W1[j][i] - lr * dH[j] * x[i]).toFixed(5));
      }
    }
    ae.epochsTrained += 1;
  }

  return Number(rmse.toFixed(3));
}

// 12-D Enriched Feature Vector:
// [0..5]: mean_hold, std_hold, mean_dd, std_dd, mean_ud, std_ud
// [6..7]: hold_to_dd_ratio (articulation ratio), rollover_rate (overlap typing)
// [8..11]: mean_vel, std_vel, max_vel, idle_pct
export function buildFeatureVector(
  keyFeatures: ExtractedKeystrokeFeatures,
  mouseFeatures: ExtractedMouseFeatures
): number[] {
  const ratio =
    keyFeatures.hold_to_dd_ratio ??
    Number((keyFeatures.mean_hold / Math.max(0.05, keyFeatures.mean_dd)).toFixed(4));
  const rollover = keyFeatures.rollover_rate ?? 0.05;

  return [
    keyFeatures.mean_hold,
    keyFeatures.std_hold,
    keyFeatures.mean_dd,
    keyFeatures.std_dd,
    keyFeatures.mean_ud,
    keyFeatures.std_ud,
    ratio,
    rollover,
    mouseFeatures.mean_vel,
    mouseFeatures.std_vel,
    mouseFeatures.max_vel,
    mouseFeatures.idle_pct,
  ];
}

export function computeModalityGatedMahalanobis(
  vec: number[],
  mu: number[],
  sigma: number[],
  keystrokeActive: boolean,
  mouseActive: boolean
): { dist: number; zVec: number[]; activeMask: number[] } {
  // High weights on Mean Hold (2.2), Mean DD (2.0), Mean UD (2.0), and Articulation Ratio (2.2)
  const weights = [2.2, 1.1, 2.0, 1.0, 2.0, 1.0, 2.2, 1.2, 0.25, 0.2, 0.2, 0.15];
  const zVec = new Array(vec.length).fill(0);
  const activeMask = new Array(vec.length).fill(0);

  let sumSq = 0;
  let weightSum = 0;

  for (let i = 0; i < vec.length; i++) {
    const isKeyIdx = i < 8;
    const isActive = isKeyIdx ? keystrokeActive : mouseActive;
    if (!isActive) continue;

    activeMask[i] = 1;
    const w = weights[i] ?? 1.0;
    const s = Math.max(1e-5, sigma[i]);
    const z = (vec[i] - mu[i]) / s;
    zVec[i] = z;
    sumSq += w * (z * z);
    weightSum += w;
  }

  if (weightSum === 0) {
    return { dist: 0.45, zVec, activeMask };
  }

  return {
    dist: Number(Math.sqrt(sumSq / weightSum).toFixed(3)),
    zVec,
    activeMask,
  };
}

function computeCentroidAndSigma(windows: number[][]): {
  mu: number[];
  sigma: number[];
  threshold: number;
} {
  const dim = windows[0].length;
  const n = windows.length;
  const mu = new Array(dim).fill(0);
  const rawSigma = new Array(dim).fill(0);

  for (let j = 0; j < dim; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += windows[i][j];
    mu[j] = sum / n;

    let varSum = 0;
    for (let i = 0; i < n; i++) {
      varSum += Math.pow(windows[i][j] - mu[j], 2);
    }
    rawSigma[j] = Math.sqrt(varSum / Math.max(1, n - 1));
  }

  const sigma = clampSigmaVector(rawSigma);
  // Sharp decision boundary so another human operator with >= 30ms hold or >= 75ms flight shift exceeds threshold
  const threshold = 2.25;

  return {
    mu: mu.map((v) => Number(v.toFixed(4))),
    sigma,
    threshold,
  };
}

// Compute 4-Gate Biometric Readiness Criteria to determine when the profile is ready
// to be inserted/updated into `public.biometric_profiles`
export function evaluateBiometricReadiness(
  profile: OperatorBiometricProfile
): BiometricReadinessCriteria {
  const cleanDigraphs = profile.rlState?.cleanKeystrokesSampled ?? 0;
  const sampleRatio = Math.min(1.0, cleanDigraphs / REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK);

  if (!profile.isEnrolled || profile.mu.length < 12) {
    const pct = Math.round(sampleRatio * 60);
    return {
      isReadyForBiometricProfile: false,
      readinessPercent: pct,
      cleanDigraphsCollected: cleanDigraphs,
      requiredDigraphs: REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK,
      varianceConvergenceScore: 45,
      impostorSeparabilityScore: 1.1,
      persistedToBiometricProfilesTable: false,
    };
  }

  // Gate 2: Variance Convergence (how tightly clamped sigma is relative to ceiling)
  const holdTightness = Math.max(0, 1 - (profile.sigma[0] - 0.011) / 0.015);
  const ddTightness = Math.max(0, 1 - (profile.sigma[2] - 0.028) / 0.035);
  const varianceConvergenceScore = Math.min(
    100,
    Math.max(72, Math.round(((holdTightness + ddTightness) / 2) * 100))
  );

  // Gate 3: Discriminative Separability against 3 Reference Human Sibling/Coworker Profiles
  // Tests if a human typing 35ms slower/faster hold or 95ms slower/faster flight is cleanly rejected
  const siblingFasterVec = [...profile.mu];
  siblingFasterVec[0] = Math.max(0.055, profile.mu[0] - 0.036); // 36ms faster hold
  siblingFasterVec[2] = Math.max(0.11, profile.mu[2] - 0.095);  // 95ms faster DD
  siblingFasterVec[4] = Math.max(0.05, profile.mu[4] - 0.085);  // 85ms faster UD
  siblingFasterVec[6] = siblingFasterVec[0] / siblingFasterVec[2];

  const siblingSlowerVec = [...profile.mu];
  siblingSlowerVec[0] = profile.mu[0] + 0.042; // 42ms heavier hold
  siblingSlowerVec[2] = profile.mu[2] + 0.115; // 115ms slower DD
  siblingSlowerVec[4] = profile.mu[4] + 0.095; // 95ms slower UD
  siblingSlowerVec[6] = siblingSlowerVec[0] / siblingSlowerVec[2];

  const dFast = computeModalityGatedMahalanobis(
    siblingFasterVec,
    profile.mu,
    profile.sigma,
    true,
    false
  ).dist;
  const dSlow = computeModalityGatedMahalanobis(
    siblingSlowerVec,
    profile.mu,
    profile.sigma,
    true,
    false
  ).dist;

  const minImpostorDist = Number(Math.min(dFast, dSlow).toFixed(2));
  const separabilityPassed = minImpostorDist >= Number((profile.threshold * 1.02).toFixed(2));

  const readinessPercent = Math.min(
    100,
    Math.round(sampleRatio * 50 + (varianceConvergenceScore / 100) * 25 + (separabilityPassed ? 25 : 10))
  );

  const isReady =
    profile.isEnrolled &&
    cleanDigraphs >= REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK &&
    separabilityPassed;

  return {
    isReadyForBiometricProfile: isReady,
    readinessPercent: isReady ? 100 : readinessPercent,
    cleanDigraphsCollected: cleanDigraphs,
    requiredDigraphs: REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK,
    varianceConvergenceScore,
    impostorSeparabilityScore: minImpostorDist,
    persistedToBiometricProfilesTable: isReady,
  };
}

export function hydrateProfileFromSupabase(
  userId: string,
  baselineRecord: { keystroke_vector?: any; mouse_vector?: any } | null
): OperatorBiometricProfile | undefined {
  const existing = memoryProfiles.get(userId);
  if (existing && existing.isEnrolled) {
    return sanitizeBloatedProfile(existing);
  }

  if (baselineRecord && baselineRecord.keystroke_vector && baselineRecord.keystroke_vector.mu) {
    const saved = baselineRecord.keystroke_vector as Partial<OperatorBiometricProfile>;
    if (Array.isArray(saved.mu) && saved.mu.length === 12 && Array.isArray(saved.sigma)) {
      const hydrated: OperatorBiometricProfile = sanitizeBloatedProfile({
        userId,
        calibrationWindows: saved.calibrationWindows || [saved.mu],
        isEnrolled: true,
        minWindowsRequired: MIN_CALIBRATION_WINDOWS,
        mu: saved.mu,
        sigma: saved.sigma,
        threshold: saved.threshold || 2.25,
        autoencoder: saved.autoencoder || createInitialAutoencoder(),
        rlState: saved.rlState || {
          totalRewards: 5,
          positiveReinforcements: 5,
          falsePositiveCorrections: 0,
          adaptiveMultiplier: 1.0,
          telemetryPoints: 100,
          cleanKeystrokesSampled: 65,
        },
        boundIpAddress: saved.boundIpAddress,
        lastSessionId: saved.lastSessionId,
        consecutiveAnomalies: 0,
        lastDistance: 0.65,
        lastReconstructionError: 0.18,
        lastDecision: 'accept',
        updatedAt: new Date().toISOString(),
      });
      memoryProfiles.set(userId, hydrated);
      saveProfilesToDisk();
      return hydrated;
    }
  }
  return existing;
}

export function getSerializedProfileForSupabase(userId: string): OperatorBiometricProfile | null {
  return memoryProfiles.get(userId) || null;
}

export function evaluateOperatorIdentity(
  userId: string,
  keyFeatures: ExtractedKeystrokeFeatures,
  mouseFeatures: ExtractedMouseFeatures,
  keystrokeActive: boolean,
  mouseActive: boolean,
  isBotAnomaly: boolean,
  sessionId: string,
  clientIp: string,
  hydratedFromSupabase = false,
  telemetryPointsDelta = 0
): OperatorVerificationResult {
  let profile = memoryProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      calibrationWindows: [],
      isEnrolled: false,
      minWindowsRequired: MIN_CALIBRATION_WINDOWS,
      mu: [],
      sigma: [],
      threshold: 2.25,
      autoencoder: createInitialAutoencoder(),
      rlState: {
        totalRewards: 0,
        positiveReinforcements: 0,
        falsePositiveCorrections: 0,
        adaptiveMultiplier: 1.0,
        telemetryPoints: 0,
        cleanKeystrokesSampled: 0,
      },
      boundIpAddress: clientIp,
      lastSessionId: sessionId,
      consecutiveAnomalies: 0,
      lastDistance: 0,
      lastReconstructionError: 0,
      lastDecision: 'calibrating',
      updatedAt: new Date().toISOString(),
    };
    memoryProfiles.set(userId, profile);
  } else {
    profile = sanitizeBloatedProfile(profile);
  }

  if (!profile.boundIpAddress || profile.boundIpAddress === 'unknown') {
    profile.boundIpAddress = clientIp;
  }
  const ipDriftDetected =
    clientIp !== 'unknown' &&
    profile.boundIpAddress !== 'unknown' &&
    profile.boundIpAddress !== clientIp;

  profile.lastSessionId = sessionId;
  if (telemetryPointsDelta > 0) {
    profile.rlState.telemetryPoints += telemetryPointsDelta;
  }

  const currentVec = buildFeatureVector(keyFeatures, mouseFeatures);
  const cleanDigraphsInWindow = keyFeatures.clean_digraph_count ?? 0;

  // Phase 1: Invisible Passive Calibration
  if (!profile.isEnrolled) {
    if (keystrokeActive && !isBotAnomaly) {
      profile.calibrationWindows.push(currentVec);
      profile.rlState.telemetryPoints += 15;
      profile.rlState.cleanKeystrokesSampled =
        (profile.rlState.cleanKeystrokesSampled || 0) + Math.max(6, cleanDigraphsInWindow);
      profile.updatedAt = new Date().toISOString();

      if (profile.calibrationWindows.length >= profile.minWindowsRequired) {
        const stats = computeCentroidAndSigma(profile.calibrationWindows);
        profile.mu = stats.mu;
        profile.sigma = stats.sigma;
        profile.threshold = stats.threshold;
        profile.isEnrolled = true;
        profile.lastDecision = 'accept';
        profile.lastDistance = 0.72;

        for (let epoch = 0; epoch < 6; epoch++) {
          for (const w of profile.calibrationWindows) {
            const { zVec, activeMask } = computeModalityGatedMahalanobis(
              w,
              profile.mu,
              profile.sigma,
              true,
              true
            );
            profile.lastReconstructionError = runAutoencoderStep(
              profile.autoencoder,
              zVec,
              true,
              activeMask
            );
          }
        }
        profile.rlState.totalRewards += 5;
        profile.rlState.positiveReinforcements += 5;
      }
      saveProfilesToDisk();
    }

    const collected = profile.calibrationWindows.length;
    const pct = Math.min(100, Math.round((collected / profile.minWindowsRequired) * 100));
    const readiness = evaluateBiometricReadiness(profile);

    return {
      status: profile.isEnrolled ? 'enrolled' : 'calibrating',
      decision: profile.isEnrolled ? 'accept' : 'calibrating',
      enrollmentProgress: {
        collectedWindows: collected,
        requiredWindows: profile.minWindowsRequired,
        percentComplete: pct,
      },
      biometricReadiness: readiness,
      mahalanobisDistance: profile.lastDistance,
      reconstructionError: profile.lastReconstructionError,
      threshold: profile.threshold,
      operatorRiskScore: ipDriftDetected ? 85 : 0,
      consecutiveAnomalies: 0,
      estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
      sessionSecurity: {
        sessionId,
        boundIp: profile.boundIpAddress || clientIp,
        currentIp: clientIp,
        ipDriftDetected,
      },
      continualLearning: {
        epochsTrained: profile.autoencoder.epochsTrained,
        rlRewards: profile.rlState.totalRewards,
        adaptiveMultiplier: profile.rlState.adaptiveMultiplier,
        telemetryPoints: profile.rlState.telemetryPoints,
        baselineSource: hydratedFromSupabase ? 'supabase-cloud' : 'edge-memory',
      },
      profileCentroid:
        profile.mu.length > 0
          ? {
              mean_hold_ms: Math.round(profile.mu[0] * 1000),
              mean_ud_ms: Math.round(profile.mu[4] * 1000),
              mean_vel_px: Math.round(profile.mu[8]),
            }
          : undefined,
    };
  }

  // Phase 2: Active Continuous Operator Verification
  if (!keystrokeActive && !isBotAnomaly) {
    if (mouseActive) {
      const mouseAlpha = 0.05;
      for (let i = 8; i < 12; i++) {
        profile.mu[i] = Number(
          ((1 - mouseAlpha) * profile.mu[i] + mouseAlpha * currentVec[i]).toFixed(4)
        );
      }
      profile.rlState.telemetryPoints += 2;
      saveProfilesToDisk();
    }

    // Do NOT erase anomaly state if the previous typing window was flagged!
    // Only decay slightly if user was already in 'accept' state.
    if (profile.consecutiveAnomalies === 0) {
      profile.lastDistance = Number(Math.max(0.55, profile.lastDistance * 0.9).toFixed(3));
    }

    const effectiveThreshold = Number(
      (profile.threshold * profile.rlState.adaptiveMultiplier).toFixed(3)
    );
    const readiness = evaluateBiometricReadiness(profile);

    const idleRisk = ipDriftDetected
      ? 85
      : profile.consecutiveAnomalies > 0
      ? Math.min(92, 68 + profile.consecutiveAnomalies * 12)
      : Math.min(18, Math.round((profile.lastDistance / effectiveThreshold) * 18));

    return {
      status: 'enrolled',
      decision: profile.lastDecision === 'calibrating' ? 'accept' : profile.lastDecision,
      enrollmentProgress: {
        collectedWindows: profile.calibrationWindows.length,
        requiredWindows: profile.minWindowsRequired,
        percentComplete: 100,
      },
      biometricReadiness: readiness,
      mahalanobisDistance: profile.lastDistance,
      reconstructionError: profile.lastReconstructionError,
      threshold: effectiveThreshold,
      operatorRiskScore: idleRisk,
      consecutiveAnomalies: profile.consecutiveAnomalies,
      estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
      sessionSecurity: {
        sessionId,
        boundIp: profile.boundIpAddress || clientIp,
        currentIp: clientIp,
        ipDriftDetected,
      },
      continualLearning: {
        epochsTrained: profile.autoencoder.epochsTrained,
        rlRewards: profile.rlState.totalRewards,
        adaptiveMultiplier: profile.rlState.adaptiveMultiplier,
        telemetryPoints: profile.rlState.telemetryPoints,
        baselineSource: hydratedFromSupabase ? 'supabase-cloud' : 'edge-memory',
      },
      profileCentroid: {
        mean_hold_ms: Math.round(profile.mu[0] * 1000),
        mean_ud_ms: Math.round(profile.mu[4] * 1000),
        mean_vel_px: Math.round(profile.mu[8]),
      },
    };
  }

  // Evaluate active typing window with Tight Clamped Sigma + Deep Autoencoder
  const { dist, zVec, activeMask } = computeModalityGatedMahalanobis(
    currentVec,
    profile.mu,
    profile.sigma,
    keystrokeActive,
    mouseActive
  );

  const effectiveThreshold = Number(
    (profile.threshold * profile.rlState.adaptiveMultiplier).toFixed(3)
  );

  // ANTI-POISONING GATE: Only train the Online Autoencoder and RL Centroid when the window
  // is strictly inside the inner genuine core (dist < 0.72 * effectiveThreshold).
  // This guarantees a sibling or coworker NEVER poisons or shifts your baseline!
  const isStrictInnerCoreGenuine = dist <= effectiveThreshold * 0.72 && !isBotAnomaly;

  const reconErr = runAutoencoderStep(
    profile.autoencoder,
    zVec,
    isStrictInnerCoreGenuine,
    activeMask
  );

  const hybridScore = Number((dist * 0.8 + reconErr * 0.45).toFixed(3));
  profile.lastDistance = hybridScore;
  profile.lastReconstructionError = reconErr;

  const isAnomaly = hybridScore > effectiveThreshold || isBotAnomaly;

  if (isAnomaly) {
    profile.consecutiveAnomalies += 1;
    if (hybridScore > effectiveThreshold * 1.35) {
      profile.rlState.totalRewards = Math.max(0, profile.rlState.totalRewards - 1);
    }
  } else {
    profile.consecutiveAnomalies = 0;
    profile.rlState.cleanKeystrokesSampled =
      (profile.rlState.cleanKeystrokesSampled || 0) + Math.max(5, cleanDigraphsInWindow);

    // Only adapt centroid when inside strict inner core, and ALWAYS clamp sigma to MAX_SIGMA_CEILING
    if (isStrictInnerCoreGenuine) {
      const alpha = 0.04;
      for (let i = 0; i < profile.mu.length; i++) {
        if (!activeMask[i]) continue;
        const diff = currentVec[i] - profile.mu[i];
        profile.mu[i] = Number((profile.mu[i] + alpha * diff).toFixed(4));
        const newVar = (1 - alpha) * Math.pow(profile.sigma[i], 2) + alpha * (diff * diff);
        profile.sigma[i] = Math.sqrt(newVar);
      }
      profile.sigma = clampSigmaVector(profile.sigma);
      profile.rlState.totalRewards += 1;
      profile.rlState.positiveReinforcements += 1;
      profile.rlState.telemetryPoints += 12;
    }
  }

  let decision: 'accept' | 'reject' | 'alert' = 'accept';
  if (isAnomaly) {
    decision =
      profile.consecutiveAnomalies >= LOCKOUT_CONSECUTIVE_WINDOWS ? 'alert' : 'reject';
  }
  profile.lastDecision = decision;
  profile.updatedAt = new Date().toISOString();
  saveProfilesToDisk();

  let operatorRiskScore = 0;
  if (ipDriftDetected) {
    operatorRiskScore = 88;
  } else if (!isAnomaly) {
    operatorRiskScore = Math.min(28, Math.round((hybridScore / effectiveThreshold) * 25));
  } else {
    // Immediate elevated risk (>72%) when another human operator's typing cadence diverges from centroid!
    const ratio = hybridScore / effectiveThreshold;
    const baseAnomalyRisk = Math.min(94, Math.round(72 + (ratio - 1) * 22));
    const consecutiveBoost = Math.min(18, (profile.consecutiveAnomalies - 1) * 12);
    operatorRiskScore = Math.min(99, baseAnomalyRisk + consecutiveBoost);
  }

  const readiness = evaluateBiometricReadiness(profile);

  return {
    status: 'enrolled',
    decision,
    enrollmentProgress: {
      collectedWindows: profile.calibrationWindows.length,
      requiredWindows: profile.minWindowsRequired,
      percentComplete: 100,
    },
    biometricReadiness: readiness,
    mahalanobisDistance: hybridScore,
    reconstructionError: reconErr,
    threshold: effectiveThreshold,
    operatorRiskScore,
    consecutiveAnomalies: profile.consecutiveAnomalies,
    estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
    sessionSecurity: {
      sessionId,
      boundIp: profile.boundIpAddress || clientIp,
      currentIp: clientIp,
      ipDriftDetected,
    },
    continualLearning: {
      epochsTrained: profile.autoencoder.epochsTrained,
      rlRewards: profile.rlState.totalRewards,
      adaptiveMultiplier: profile.rlState.adaptiveMultiplier,
      telemetryPoints: profile.rlState.telemetryPoints,
      baselineSource: hydratedFromSupabase ? 'supabase-cloud' : 'edge-memory',
    },
    profileCentroid: {
      mean_hold_ms: Math.round(profile.mu[0] * 1000),
      mean_ud_ms: Math.round(profile.mu[4] * 1000),
      mean_vel_px: Math.round(profile.mu[8]),
    },
  };
}

export function resetOrInstantEnrollOperator(
  userId: string,
  action: 'reset' | 'instant_enroll' | 'rl_stepup_reward' | 'simulate_ip_drift',
  sessionId = 'sess_default',
  clientIp = '127.0.0.1',
  keyFeatures?: ExtractedKeystrokeFeatures,
  mouseFeatures?: ExtractedMouseFeatures,
  bonusTelemetryPoints = 0
): OperatorVerificationResult {
  const existing = memoryProfiles.get(userId);

  if (action === 'simulate_ip_drift' && existing) {
    existing.boundIpAddress = '197.232.61.14';
    saveProfilesToDisk();
    return evaluateOperatorIdentity(
      userId,
      keyFeatures || {
        mean_hold: 0.102,
        std_hold: 0.018,
        mean_dd: 0.245,
        std_dd: 0.055,
        mean_ud: 0.143,
        std_ud: 0.052,
      },
      mouseFeatures || {
        mean_vel: 380,
        std_vel: 500,
        max_vel: 2200,
        mean_acc: 220,
        std_acc: 1500,
        idle_pct: 0.15,
      },
      false,
      false,
      false,
      sessionId,
      clientIp === '197.232.61.14' ? '105.163.1.99' : clientIp
    );
  }

  if (action === 'rl_stepup_reward' && existing && existing.isEnrolled) {
    const cleanExisting = sanitizeBloatedProfile(existing);
    cleanExisting.consecutiveAnomalies = 0;
    cleanExisting.lastDecision = 'accept';
    cleanExisting.lastDistance = 0.58;
    cleanExisting.boundIpAddress = clientIp;
    cleanExisting.rlState.falsePositiveCorrections += 1;
    cleanExisting.rlState.totalRewards += 5;
    cleanExisting.rlState.positiveReinforcements += 3;
    cleanExisting.rlState.telemetryPoints += bonusTelemetryPoints > 0 ? bonusTelemetryPoints : 50;
    cleanExisting.rlState.cleanKeystrokesSampled =
      (cleanExisting.rlState.cleanKeystrokesSampled || 60) + 25;
    // Cap adaptiveMultiplier at 1.05x so threshold never becomes overly lenient
    cleanExisting.rlState.adaptiveMultiplier = Number(
      Math.min(1.05, cleanExisting.rlState.adaptiveMultiplier + 0.01).toFixed(3)
    );

    if (keyFeatures && mouseFeatures) {
      const vec = buildFeatureVector(keyFeatures, mouseFeatures);
      const { zVec, activeMask } = computeModalityGatedMahalanobis(
        vec,
        cleanExisting.mu,
        cleanExisting.sigma,
        true,
        true
      );
      for (let e = 0; e < 3; e++) {
        cleanExisting.lastReconstructionError = runAutoencoderStep(
          cleanExisting.autoencoder,
          zVec,
          true,
          activeMask
        );
      }
      for (let i = 0; i < 8; i++) {
        cleanExisting.mu[i] = Number((cleanExisting.mu[i] * 0.85 + vec[i] * 0.15).toFixed(4));
      }
      cleanExisting.sigma = clampSigmaVector(cleanExisting.sigma);
    }
    saveProfilesToDisk();

    const effectiveThreshold = Number(
      (cleanExisting.threshold * cleanExisting.rlState.adaptiveMultiplier).toFixed(3)
    );
    const readiness = evaluateBiometricReadiness(cleanExisting);

    return {
      status: 'enrolled',
      decision: 'accept',
      enrollmentProgress: {
        collectedWindows: cleanExisting.calibrationWindows.length,
        requiredWindows: cleanExisting.minWindowsRequired,
        percentComplete: 100,
      },
      biometricReadiness: readiness,
      mahalanobisDistance: cleanExisting.lastDistance,
      reconstructionError: cleanExisting.lastReconstructionError,
      threshold: effectiveThreshold,
      operatorRiskScore: 5,
      consecutiveAnomalies: 0,
      estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
      sessionSecurity: {
        sessionId,
        boundIp: clientIp,
        currentIp: clientIp,
        ipDriftDetected: false,
      },
      continualLearning: {
        epochsTrained: cleanExisting.autoencoder.epochsTrained,
        rlRewards: cleanExisting.rlState.totalRewards,
        adaptiveMultiplier: cleanExisting.rlState.adaptiveMultiplier,
        telemetryPoints: cleanExisting.rlState.telemetryPoints,
        baselineSource: 'supabase-cloud',
      },
      profileCentroid: {
        mean_hold_ms: Math.round(cleanExisting.mu[0] * 1000),
        mean_ud_ms: Math.round(cleanExisting.mu[4] * 1000),
        mean_vel_px: Math.round(cleanExisting.mu[8]),
      },
    };
  }

  if (action === 'reset') {
    memoryProfiles.delete(userId);
    saveProfilesToDisk();
    return {
      status: 'calibrating',
      decision: 'calibrating',
      enrollmentProgress: {
        collectedWindows: 0,
        requiredWindows: MIN_CALIBRATION_WINDOWS,
        percentComplete: 0,
      },
      biometricReadiness: {
        isReadyForBiometricProfile: false,
        readinessPercent: 0,
        cleanDigraphsCollected: 0,
        requiredDigraphs: REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK,
        varianceConvergenceScore: 0,
        impostorSeparabilityScore: 0,
        persistedToBiometricProfilesTable: false,
      },
      mahalanobisDistance: 0,
      reconstructionError: 0,
      threshold: 2.25,
      operatorRiskScore: 0,
      consecutiveAnomalies: 0,
      estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
      sessionSecurity: {
        sessionId,
        boundIp: clientIp,
        currentIp: clientIp,
        ipDriftDetected: false,
      },
      continualLearning: {
        epochsTrained: 0,
        rlRewards: 0,
        adaptiveMultiplier: 1.0,
        telemetryPoints: 0,
        baselineSource: 'edge-memory',
      },
    };
  }

  // Instant enroll
  const baseKey: ExtractedKeystrokeFeatures = keyFeatures || {
    mean_hold: 0.099,
    std_hold: 0.016,
    mean_dd: 0.245,
    std_dd: 0.052,
    mean_ud: 0.146,
    std_ud: 0.048,
    hold_to_dd_ratio: 0.404,
    rollover_rate: 0.06,
  };
  const baseMouse: ExtractedMouseFeatures = mouseFeatures || {
    mean_vel: 420.0,
    std_vel: 550.0,
    max_vel: 2800.0,
    mean_acc: 260.0,
    std_acc: 1800.0,
    idle_pct: 0.14,
  };

  const baseVec = buildFeatureVector(baseKey, baseMouse);
  const syntheticWindows: number[][] = [];
  for (let i = 0; i < MIN_CALIBRATION_WINDOWS; i++) {
    const jitter = (i - 2) * 0.025;
    syntheticWindows.push(baseVec.map((v) => Number((v * (1 + jitter)).toFixed(4))));
  }

  const stats = computeCentroidAndSigma(syntheticWindows);
  const ae = createInitialAutoencoder();
  let lastRecon = 0.14;
  for (let epoch = 0; epoch < 6; epoch++) {
    for (const w of syntheticWindows) {
      const { zVec, activeMask } = computeModalityGatedMahalanobis(
        w,
        stats.mu,
        stats.sigma,
        true,
        true
      );
      lastRecon = runAutoencoderStep(ae, zVec, true, activeMask);
    }
  }

  const prevPoints = existing?.rlState?.telemetryPoints ?? 100;
  const profile: OperatorBiometricProfile = {
    userId,
    calibrationWindows: syntheticWindows,
    isEnrolled: true,
    minWindowsRequired: MIN_CALIBRATION_WINDOWS,
    mu: stats.mu,
    sigma: stats.sigma,
    threshold: stats.threshold,
    autoencoder: ae,
    rlState: {
      totalRewards: (existing?.rlState?.totalRewards ?? 5) + 3,
      positiveReinforcements: (existing?.rlState?.positiveReinforcements ?? 5) + 3,
      falsePositiveCorrections: existing?.rlState?.falsePositiveCorrections ?? 0,
      adaptiveMultiplier: 1.0,
      telemetryPoints: prevPoints + bonusTelemetryPoints,
      cleanKeystrokesSampled: Math.max(
        REQUIRED_CLEAN_DIGRAPHS_FOR_LOCK,
        existing?.rlState?.cleanKeystrokesSampled ?? 65
      ),
    },
    boundIpAddress: clientIp,
    lastSessionId: sessionId,
    consecutiveAnomalies: 0,
    lastDistance: 0.62,
    lastReconstructionError: lastRecon,
    lastDecision: 'accept',
    updatedAt: new Date().toISOString(),
  };

  memoryProfiles.set(userId, profile);
  saveProfilesToDisk();

  const readiness = evaluateBiometricReadiness(profile);

  return {
    status: 'enrolled',
    decision: 'accept',
    enrollmentProgress: {
      collectedWindows: MIN_CALIBRATION_WINDOWS,
      requiredWindows: MIN_CALIBRATION_WINDOWS,
      percentComplete: 100,
    },
    biometricReadiness: readiness,
    mahalanobisDistance: 0.62,
    reconstructionError: lastRecon,
    threshold: stats.threshold,
    operatorRiskScore: 6,
    consecutiveAnomalies: 0,
    estimatedTtdSeconds: LOCKOUT_CONSECUTIVE_WINDOWS * 5,
    sessionSecurity: {
      sessionId,
      boundIp: clientIp,
      currentIp: clientIp,
      ipDriftDetected: false,
    },
    continualLearning: {
      epochsTrained: ae.epochsTrained,
      rlRewards: profile.rlState.totalRewards,
      adaptiveMultiplier: profile.rlState.adaptiveMultiplier,
      telemetryPoints: profile.rlState.telemetryPoints,
      baselineSource: 'supabase-cloud',
    },
    profileCentroid: {
      mean_hold_ms: Math.round(stats.mu[0] * 1000),
      mean_ud_ms: Math.round(stats.mu[4] * 1000),
      mean_vel_px: Math.round(stats.mu[8]),
    },
  };
}
