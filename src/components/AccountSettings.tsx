import React, { useEffect, useState } from 'react';

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import type { UserProfile } from '../types';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

interface NotificationPreferences {
  notificationsEnabled: boolean;
  quoteNotifications: boolean;
  responseNotifications: boolean;
}

/* Oculta parte del correo: alejandro@gmail.com -> al*****o@gmail.com */
const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 3))}${name.slice(-1)}@${domain}`;
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

const emailInUse = (email: string, currentEmail: string) => {
  try {
    const users: UserProfile[] = JSON.parse(
      localStorage.getItem('agrocordoba_registered_users') || '[]'
    );
    return users.some(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.email.toLowerCase() !== currentEmail.toLowerCase()
    );
  } catch {
    return false;
  }
};

/* ============================================================
   VENTANA DE VERIFICACIÓN
============================================================ */

interface PendingChange {
  name?: string;
  email?: string;
  phone?: string;
  notifications?: NotificationPreferences;
}

interface VerifyModalProps {
  user: UserProfile;
  change: PendingChange;
  onCancel: () => void;
  onVerified: (result: { user: UserProfile; notifications: NotificationPreferences }) => Promise<void> | void;
}

const VerifyModal: React.FC<VerifyModalProps> = ({
  user,
  change,
  onCancel,
  onVerified,
}) => {
  const [attempts, setAttempts] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const purpose = change.email
    ? 'confirmar el cambio de correo'
    : 'confirmar cambios en tu configuración';

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/account/settings/request-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo enviar el código.');
      setCodeSent(true);
      setAttempts(0);
      setInput('');
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Solicita al backend el código al abrir la confirmación.
  useEffect(() => {
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuenta regresiva para reenviar
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!codeSent) {
      setError('Primero solicita el código de verificación.');
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      setError('Hiciste demasiados intentos. Pide un código nuevo.');
      return;
    }
    try {
      const response = await fetch('/api/account/settings/verify-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: input.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setAttempts((count) => count + 1);
        throw new Error(payload.error || 'No se pudo confirmar el código.');
      }
      await onVerified(payload);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-title"
    >
      <form
        onSubmit={verify}
        className="w-full max-w-md rounded-t-lg bg-white p-6 shadow-xl sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-[#1F4D36]" />
            <div>
              <h2 id="verify-title" className="text-lg font-bold text-[#18241D]">
                Confirma que eres tú
              </h2>
              <p className="text-sm text-[#5B665F]">Para {purpose}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#5B665F]"
            aria-label="Cerrar"
          >
            <X size={19} />
          </button>
        </div>

        <p className="mt-5 text-sm text-[#5B665F]">
          {sending
            ? 'Enviando código…'
            : codeSent
              ? <>Enviamos un código de 6 dígitos a <strong className="text-[#18241D]">{maskEmail(user.email)}</strong>. Vence en {CODE_MINUTES} minutos.</>
              : 'Solicita un código para continuar.'}
        </p>

        <label htmlFor="verify-code" className="mt-5 block text-sm font-semibold text-[#18241D]">
          Código de verificación
        </label>
        <input
          id="verify-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="mt-2 w-full rounded-md border border-[#D9DED6] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
        />

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={input.length !== 6 || sending || !codeSent}
          className="mt-5 w-full rounded-md bg-[#1F4D36] py-3 font-semibold text-white hover:bg-[#18241D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirmar
        </button>

        <button
          type="button"
          onClick={send}
          disabled={resendIn > 0 || sending}
          className="mt-3 w-full text-sm font-semibold text-[#1F4D36] hover:text-[#18241D] disabled:text-gray-400"
        >
          {resendIn > 0 ? `Reenviar código en ${resendIn} s` : 'Reenviar código'}
        </button>
      </form>
    </div>
  );
};

/* ============================================================
   CONFIGURACIÓN DE LA CUENTA
============================================================ */

interface AccountSettingsProps {
  user: UserProfile;
  onUpdateProfile?: (updated: Partial<UserProfile>) => Promise<void> | void;
  onAccountDeleted?: () => void;
}

const inputClass =
  'w-full rounded-xl border border-[#D9DED6] bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15';

export const AccountSettings: React.FC<AccountSettingsProps> = ({
  user,
  onUpdateProfile,
  onAccountDeleted,
}) => {
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [farmAddress, setFarmAddress] = useState(user.farmAddress || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletionEmail, setDeletionEmail] = useState('');
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [deletionPassword, setDeletionPassword] = useState('');
  const [deletionError, setDeletionError] = useState('');
  const [deletionPending, setDeletionPending] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [quoteNotifications, setQuoteNotifications] = useState(true);
  const [responseNotifications, setResponseNotifications] = useState(true);

  useEffect(() => {
    fetch('/api/account/settings', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const saved = await response.json();
        setPhone(saved.phone || user.phone || '');
        setNotificationsEnabled(saved.notifications.notificationsEnabled);
        setQuoteNotifications(saved.notifications.quoteNotifications);
        setResponseNotifications(saved.notifications.responseNotifications);
      })
      .catch(() => undefined);
  }, [user.phone]);

  const ok = (text: string) => setMessage({ type: 'ok', text });
  const fail = (text: string) => setMessage({ type: 'error', text });

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeletionError('');
    setDeletionPending(true);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: deletionEmail.trim(),
          confirmation: deletionConfirmation,
          currentPassword: deletionPassword,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo eliminar la cuenta.');
      }

      try {
        const users: UserProfile[] = JSON.parse(
          localStorage.getItem('agrocordoba_registered_users') || '[]'
        );
        localStorage.setItem(
          'agrocordoba_registered_users',
          JSON.stringify(users.filter((savedUser) => savedUser.email.toLowerCase() !== user.email.toLowerCase()))
        );
      } catch (error) {
        console.error('No se pudo limpiar el perfil local tras eliminar la cuenta:', error);
      }
      onAccountDeleted?.();
    } catch (error) {
      setDeletionError((error as Error).message || 'No se pudo eliminar la cuenta.');
    } finally {
      setDeletionPending(false);
    }
  };

  const requestNameChange = () => {
    setMessage(null);
    const updatedName = name.trim();
    if (!updatedName) return fail('Escribe tu nombre.');
    if (updatedName.length > 160) return fail('El nombre no puede superar 160 caracteres.');
    if (updatedName === user.name) return fail('No has cambiado el nombre.');
    setPending({ name: updatedName });
  };

  /* ---------- Correo ---------- */

  const requestEmailChange = () => {
    setMessage(null);
    const email = newEmail.trim().toLowerCase();
    if (!isValidEmail(email)) return fail('Escribe un correo electrónico válido.');
    if (email === user.email.toLowerCase()) return fail('Ese ya es tu correo actual.');
    if (emailInUse(email, user.email)) return fail('Ese correo ya está registrado en otra cuenta.');
    setPending({ email });
  };

  /* ---------- Teléfono ---------- */

  const savePhone = () => {
    setMessage(null);
    if (!isValidPhone(phone)) return fail('Escribe un número válido, por ejemplo +57 300 123 4567.');
    setPending({ phone: phone.trim() });
  };

  const saveFarmAddress = async () => {
    setMessage(null);
    if (farmAddress.trim().length > 500) {
      return fail('La dirección no puede superar 500 caracteres.');
    }
    try {
      await onUpdateProfile?.({ farmAddress: farmAddress.trim() });
      ok('Dirección privada de recogida actualizada.');
    } catch (error) {
      fail((error as Error).message || 'No se pudo guardar la dirección.');
    }
  };

  /* ---------- Contraseña ---------- */
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      return fail('La confirmación no coincide con la nueva contraseña.');
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
      return fail('La nueva contraseña debe tener entre 8 y 256 caracteres.');
    }

    setPasswordSaving(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo cambiar la contraseña.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      ok(payload.message || 'Contraseña actualizada correctamente.');
    } catch (error) {
      fail((error as Error).message || 'No se pudo cambiar la contraseña.');
    } finally {
      setPasswordSaving(false);
    }
  };

  /* ---------- Código verificado ---------- */

  const handleVerified = async (result: { user: UserProfile; notifications: NotificationPreferences }) => {
    if (!pending) return;
    await onUpdateProfile?.({
      name: result.user.name,
      email: result.user.email,
      phone: result.user.phone,
    });
    setPhone(result.user.phone || '');
    setNotificationsEnabled(result.notifications.notificationsEnabled);
    setQuoteNotifications(result.notifications.quoteNotifications);
    setResponseNotifications(result.notifications.responseNotifications);
    setNewEmail('');
    setName(result.user.name);
    ok(pending.email
      ? `Correo actualizado. Desde ahora inicias sesión con ${pending.email}.`
      : pending.name
        ? 'Nombre actualizado.'
      : pending.phone !== undefined
        ? 'Número de WhatsApp actualizado.'
        : 'Preferencias guardadas.');
    setPending(null);
  };

  /* ---------- Notificaciones ---------- */

  const saveNotifications = () => {
    setPending({ notifications: { notificationsEnabled, quoteNotifications, responseNotifications } });
  };

  const sectionTitle = (icon: React.ReactNode, color: string, title: string, subtitle: string) => (
    <div className="mb-5 flex items-start gap-3">
      <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#18241D]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[#5B665F]">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-medium ${
            message.type === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'ok' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          {message.text}
        </div>
      )}

      {/* CORREO */}
      <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
        {sectionTitle(
          <UserRound size={21} />,
          'bg-green-50 text-[#1F4D36]',
          'Nombre de la cuenta',
          'Actualiza el nombre que ven los productores cuando solicitas una cotización.'
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            aria-label="Nombre de la cuenta"
            className="w-full flex-1 rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none transition focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
          />
          <button type="button" onClick={requestNameChange} className="rounded-xl bg-[#1F4D36] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#18241D]">
            Cambiar nombre
          </button>
        </div>
      </section>

      {/* CORREO */}
      <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
        {sectionTitle(
          <Mail size={21} />,
          'bg-green-50 text-[#1F4D36]',
          'Correo electrónico',
          'Confirma el cambio con un código enviado a tu correo actual.'
        )}
        <p className="mb-4 text-sm text-[#5B665F]">
          Correo actual: <strong className="text-[#18241D]">{user.email}</strong>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nuevo@correo.com"
              aria-label="Nuevo correo electrónico"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={requestEmailChange}
            className="rounded-xl bg-[#1F4D36] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#18241D]"
          >
            Cambiar correo
          </button>
        </div>
      </section>

      {/* TELÉFONO */}
      <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
        {sectionTitle(
          <Phone size={21} />,
          'bg-emerald-50 text-emerald-700',
          'Número de WhatsApp',
          'Los productores te escribirán a este número.'
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              aria-label="Número de WhatsApp"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={savePhone}
            className="rounded-xl border border-[#D9DED6] px-5 py-3 font-semibold text-[#18241D] transition-colors hover:bg-gray-50"
          >
            Guardar número
          </button>
        </div>
      </section>

      {user.role === 'productor' && (
        <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
          {sectionTitle(
            <MapPin size={21} />,
            'bg-emerald-50 text-emerald-700',
            'Punto de recogida',
            'Dirección privada de tu finca o lugar acordado para recoger.'
          )}
          <label className="block text-sm font-medium text-[#18241D]">
            Dirección
            <textarea
              maxLength={500}
              rows={3}
              autoComplete="street-address"
              value={farmAddress}
              onChange={(event) => setFarmAddress(event.target.value)}
              placeholder="Dirección, municipio y una referencia útil para llegar"
              className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-[#5B665F]">
            No aparece en tu perfil público. Solo se muestra al comprador de una cotización cuando aceptas el acuerdo de recogida.
          </p>
          <button
            type="button"
            onClick={() => void saveFarmAddress()}
            className="mt-4 rounded-xl bg-[#1F4D36] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#18241D]"
          >
            Guardar dirección privada
          </button>
        </section>
      )}

      {/* CONTRASEÑA */}
      <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
        {sectionTitle(
          <Lock size={21} />,
          'bg-amber-50 text-amber-700',
          'Contraseña',
          user.authProvider === 'google'
            ? 'La contraseña de tu cuenta Google se administra directamente con Google.'
            : 'Confirma tu contraseña actual para guardar una nueva.'
        )}
        {user.authProvider === 'google' ? (
          <div className="flex items-start gap-3 rounded-xl border border-[#e7e1cc] bg-[#fcfaf3] p-4 text-sm leading-6 text-[#665b3c]">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#8d7733]" aria-hidden="true" />
            <div>
              <p>Para cambiar tu contraseña, abre la configuración de seguridad de tu cuenta Google.</p>
              <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[#1f4d36] underline underline-offset-2 hover:text-[#173b2b]">
                Abrir seguridad de Google <ExternalLink size={14} />
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={changePassword} className="space-y-3">
            <label className="block text-sm font-medium text-[#18241D]">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none transition focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#18241D]">
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={256}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none transition focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
                />
              </label>
              <label className="block text-sm font-medium text-[#18241D]">
                Confirmar nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={256}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none transition focus:border-[#1F4D36] focus:ring-2 focus:ring-[#1F4D36]/15"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-xl bg-[#1F4D36] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#18241D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {passwordSaving ? 'Actualizando…' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </section>

      {/* NOTIFICACIONES */}
      <section className="rounded-2xl border border-[#D9DED6] bg-white p-6 shadow-sm sm:p-7">
        {sectionTitle(
          <Bell size={21} />,
          'bg-yellow-50 text-yellow-700',
          'Notificaciones',
          'Elige qué avisos quieres recibir.'
        )}
        <div className="space-y-5">
          {[
            {
              label: 'Activar notificaciones',
              hint: 'Recibir avisos importantes de AgroCórdoba.',
              value: notificationsEnabled,
              set: setNotificationsEnabled,
              disabled: false,
            },
            {
              label: 'Nuevas cotizaciones',
              hint: 'Avisos relacionados con tus solicitudes.',
              value: quoteNotifications,
              set: setQuoteNotifications,
              disabled: !notificationsEnabled,
            },
            {
              label: 'Respuestas de productores',
              hint: 'Avisos cuando un productor responda una solicitud.',
              value: responseNotifications,
              set: setResponseNotifications,
              disabled: !notificationsEnabled,
            },
          ].map((item) => (
            <label key={item.label} className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-[#18241D]">{item.label}</p>
                <p className="mt-1 text-sm text-[#5B665F]">{item.hint}</p>
              </div>
              <input
                type="checkbox"
                checked={item.value}
                disabled={item.disabled}
                onChange={(e) => item.set(e.target.checked)}
                className="h-5 w-5 accent-[#1F4D36]"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={saveNotifications}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1F4D36] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#18241D]"
        >
          <CheckCircle2 size={18} /> Guardar preferencias
        </button>
      </section>

      {user.authProvider && (user.role === 'cliente' || user.role === 'productor') && (
        <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm sm:p-7">
          {sectionTitle(
            <Trash2 size={21} />,
            'bg-red-50 text-red-700',
            'Eliminar cuenta',
            'La eliminación es permanente y no se puede deshacer.'
          )}
          <p className="mb-4 text-sm leading-6 text-[#5B665F]">
            Se borrarán tu perfil, publicaciones, cotizaciones, conversaciones y demás datos asociados.
            Confirma tu correo y escribe <strong>ELIMINAR MI CUENTA</strong> para continuar.
          </p>
          <form onSubmit={deleteAccount} className="space-y-3">
            <label className="block text-sm font-medium text-[#18241D]">
              Correo de la cuenta
              <input
                type="email"
                autoComplete="email"
                required
                value={deletionEmail}
                onChange={(event) => setDeletionEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              />
            </label>
            {user.authProvider === 'local' && (
              <label className="block text-sm font-medium text-[#18241D]">
                Contraseña actual
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={deletionPassword}
                  onChange={(event) => setDeletionPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                />
              </label>
            )}
            <label className="block text-sm font-medium text-[#18241D]">
              Confirmación
              <input
                type="text"
                required
                value={deletionConfirmation}
                onChange={(event) => setDeletionConfirmation(event.target.value)}
                placeholder="ELIMINAR MI CUENTA"
                className="mt-1 w-full rounded-xl border border-[#D9DED6] bg-white px-4 py-3 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              />
            </label>
            {deletionError && <p role="alert" className="text-sm text-red-700">{deletionError}</p>}
            <button
              type="submit"
              disabled={
                deletionPending ||
                deletionEmail.trim().toLowerCase() !== user.email.toLowerCase() ||
                deletionConfirmation !== 'ELIMINAR MI CUENTA' ||
                (user.authProvider === 'local' && !deletionPassword)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={17} />
              {deletionPending ? 'Eliminando cuenta…' : 'Eliminar mi cuenta definitivamente'}
            </button>
          </form>
        </section>
      )}

      {pending && (
        <VerifyModal
          user={user}
          change={pending}
          onCancel={() => setPending(null)}
          onVerified={handleVerified}
        />
      )}
    </div>
  );
};

export default AccountSettings;
