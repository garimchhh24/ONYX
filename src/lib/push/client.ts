'use client';

import { accessToken } from '../supabase/browser';

export interface PushSupport {
  notifications: boolean;
  push: boolean;
  serviceWorker: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
  /** iOS Safari only allows Web Push for apps added to the Home Screen (iOS 16.4+). */
  needsInstall: boolean;
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return { notifications: false, push: false, serviceWorker: false, ios: false, standalone: false, permission: 'unsupported', needsInstall: false };
  }
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const notifications = 'Notification' in window;
  const push = 'PushManager' in window;
  return {
    notifications,
    push,
    serviceWorker: 'serviceWorker' in navigator,
    ios,
    standalone,
    permission: notifications ? Notification.permission : 'unsupported',
    needsInstall: ios && !standalone,
  };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Subscribe this device to server-sent reminders (requires a signed-in account). */
export async function subscribePush(vapidPublicKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  }
  const res = await fetch('/api/push/subscribe', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Subscription failed (${res.status})`);
  }
  try {
    localStorage.setItem('cadence-push', '1');
  } catch {
    /* ignore */
  }
}

export async function unsubscribePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    await sub.unsubscribe();
  }
  try {
    localStorage.removeItem('cadence-push');
  } catch {
    /* ignore */
  }
}

export async function sendTestPush(): Promise<void> {
  const res = await fetch('/api/push/test', { method: 'POST', headers: await authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Test failed (${res.status})`);
  }
}

/** Local notification through the service worker (used by the in-app scheduler and tests). */
export async function showLocalNotification(title: string, body: string, url = '/journal?filter=unjournaled'): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options: NotificationOptions & { data?: unknown } = { body, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: 'cadence-reminder', data: { url } };
  // Prefer the service worker (required on mobile); wait briefly for it to become active.
  const reg = navigator.serviceWorker
    ? await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))])
    : null;
  if (reg?.active) {
    await reg.showNotification(title, options);
    return true;
  }
  new Notification(title, options);
  return true;
}
