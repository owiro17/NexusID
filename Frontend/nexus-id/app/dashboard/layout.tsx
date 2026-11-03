'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheck,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Trophy,
  Lock,
  ChevronRight,
  Loader2,
  Globe,
  Sparkles,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string>('Loading...');
  const [accountType, setAccountType] = useState<string>('Enterprise Tier');
  const [isHardwareEnrolled, setIsHardwareEnrolled] = useState<boolean>(false);
  const [sessionIdPreview, setSessionIdPreview] = useState<string>('sess_active');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    try {
      const sid = window.sessionStorage.getItem('nexusid_active_session_id');
      if (sid) setSessionIdPreview(sid);
    } catch {
      // ignore
    }

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserEmail(user.email || 'Authenticated User');

      let { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile && user.email) {
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: user.id,
              email: user.email,
              account_type: 'Standard User',
              behavioral_risk_score: 0,
              hardware_enrolled: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .select()
          .maybeSingle();
        profile = newProfile;
      }

      if (profile) {
        if (profile.account_type) setAccountType(profile.account_type);
        if (profile.hardware_enrolled) setIsHardwareEnrolled(true);
      }
    }

    loadUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  const navItems = [
    {
      label: 'Banking Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      label: 'Daily Challenges & Rewards',
      href: '/dashboard/challenges',
      icon: Trophy,
      badge: '$700 Pool',
      active: pathname === '/dashboard/challenges',
    },
    {
      label: 'Security & Passkeys',
      href: '/dashboard/security',
      icon: KeyRound,
      active: pathname === '/dashboard/security' || pathname === '/dashboard/settings',
    },
    {
      label: 'Register New Passkey',
      href: '/auth/enroll-passkey',
      icon: Lock,
      active: pathname === '/auth/enroll-passkey',
    },
  ];

  const userInitials = userEmail
    ? userEmail
        .split('@')[0]
        .slice(0, 2)
        .toUpperCase()
    : 'NX';

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between hidden md:flex shrink-0">
        <div>
          {/* Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white font-mono">
                Nexus<span className="text-cyan-400">Bank</span>
              </span>
              <span className="block text-[9px] font-mono text-cyan-400 uppercase tracking-widest">
                Continual RL Vault
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Core Systems
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    item.active
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${item.active ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {item.badge}
                    </span>
                  ) : (
                    item.active && <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Session & IP Security Status Pill */}
          <div className="mx-4 mt-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <Globe className="w-3 h-3" />
                IP-Bound Token
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
                Verified
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate">
              ID: <span className="text-slate-300">{sessionIdPreview}</span>
            </div>
          </div>
        </div>

        {/* User Card & Sign Out */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-xs">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{userEmail}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isHardwareEnrolled ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-[10px] text-slate-400 capitalize truncate">
                  {isHardwareEnrolled ? 'FIDO2 Protected' : accountType}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/40 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoggingOut ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>{isLoggingOut ? 'Terminating Session...' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header with Quick Page Switcher for Smooth Mobile & Desktop Navigation */}
        <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <div className="flex md:hidden items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-slate-950" />
              </div>
              <span className="font-bold text-sm tracking-tight text-white font-mono">NexusID</span>
            </div>

            {/* Smooth Top Pill Navigation Bar */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <Link
                href="/dashboard"
                prefetch={true}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  pathname === '/dashboard'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Overview</span>
              </Link>
              <Link
                href="/dashboard/challenges"
                prefetch={true}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  pathname === '/dashboard/challenges'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Daily Challenges</span>
              </Link>
              <Link
                href="/dashboard/security"
                prefetch={true}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  pathname === '/dashboard/security'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Security & Passkeys</span>
              </Link>
            </div>
          </div>

          {/* Quick Actions Header */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono mr-2">
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                RL Autoencoder Live
              </span>
            </div>

            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/50 text-xs text-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="nexus-minimal-scroller flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
