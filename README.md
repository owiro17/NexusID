# NexusID: Continuous Adaptive Identity & Behavioral Orchestration

> **Continuous Adaptive Identity and Behavioral Orchestration System** securing high-value applications by leveraging edge-computed multimodal behavioral biometrics (keystroke dynamics and mouse telemetry) and native PostgreSQL Row-Level Security (RLS) to mitigate post-authentication session hijacking.

## 📌 Project Overview
Traditional digital authentication relies on a binary "gatekeeper" model—a static barrier where users exchange a secret (or passkey) for access. However, once inside, the system blindly trusts the active session. **NexusID** eliminates this vulnerability by shifting from perimeter defense to **Continuous Behavioral Authentication**. 

By silently capturing neuromuscular telemetry (keystroke rhythms and mouse kinematics) and programatic AI agent cadences, NexusID generates a dynamic risk score via edge-based machine learning. This score is injected into a secure JSON Web Token (JWT) and enforced natively at the database layer using PostgreSQL Row-Level Security (RLS), achieving true zero-trust architecture without introducing user friction or application latency.

## ✨ Core Features
* **Passkey-First WebAuthn:** Replaces vulnerable passwords with cryptographic, device-bound FIDO2 passkeys for initial access.
* **Continuous Telemetry Ingestion:** Silently captures 60Hz interaction signals (dwell time, flight time, pointer efficiency) without blocking the main browser thread.
* **Stateless Edge Inference:** Executes 8-bit quantized ONNX machine learning models on V8 edge isolates (e.g., Vercel Edge Functions) for sub-100ms anomaly detection.
* **Database-Layer Enforcement (RLS):** Bypasses application middleware by passing behavioral risk scores directly to Supabase PostgreSQL, which dynamically masks rows, restricts access, or drops write privileges if anomalies are detected.
* **Dual-Track Governance:** Monitors and governs both human operators and autonomous AI agent API cadences.

## 🏗️ System Architecture Flow

**[ INPUTS ]** ➔➔➔ **[ PROCESSES ]** ➔➔➔ **[ OUTPUTS ]**

1. **Interaction Signals:** WebAuthn Passkey Login, 60Hz Behavioral Telemetry (Keystrokes/Mouse), and Agentic API Cadence.
2. **NexusID Edge Engine:** 
   * *Ingestion & Normalization:* Cleans and vectorizes incoming interaction signals.
   * *AI Risk Scoring:* Quantized ONNX models (1D-CNN, Random Forest, Logistic Regression) compare behavior against a cached, AES-256 encrypted "Golden Baseline."
   * *JWT Injection:* Generates a probabilistic risk score (0-100) and cryptographically signs it into the session token.
3. **Access Decisions (Database RLS):** 
   * 🟢 **Maintain Access** (Score ≤ 50: Expected Behavior)
   * 🟡 **Step-Up Challenge** (Score 51-80: Minor Anomalies)
   * 🔴 **Terminate/Restrict** (Score > 80: Imposter/Hijack Detected - Database dynamically hides ledgers)

## 💻 Tech Stack
* **Frontend Interface:** Next.js (App Router), React, TypeScript, Tailwind CSS.
* **Backend Orchestration:** NestJS (API Gateway, transaction orchestration).
* **Machine Learning / MLOps:** Python, TensorFlow, XGBoost, ONNX Runtime.
* **Edge Computing:** Vercel Edge Runtimes, Edge KV Store.
* **Data Persistence & Security:** Supabase (PostgreSQL 16), PgBouncer, Native Row-Level Security (RLS).

## 📊 Dataset & Machine Learning
The foundational keystroke dynamics model is trained and benchmarked using the **DSL-StrongPasswordData.csv** dataset.
* **Scope:** 50 users (subjects `s001`–`s050`), ~400 samples per user.
* **Features Extracted:** Hold times, Up-Down, and Down-Down timing intervals.
* **Performance:** Tree-based classifiers significantly outperform linear models in behavioral biometrics. Our baseline XGBoost classifier achieved an industry-leading **91.1% accuracy** in multi-class user identification, serving as the foundation for the quantized ONNX models deployed to the edge.

## 🚀 Getting Started

### 1. Prerequisites
* Node.js (v18.17.0 or higher recommended)
* npm, yarn, or pnpm
* A Supabase account and configured PostgreSQL project

### 2. Installation

**Clone the repository:**
```bash
git clone [https://github.com/owiro17/NexusID.git](https://github.com/owiro17/NexusID.git)
cd NexusID
