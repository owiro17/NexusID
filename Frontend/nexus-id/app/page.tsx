import Link from 'next/link';
import {
  ShieldCheck,
  ArrowRight,
  Fingerprint,
  Sparkles,
  Lock,
  ChevronRight,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-950 font-sans">
      {/* Navigation */}
      <header className="w-full border-b border-slate-200/80 bg-[#EEF2F6]/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-950 block leading-none">
                NexusID
              </span>
              <span className="text-[11px] text-slate-700 font-medium block mt-0.5">
                Banking that knows it&apos;s you
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-bold text-slate-800 hover:text-slate-950 px-3.5 py-2 rounded-xl hover:bg-white/80 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="nexus-btn-neumorphic text-xs font-bold text-blue-700 px-4.5 py-2.5 rounded-xl cursor-pointer"
            >
              Open account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-16 sm:pt-24 pb-24 text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-teal-600" />
          <span>Built for Kenyan SMEs & Agency Banking • Ksh Instant Transfers</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-slate-950 tracking-tight leading-tight mb-6">
          Banking that knows <br className="hidden sm:block" />
          <span className="text-blue-700">it&apos;s really you.</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-800 font-medium mb-10 max-w-2xl mx-auto leading-relaxed">
          Sign in with a single touch and send money in Kenya Shillings without constant security interruptions. NexusID quietly recognizes your natural typing rhythm to keep your business account safe, even if you step away from your desk.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signup"
            className="w-full sm:w-auto px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <span>Get started</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-7 py-3.5 nexus-btn-neumorphic text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <Fingerprint className="w-4 h-4 text-blue-700" />
            <span>Sign in with passkey</span>
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-4 py-3.5 text-slate-800 hover:text-blue-700 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1"
          >
            <span>Go to dashboard</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 3 Neumorphic Benefit Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-20 text-left">
          <div className="p-7 rounded-3xl nexus-card-neumorphic nexus-card-neumorphic-hover">
            <div className="w-12 h-12 bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl flex items-center justify-center mb-5">
              <Fingerprint className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-950 mb-2.5">
              One-touch passkey sign-in
            </h3>
            <p className="text-slate-800 text-xs font-medium leading-relaxed">
              No passwords to remember or phish. Use Touch ID, Face ID, or Windows Hello to access your business account in seconds.
            </p>
          </div>

          <div className="p-7 rounded-3xl nexus-card-neumorphic nexus-card-neumorphic-hover">
            <div className="w-12 h-12 bg-teal-50 border border-teal-200 text-teal-700 rounded-2xl flex items-center justify-center mb-5">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-950 mb-2.5">
              Silent continuous protection
            </h3>
            <p className="text-slate-800 text-xs font-medium leading-relaxed">
              NexusID learns your natural typing pace in the background. If someone else sits at your unlocked laptop, transfers are paused automatically.
            </p>
          </div>

          <div className="p-7 rounded-3xl nexus-card-neumorphic nexus-card-neumorphic-hover">
            <div className="w-12 h-12 bg-amber-50 border border-amber-300 text-amber-700 rounded-2xl flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-950 mb-2.5">
              Daily Ksh rewards
            </h3>
            <p className="text-slate-800 text-xs font-medium leading-relaxed">
              Complete quick daily typing phrases to earn up to Ksh 700 in account rewards while making your personal security profile even smoother.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
