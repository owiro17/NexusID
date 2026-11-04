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
  BarChart3,
  Loader2,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string>('Loading...');
  const [isHardwareEnrolled, setIsHardwareEnrolled] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserEmail(user.email || 'Account Holder');

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
              account_type: 'Business Account',
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

      if (profile?.hardware_enrolled) {
        setIsHardwareEnrolled(true);
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
      label: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      label: 'Rewards',
      href: '/dashboard/challenges',
      icon: Trophy,
      badge: 'KSh 700',
      active: pathname === '/dashboard/challenges',
    },
    {
      label: 'Insights',
      href: '/dashboard/insights',
      icon: BarChart3,
      active: pathname === '/dashboard/insights',
    },
    {
      label: 'Security',
      href: '/dashboard/security',
      icon: KeyRound,
      active:
        pathname === '/dashboard/security' ||
        pathname === '/dashboard/settings' ||
        pathname === '/auth/enroll-passkey',
    },
  ];

  const pageTitle =
    pathname === '/dashboard/challenges'
      ? 'Daily Rewards'
      : pathname === '/dashboard/insights'
      ? 'Trust & Activity Insights'
      : pathname === '/dashboard/security' || pathname === '/dashboard/settings'
      ? 'Security & Passkeys'
      : 'Account Overview';

  const userInitials = userEmail
    ? userEmail
        .split('@')[0]
        .slice(0, 2)
        .toUpperCase()
    : 'NX';

  return (
    <div className="flex h-screen bg-[#EEF2F6] text-slate-950 overflow-hidden font-sans">
      {/* Desktop Left Sidebar — Deep Navy (#0B1B3F) */}
      <aside className="w-64 bg-[#0B1B3F] text-white flex-col justify-between hidden md:flex shrink-0 border-r border-slate-900/20">
        <div>
          {/* Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-white/10 gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block leading-none">
                NexusID
              </span>
              <span className="block text-[11px] text-blue-200/80 mt-1">
                Banking that knows it&apos;s you
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 cursor-pointer ${
                    item.active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${
                        item.active ? 'text-white' : 'text-blue-200/70'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer — User Info */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-semibold text-xs shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{userEmail}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isHardwareEnrolled ? 'bg-teal-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-[11px] text-blue-200/80 truncate">
                  {isHardwareEnrolled ? 'Passkey active' : 'Standard protection'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Clean Minimal Top Header */}
        <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-300/80 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex md:hidden items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight text-slate-950">NexusID</span>
              <span className="text-slate-400">•</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-950">{pageTitle}</h1>
          </div>

          {/* Right Header Controls: Avatar Pill + Sign Out */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-200/80 border border-slate-300">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                {userInitials}
              </div>
              <span className="text-xs font-semibold text-slate-800 max-w-[180px] truncate">
                {userEmail}
              </span>
            </div>

            <button
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-800 hover:text-slate-950 transition-colors duration-200 disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Sign out"
            >
              {isLoggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
              ) : (
                <LogOut className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="nexus-minimal-scroller flex-1 overflow-y-auto p-4 sm:p-8 pb-24 md:pb-10 bg-[#EEF2F6]">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around z-30 shadow-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[11px] font-medium transition-colors duration-200 cursor-pointer ${
                  item.active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 mb-0.5 ${item.active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
