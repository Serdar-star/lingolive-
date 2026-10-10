import { useState } from "react";
import { motion } from "framer-motion";
import {
  Mail, Lock, Eye, EyeOff, User, Check, Loader2, Languages, Users, Globe, Star,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { Flag } from "../components/ui";
import {
  backendContinueSession, backendOAuth, backendReady, backendResetPassword,
  backendSignIn, backendSignUp, backendUpdatePassword,
} from "../lib/backend";

/* stagger entrance */
const item = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }),
};

function Field({
  label, right, icon: Icon, error, children,
}: { label: string; right?: React.ReactNode; icon: typeof Mail; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold text-fg-sec">{label}</span>
        {right}
      </span>
      <span className={cn(
        "flex h-14 items-center gap-3 rounded-2xl border-2 bg-card px-4 transition-all duration-150",
        error ? "border-red/70" : "border-border focus-within:border-primary/70 focus-within:shadow-[0_0_0_4px_var(--primary-faint)]"
      )}>
        <Icon className={cn("size-[18px] shrink-0", error ? "text-red" : "text-fg-ter")} />
        {children}
      </span>
      {error && <span className="mt-1.5 block text-[11px] font-bold text-red">{error}</span>}
    </label>
  );
}

export default function AuthScreen({ mode }: { mode: "login" | "register" | "reset" }) {
  const { setAuthStage, pushToast, setTab } = useApp();
  const isLogin = mode === "login";
  const isReset = mode === "reset";
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [terms, setTerms] = useState(false);
  const [recoveryRequest, setRecoveryRequest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const strength = pass.length === 0 ? 0 : pass.length <= 5 ? 1 : pass.length <= 8 ? 2 : pass.length <= 11 ? 3 : 4;
  const strengthColors = ["var(--border)", "#FF6B6B", "#FFA502", "#F8B500", "#2ED573"];

  const submit = async () => {
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const e: Record<string, string> = {};

    if (isLogin && recoveryRequest) {
      if (!emailIsValid) e.email = "Enter a valid email address";
      setErrors(e);
      if (Object.keys(e).length) return;
      setLoading(true);
      try {
        await backendResetPassword(email.trim());
        setRecoveryRequest(false);
        pushToast({
          title: "Check your inbox",
          desc: "If an account uses that address, a password reset link is on its way.",
          icon: "mail", tone: "green",
        });
      } catch (err) {
        setErrors({ email: err instanceof Error ? err.message : "Could not request a password reset." });
      } finally { setLoading(false); }
      return;
    }

    if (isReset) {
      if (pass.length < 8) e.pass = "Use at least 8 characters for your new password";
      if (confirmPass !== pass) e.confirmPass = "Passwords do not match";
      setErrors(e);
      if (Object.keys(e).length) return;
      setLoading(true);
      try {
        await backendUpdatePassword(pass);
        await backendContinueSession();
        pushToast({ title: "Password updated", desc: "Your account is ready to use again.", icon: "lock", tone: "green" });
      } catch (err) {
        setErrors({ pass: err instanceof Error ? err.message : "Could not update your password." });
      } finally { setLoading(false); }
      return;
    }

    if (isRegister && name.trim().length < 2) e.name = "Please enter your name";
    if (!emailIsValid) e.email = "Enter a valid email address";
    if (pass.length < 6) e.pass = "Password must be at least 6 characters";
    if (isRegister && !terms) e.terms = "Please accept the terms to continue";
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!backendReady()) {
      setErrors({ auth: "Supabase is not configured. Add the project URL and anon key before creating an account." });
      return;
    }

    setLoading(true);
    try {
      const { onboarding } = useApp.getState();
      if (isLogin) {
        await backendSignIn(email.trim(), pass);
      } else {
        const res = await backendSignUp({
          email: email.trim(), password: pass, displayName: name.trim(),
          nativeLanguage: onboarding?.native ?? "Turkish",
          targetLanguage: onboarding?.target ?? "English",
          level: onboarding?.level ?? "B1",
          dailyGoalMinutes: onboarding?.dailyMin ?? 15,
          country: "Turkey", countryFlag: "tr",
          interests: onboarding?.goals ?? [],
        });
        if (!res?.session) {
          pushToast({
            title: "Check your inbox",
            desc: "We sent a confirmation link — open it to verify your address, then log in here.",
            icon: "mail", tone: "primary",
          });
          setAuthStage("login");
          return;
        }
      }
      setTab("home");
      setAuthStage("app");
      pushToast({
        title: isLogin ? "Welcome back!" : "Account created!",
        desc: isLogin ? "Your profile synced from the cloud" : "Your profile is ready — let's learn!",
        icon: "sparkles", tone: "green",
      });
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : "Authentication failed. Please try again." });
    } finally { setLoading(false); }
  };

  const social = async (provider: "google" | "apple") => {
    if (!backendReady()) {
      pushToast({ title: "Sign-in provider unavailable", desc: "Connect Supabase and enable this OAuth provider first.", icon: "globe", tone: "red" });
      return;
    }
    setLoading(true);
    try { await backendOAuth(provider); }
    catch (err) {
      setLoading(false);
      pushToast({ title: `${provider === "google" ? "Google" : "Apple"} sign-in failed`, desc: err instanceof Error ? err.message : "Try email and password instead.", icon: "globe", tone: "red" });
    }
  };

  return (
    <motion.div className="flex min-h-dvh bg-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* left brand panel (desktop) */}
      <div className="relative hidden w-[46%] overflow-hidden lg:block" style={{ background: "linear-gradient(150deg,#221a5e 0%,#6C5CE7 55%,#00bfc0 135%)" }}>
        <div className="absolute inset-0 dotgrid opacity-20" />
        {[
          { c: "gb", l: "12%", t: "16%", d: "0s" }, { c: "es", l: "78%", t: "10%", d: "0.6s" },
          { c: "jp", l: "84%", t: "62%", d: "1.2s" }, { c: "br", l: "8%", t: "70%", d: "1.8s" },
          { c: "de", l: "45%", t: "86%", d: "2.4s" }, { c: "tr", l: "62%", t: "38%", d: "3s" },
        ].map((f) => (
          <span key={f.c} className="absolute anim-floaty rounded-full bg-white/15 p-1 backdrop-blur" style={{ left: f.l, top: f.t, animationDelay: f.d }}>
            <Flag code={f.c} size={34} />
          </span>
        ))}
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <div className="grid size-11 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
              <Languages className="size-6 text-white" />
            </div>
            <span className="font-display text-xl font-extrabold text-white">LingoLive</span>
          </div>
          <div>
            <h2 className="max-w-md font-display text-4xl font-extrabold leading-tight tracking-tight text-white">
              Learn by living the language.
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
              Vocabulary practice, structured lessons, and conversation tools — all in one app.
            </p>
            <div className="mt-8 flex gap-3">
              {[
                { icon: Users, t: "Conversation tools" }, { icon: Globe, t: "15 supported languages" }, { icon: Star, t: "Interactive lessons" },
              ].map((s) => (
                <span key={s.t} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-xs font-bold text-white backdrop-blur">
                  <s.icon className="size-3.5" /> {s.t}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/40">© 2026 LingoLive · Made for the world</p>
        </div>
      </div>

      {/* form side */}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
        <div className="pointer-events-none absolute -top-24 left-1/4 size-80 rounded-full bg-primary/10 blur-[110px] lg:hidden" />
        <div className="w-full max-w-[400px]">
          <motion.div custom={0} variants={item} initial="hidden" animate="show"
            className="grid size-14 place-items-center rounded-2xl text-white shadow-lift"
            style={{ background: "linear-gradient(135deg,#6C5CE7 0%,#5a4fd8 55%,#00bfc0 130%)" }}
          >
            <Languages className="size-7" strokeWidth={2.2} />
          </motion.div>

          <motion.h1 custom={1} variants={item} initial="hidden" animate="show" className="mt-6 font-display text-[28px] font-extrabold tracking-tight text-fg">
            {isReset ? "Set a new password" : recoveryRequest ? "Reset your password" : isLogin ? "Welcome back!" : "Create account"}
          </motion.h1>
          <motion.p custom={1.5} variants={item} initial="hidden" animate="show" className="mt-1.5 text-sm text-fg-sec">
            {isReset ? "Choose a new password for your LingoLive account" : recoveryRequest ? "We'll send a secure reset link to your email" : isLogin ? "Log in to continue your journey" : "Start your language journey today — it's free"}
          </motion.p>
          {errors.auth && <p className="mt-3 rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-xs font-semibold text-red">{errors.auth}</p>}

          <div className="mt-8 flex flex-col gap-4">
            {isRegister && (
              <motion.div custom={2} variants={item} initial="hidden" animate="show">
                <Field label="Full name" icon={User} error={errors.name}>
                  <input
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ahmet Yilmaz"
                    className="h-full w-full bg-transparent text-sm font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-ter"
                  />
                </Field>
              </motion.div>
            )}

            {!isReset && (
              <motion.div custom={2.5} variants={item} initial="hidden" animate="show">
                <Field label="Email" icon={Mail} error={errors.email}>
                  <input
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    type="email" placeholder="you@email.com" autoComplete="email"
                    className="h-full w-full bg-transparent text-sm font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-ter"
                  />
                </Field>
              </motion.div>
            )}

            {!recoveryRequest && (
              <motion.div custom={3} variants={item} initial="hidden" animate="show">
                <Field
                  label={isReset ? "New password" : "Password"}
                  icon={Lock}
                  error={errors.pass}
                  right={isLogin ? (
                    <button
                      className="cursor-pointer text-[11px] font-bold text-primary hover:underline"
                      type="button"
                      onClick={() => { setErrors({}); setRecoveryRequest(true); }}
                    >Forgot password?</button>
                  ) : undefined}
                >
                  <input
                    value={pass} onChange={(e) => setPass(e.target.value)}
                    type={showPass ? "text" : "password"} placeholder="••••••••"
                    autoComplete={isReset ? "new-password" : isLogin ? "current-password" : "new-password"}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    className="h-full w-full bg-transparent text-sm font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-ter"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="cursor-pointer text-fg-ter transition hover:text-fg">
                    {showPass ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                  </button>
                </Field>
                {isRegister && (
                  <div className="mt-2 flex gap-1.5">
                    {[1, 2, 3, 4].map((s) => (
                      <span
                        key={s}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ background: s <= strength ? strengthColors[strength] : "var(--border)" }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {isReset && (
              <motion.div custom={3.5} variants={item} initial="hidden" animate="show">
                <Field label="Confirm new password" icon={Lock} error={errors.confirmPass}>
                  <input
                    value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                    type={showPass ? "text" : "password"} placeholder="••••••••"
                    autoComplete="new-password"
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    className="h-full w-full bg-transparent text-sm font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-ter"
                  />
                </Field>
              </motion.div>
            )}

            {isRegister && (
              <motion.div custom={3.5} variants={item} initial="hidden" animate="show">
                <button onClick={() => setTerms(!terms)} className="flex cursor-pointer items-start gap-3 text-left">
                  <span className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-all",
                    terms ? "border-transparent bg-gradient-to-br from-primary to-primary-strong" : errors.terms ? "border-red" : "border-border"
                  )}>
                    {terms && <Check className="size-3.5 text-white" strokeWidth={3.5} />}
                  </span>
                  <span className="text-[13px] leading-snug text-fg-sec">
                    I agree to the <span className="font-bold text-primary">Terms of Service</span> and{" "}
                    <span className="font-bold text-primary">Privacy Policy</span>
                  </span>
                </button>
                {errors.terms && <span className="mt-1.5 block text-[11px] font-bold text-red">{errors.terms}</span>}
              </motion.div>
            )}

            <motion.button
              custom={4} variants={item} initial="hidden" animate="show"
              whileTap={{ scale: 0.97 }}
              onClick={submit}
              disabled={loading}
              className="mt-2 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-strong font-display text-base font-extrabold text-white shadow-lift transition hover:brightness-110 disabled:opacity-70"
            >
              {loading && <Loader2 className="size-5 animate-spin" />}
              {isReset ? "Update password" : recoveryRequest ? "Send reset link" : isLogin ? "Log In" : "Sign Up"}
            </motion.button>

            {!isReset && !recoveryRequest && (
              <>
                <motion.div custom={4.5} variants={item} initial="hidden" animate="show" className="mt-2 flex items-center gap-4">
                  <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-fg-ter">or continue with</span>
              <span className="h-px flex-1 bg-border" />
            </motion.div>

            <motion.div custom={5} variants={item} initial="hidden" animate="show" className="flex gap-3">
              <button
                onClick={() => void social("google")}
                className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-border bg-card font-display text-sm font-bold text-fg transition hover:border-primary/40 hover:bg-card-sec"
              >
                <svg viewBox="0 0 24 24" className="size-5"><path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.46 1.8 14.96.75 12 .75 7.7.75 3.99 3.22 2.18 6.87l3.66 2.84C6.7 7.1 9.1 5.04 12 5.04z"/><path fill="#4285F4" d="M23.5 12.27c0-.9-.08-1.55-.25-2.23H12v4.05h6.44c-.13 1.07-.83 2.68-2.39 3.76l3.57 2.77c2.17-2 3.88-4.96 3.88-8.35z"/><path fill="#FBBC05" d="M5.85 14.29a6.9 6.9 0 0 1-.38-2.29c0-.8.14-1.57.36-2.29L2.17 6.87A11.22 11.22 0 0 0 .96 12c0 1.81.44 3.52 1.21 5.04l3.68-2.75z"/><path fill="#34A853" d="M12 23.25c3.04 0 5.6-1 7.46-2.73l-3.57-2.77c-.95.66-2.23 1.12-3.89 1.12-2.9 0-5.3-1.95-6.16-4.67l-3.66 2.84c1.8 3.62 5.5 6.21 9.82 6.21z"/></svg>
                Google
              </button>

                </motion.div>
              </>
            )}

            {isReset || recoveryRequest ? (
              <motion.p custom={5.5} variants={item} initial="hidden" animate="show" className="mt-4 text-center text-[13px] text-fg-sec">
                <button
                  onClick={() => {
                    setErrors({});
                    if (isReset) setAuthStage("login");
                    else setRecoveryRequest(false);
                  }}
                  className="cursor-pointer font-display font-extrabold text-primary hover:underline"
                >Back to sign in</button>
              </motion.p>
            ) : (
              <motion.p custom={5.5} variants={item} initial="hidden" animate="show" className="mt-4 text-center text-[13px] text-fg-sec">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  onClick={() => setAuthStage(isLogin ? "register" : "login")}
                  className="cursor-pointer font-display font-extrabold text-primary hover:underline"
                >
                  {isLogin ? "Sign up →" : "Log in"}
                </button>
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
