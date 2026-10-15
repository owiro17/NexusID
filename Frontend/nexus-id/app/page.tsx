import Link from 'next/link';
import {
  ShieldCheck,
  KeyRound,
  Activity,
  Database,
  ArrowRight,
  Fingerprint,
  Cpu,
  Lock,
  ChevronRight,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
      {/* Background Cyber Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:24px_24px]" />

      {/* Navigation */}
      <header className="relative z-10 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-mono">
              Nexus<span className="text-cyan-400">ID</span>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-2 rounded-lg hover:bg-slate-900 transition-colors"
            >
              Sign In with Passkey
            </Link>
            <Link
              href="/auth/signup"
              className="text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 px-4 py-2 rounded-xl transition-all shadow-md shadow-cyan-500/20 font-bold"
            >
              Start Live Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 text-xs font-mono tracking-wide uppercase">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>FIDO2 Passkeys • Continuous Behavioral Biometrics • PostgreSQL RLS</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-tight mb-6">
          Zero Trust Adaptive Identity. <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400">
            Invisible to Legitimate Users.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          NexusID secures mission-critical financial applications by replacing fragile passwords with discoverable WebAuthn
          passkeys and continuous behavioral biometrics. Anomaly detection gates database transactions in real-time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signup"
            className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 rounded-xl font-bold text-sm transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2"
          >
            <span>Start Fast Onboarding</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-7 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <span>Biometric Passkey Login</span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-3.5 text-slate-400 hover:text-white rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
          >
            <span>Open Dashboard</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-24 text-left">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center mb-4">
              <Fingerprint className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">FIDO2 Resident Credentials</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Phishing-resistant authentication via WebAuthn Level 3. Users sign in with Touch ID, Face ID, or Windows Hello
              in a single biometric tap.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Continuous Behavioral Biometrics</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Background keystroke dynamics and mouse kinematics are continuously scored. If session hijacking occurs, trust is revoked immediately.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Supabase PostgreSQL RLS</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Zero Trust is enforced at the database engine. Row-Level Security policies evaluate live risk tokens before authorizing any financial transfer.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
