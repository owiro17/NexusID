#  NexusID: Continuous Adaptive Identity System

NexusID is a next-generation Zero Trust identity platform. Instead of relying purely on point-in-time passwords, NexusID utilizes **FIDO2/Passkeys** for initial authentication and **Continuous Behavioral Biometrics** (Mouse Kinematics & Keystroke Dynamics) to silently verify users in the background.

If anomalous behavior is detected (e.g., session hijacking), the system intelligently triggers a Step-Up Verification (MFA/OTP) rather than instantly disrupting the user experience.

---

## Architecture Overview

The system is built on a decoupled, infrastructure-agnostic architecture designed to run on Edge environments (Vercel/Cloudflare).

1. **Frontend (Next.js & React):**
   - **Auth UI:** Supabase Auth integration for Passkeys (WebAuthn), Magic Links, OTP, and OAuth.
   - **Telemetry SDK:** A lightweight React hook (`useTelemetry`) that silently captures and batches X/Y mouse coordinates and keystroke timings into 5-second windows.
2. **Edge Inference API (Next.js Route):**
   - Receives telemetry chunks and fetches the user's "Golden Baseline" from the database.
   - Runs lightning-fast inference using **ONNX Runtime** (Random Forest / 1D-CNN).
   - Calculates a `Risk Score (0-100)` and issues a signed Risk JWT.
3. **Zero Trust Database (Supabase):**
   - **Telemetry Vault:** Securely stores historical behavioral baselines.
   - **Row-Level Security (RLS):** Database policies that automatically reject mutations (e.g., financial transfers) if the injected Risk JWT exceeds the safety threshold.

---

##  Getting Started for Contributors

### Prerequisites
- Node.js (v20+ recommended)
- Python 3.10+ (for ML pipeline development)
- Supabase CLI (optional, for local DB development)

### 1. Frontend & API Setup
Navigate to the frontend directory and install dependencies:
```bash
cd Frontend/nexus-id
npm install
```
Start the development server:
```bash
npm run dev
```
The dashboard and telemetry collector will be available at `http://localhost:3000/dashboard`.

### 2. Machine Learning Pipeline (Python)
If you wish to train new models or modify the feature engineering pipeline:
```bash
cd Backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
```
To run the full end-to-end training pipeline and export new `.onnx` models to the Next.js public directory:
```bash
python scratch/train_pipeline_fixed.py
python scratch/convert_to_onnx.py
```

---

##  Current ML Models (MVP Phase)
*   **Keystrokes:** Random Forest Classifier (~93% accuracy on 51 subjects) using Mean/Std aggregates of Hold Times and Flight Times.
*   **Mouse Dynamics:** Random Forest Classifier (~69% accuracy) evaluating spatial-temporal kinematics (Velocity, Acceleration, Jerk).
*   **Roadmap Upgrade:** Transitioning to a Siamese 1D-CNN for deep spatial feature extraction.

##  Security & Privacy
All telemetry data is anonymized and converted into statistical kinematic features *before* storage. Raw X/Y coordinates mapping to specific UI elements are never stored in plain text, ensuring user privacy is maintained while securing the session.
