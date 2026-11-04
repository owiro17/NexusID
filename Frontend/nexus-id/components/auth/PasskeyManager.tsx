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
      setError(err.message || 'Could not load your registered passkeys.');
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

      setSuccess('Passkey name updated.');
      setEditingId(null);
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Could not rename passkey.');
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

      setSuccess('Passkey removed.');
      setDeletingPasskey(null);
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Could not remove passkey.');
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
        friendlyName: newKeyName.trim() || 'My Device Passkey',
      });
      if (regError) throw regError;

      if (data?.id) {
        try {
          await updatePasskey(supabase, data.id, newKeyName.trim() || 'My Device Passkey');
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
            friendly_name: newKeyName.trim() || 'My Device Passkey',
            passkey_id: data?.id,
          },
        }),
      });

      setSuccess('New passkey added.');
      setShowAddModal(false);
      setNewKeyName('');
      await fetchPasskeys();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey setup was cancelled.');
      } else {
        setError(err.message || 'Could not add passkey.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="nexus-card-neumorphic rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700">
              <KeyRound className="w-4 h-4" />
            </div>
            <span>Your registered passkeys</span>
          </h2>
          <p className="text-xs text-slate-800 font-medium mt-1.5 leading-relaxed">
            Use Face ID, Touch ID, Windows Hello, or a hardware security key to sign in and confirm transfers with a single touch.
          </p>
        </div>
        <button
          onClick={() => {
            setNewKeyName('');
            setShowAddModal(true);
          }}
          className="nexus-btn-neumorphic px-4 py-2.5 rounded-xl text-xs font-bold text-blue-700 flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Add passkey</span>
        </button>
      </div>

      {error && (
        <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-950 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="mt-5 p-4 rounded-xl bg-teal-50 border border-teal-300 text-teal-950 text-xs font-semibold flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-teal-800 hover:text-teal-950 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mt-6 divide-y divide-slate-200/80">
        {isLoading ? (
          <div className="py-10 text-center text-slate-800 font-medium flex items-center justify-center gap-2.5 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
            <span>Loading your passkeys...</span>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="py-10 text-center nexus-well-inset rounded-2xl p-8 my-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-3 text-blue-700">
              <Fingerprint className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-950 font-bold">No passkeys added yet</p>
            <p className="text-xs text-slate-800 font-medium mt-1.5 max-w-sm mx-auto leading-relaxed">
              Add a passkey on this device so you can sign in and approve high-value transfers with a single biometric tap.
            </p>
          </div>
        ) : (
          passkeys.map((key) => (
            <div key={key.id} className="py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200/80 text-blue-700">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  {editingId === key.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="nexus-input-neumorphic px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-950"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(key.id)}
                        disabled={actionLoading}
                        className="p-1 text-teal-700 hover:text-teal-900 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-950">
                        {key.friendly_name || 'Device Passkey'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingId(key.id);
                          setEditingName(key.friendly_name || '');
                        }}
                        className="text-slate-600 hover:text-slate-900 cursor-pointer"
                        title="Rename passkey"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-700 font-medium mt-1.5">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                      Added {new Date(key.created_at).toLocaleDateString('en-KE')}
                    </span>
                    {key.last_used_at && (
                      <span className="text-teal-800 font-semibold">• Last used {new Date(key.last_used_at).toLocaleDateString('en-KE')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => setDeletingPasskey(key)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-700 hover:text-red-900 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deletingPasskey && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm nexus-card-neumorphic rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-950 text-base">Remove passkey?</h3>
            </div>
            <p className="text-xs text-slate-800 font-medium leading-relaxed">
              Are you sure you want to remove{' '}
              <span className="text-slate-950 font-bold">
                {deletingPasskey.friendly_name || 'this passkey'}
              </span>
              ? You won&apos;t be able to use it to sign in on this device.
            </p>

            {passkeys.length === 1 && (
              <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-medium">
                <span className="font-bold">Note:</span> This is your only passkey. If you remove it, you will need to use an email sign-in link next time.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setDeletingPasskey(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-100 border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Remove passkey</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm nexus-card-neumorphic rounded-3xl p-6 shadow-2xl">
            <h3 className="font-bold text-slate-950 mb-1.5 flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <KeyRound className="w-4 h-4" />
              </div>
              <span>Add a new passkey</span>
            </h3>
            <p className="text-xs text-slate-800 font-medium mb-4 leading-relaxed">
              Give this device a recognizable name, then follow your browser prompt.
            </p>

            <form onSubmit={handleAddPasskey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1.5">
                  Device name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Office Laptop — Windows Hello"
                  required
                  className="w-full nexus-input-neumorphic px-3.5 py-2.5 rounded-xl text-xs text-slate-950 placeholder-slate-500 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-100 border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {actionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Save passkey</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
