'use client';

import { ArrowRight, KeyRound, Mail, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Lockup } from '@/components/brand/Logo';
import { Button, Field, Input, Notice, Segmented } from '@/components/ui/core';
import { useAuth } from '@/lib/auth/AuthProvider';

type Mode = 'password' | 'code' | 'signup';

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.enabled || (auth.ready && auth.user)) router.replace('/');
  }, [auth.enabled, auth.ready, auth.user, router]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'password') return run(() => auth.signInWithPassword(email, password));
    if (mode === 'signup')
      return run(async () => {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const r = await auth.signUp(email, password);
        if (r.needsConfirmation) setInfo('Check your inbox to confirm your email, then sign in here.');
      });
    if (!codeSent)
      return run(async () => {
        await auth.sendCode(email);
        setCodeSent(true);
        setInfo('We emailed you a 6-digit code.');
      });
    return run(() => auth.verifyCode(email, code));
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute left-1/2 top-[18%] size-[520px] -translate-x-1/2 rounded-full bg-electric/20 blur-[120px]" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-[400px]">
        <div className="mb-10 flex justify-center">
          <Lockup size="lg" stacked tagline />
        </div>
        <div className="panel panel-glow p-6">
          <Segmented<Mode>
            className="mb-6 w-full"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            options={[
              { value: 'password', label: 'Sign in' },
              { value: 'code', label: 'Email code' },
              { value: 'signup', label: 'Create account' },
            ]}
          />
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
            </Field>
            <AnimatePresence mode="wait" initial={false}>
              {mode !== 'code' ? (
                <motion.div key="pw" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Field label="Password" htmlFor="password">
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                </motion.div>
              ) : codeSent ? (
                <motion.div key="code" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Field label="6-digit code" htmlFor="otp" hint="Works inside the installed app — no link to open.">
                    <Input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required value={code} onChange={(e) => setCode(e.target.value)} className="num tracking-[0.4em]" />
                  </Field>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {error && <Notice tone="neg">{error}</Notice>}
            {info && <Notice tone="violet">{info}</Notice>}
            <Button type="submit" variant="primary" size="lg" full loading={busy} icon={mode === 'code' ? <Mail className="size-4" /> : <KeyRound className="size-4" />}>
              {mode === 'password' ? 'Sign in' : mode === 'signup' ? 'Create account' : codeSent ? 'Verify code' : 'Email me a code'}
            </Button>
          </form>
        </div>
        <button
          type="button"
          onClick={() => {
            auth.continueLocally();
            router.replace('/');
          }}
          className="mx-auto mt-6 flex items-center gap-2 text-[13px] text-mute transition hover:text-fg"
        >
          <Smartphone className="size-4" /> Continue without an account (this device only) <ArrowRight className="size-3.5" />
        </button>
      </motion.div>
    </div>
  );
}
