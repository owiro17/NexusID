'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listPasskeys, deletePasskey, updatePasskey, registerPasskey } from '@/lib/supabase/passkeys';
import type { PasskeyCredential } from '@/types/auth';
import {
  Fingerprint,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

export function PasskeyManager() {
  const supabase = createClient();
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingPasskey, setDeletingPasskey] = useState<PasskeyCredential | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const fetchPasskeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: listError } = await listPasskeys(supabase);
      if (listError) throw listError;
      setPasskeys(Array.isArray(data) ? (data as PasskeyCredential[]) : []);
    } catch (err: any) {
      console.error('Fetch passkeys error:', err);
      setError(err.message || 'Failed to fetch registered passkeys.');
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  const handleRename = async (passkeyId: string) => {
    if (!editingName.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: updateError } = await updatePasskey(supabase, passkeyId, editingName.trim());
      if (updateError) throw updateError;

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'PASSKEY_RENAMED',
          metadata: { passkey_id: passkeyId, new_friendly_name: editingName.trim() },
        }),
      });

      setSuccess('Passkey renamed successfully.');
      setEditingId(null);
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Failed to rename passkey.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPasskey) return;
    setActionLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await deletePasskey(supabase, deletingPasskey.id);
      if (deleteError) throw deleteError;

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'PASSKEY_REVOKED',
          metadata: {
            passkey_id: deletingPasskey.id,
            remaining_keys: passkeys.length - 1,
          },
        }),
      });

      setSuccess('Passkey revoked.');
      setDeletingPasskey(null);
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke passkey.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const { data, error: regError } = await registerPasskey(supabase, {
        friendlyName: newKeyName.trim() || 'New Security Key',
      });
      if (regError) throw regError;

      if (data?.id) {
        try {
          await updatePasskey(supabase, data.id, newKeyName.trim() || 'New Security Key');
        } catch (updateErr) {
          console.warn('Update friendly name warning:', updateErr);
        }
      }

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'PASSKEY_REGISTERED',
          metadata: {
            friendly_name: newKeyName.trim() || 'New Security Key',
            passkey_id: data?.id,
          },
        }),
      });

      setSuccess('New passkey enrolled successfully.');
      setShowAddModal(false);
      setNewKeyName('');
      await fetchPasskeys();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Biometric registration was cancelled.');
      } else {
        setError(err.message || 'Failed to add passkey.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            <span>Hardware Passkeys & WebAuthn</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage biometric authenticators (Face ID, Touch ID, Windows Hello) and FIDO2 Security Keys bound to your account.
          </p>
        </div>
        <button
          onClick={() => {
            setNewKeyName('');
            setShowAddModal(true);
          }}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Passkey</span>
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mt-6 divide-y divide-slate-800/60">
        {isLoading ? (
          <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Querying cryptographic credentials...</span>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 p-6">
            <Fingerprint className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-medium">No Passkeys Registered</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              You are currently relying on Magic Link email recovery. Add a passkey to secure your account against phishing.
            </p>
          </div>
        ) : (
          passkeys.map((key) => (
            <div key={key.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-400">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  {editingId === key.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(key.id)}
                        disabled={actionLoading}
                        className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-400 hover:text-slate-300 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-200">
                        {key.friendly_name || 'Passkey Authenticator'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingId(key.id);
                          setEditingName(key.friendly_name || '');
                        }}
                        className="text-slate-500 hover:text-slate-400 cursor-pointer"
                        title="Rename Passkey"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Created {new Date(key.created_at).toLocaleDateString()}
                    </span>
                    {key.last_used_at && (
                      <span>• Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => setDeletingPasskey(key)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deletingPasskey && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-semibold text-white">Revoke Passkey?</h3>
            </div>
            <p className="text-xs text-slate-400">
              Are you sure you want to revoke <span className="text-slate-200 font-semibold">{deletingPasskey.friendly_name || 'this passkey'}</span>? This device will no longer be able to authenticate.
            </p>

            {passkeys.length === 1 && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs">
                ⚠️ <span className="font-semibold">Warning:</span> This is your last remaining passkey. If you revoke it, you will have to use Magic Link recovery to sign in.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDeletingPasskey(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Revocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-cyan-400" />
              <span>Register New Passkey</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Connect your security key (e.g. YubiKey) or prepare TouchID/Windows Hello on this device.
            </p>

            <form onSubmit={handleAddPasskey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Passkey Label</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Work YubiKey 5C"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 flex items-center gap-1.5 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Enroll Device</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
