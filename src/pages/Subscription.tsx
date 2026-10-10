import { CreditCard, ShieldCheck, CircleHelp, LockKeyhole, Ban } from "lucide-react";
import { useApp } from "../store/store";
import { Card, Button } from "../components/ui";
import { PageShell } from "../components/layout";
import { getSessionUserId } from "../lib/backend";

export default function SubscriptionPage() {
  const { user } = useApp();
  const hasLiveAccount = Boolean(getSessionUserId());

  return (
    <PageShell title="Subscription" sub="Account tier · billing is not connected">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Card className="relative overflow-hidden border-primary/20 p-6 sm:p-8">
          <div className="absolute -right-12 -top-14 size-44 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-faint text-primary"><CreditCard className="size-6" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Subscription status</p>
              <h2 className="mt-1 font-display text-2xl font-extrabold text-fg">Payments are unavailable</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-sec">This build has no checkout or billing provider connected. You cannot start a trial, purchase a plan, change your tier, or manage a payment method here.</p>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg-sec/75 p-4">
            <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-fg-ter">Tier on this profile</p><p className="mt-1 font-display text-lg font-extrabold text-fg">{hasLiveAccount ? user.tier : `${user.tier} · demo value`}</p></div>
            <Button variant="outline" disabled aria-disabled="true">Plan changes unavailable</Button>
          </div>
          {!hasLiveAccount && <p className="relative mt-3 text-xs leading-relaxed text-fg-ter">You are viewing sample profile data; this tier is not a verified subscription.</p>}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-green" /><h3 className="font-display text-base font-extrabold text-fg">What this means</h3></div>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-fg-sec">
            <li className="flex gap-2"><span className="font-bold text-green">•</span><span>No charge or free trial can be started from this screen.</span></li>
            <li className="flex gap-2"><span className="font-bold text-green">•</span><span>The tier shown above is profile metadata; it is not proof of an active payment or entitlement.</span></li>
            <li className="flex gap-2"><span className="font-bold text-green">•</span><span>This build does not enforce plan-specific feature limits. Availability depends on the app and service configuration.</span></li>
          </ul>
        </Card>

        <Card className="border-dashed p-5 sm:p-6">
          <div className="flex items-center gap-3"><Ban className="size-5 text-fg-ter" /><h3 className="font-display text-base font-extrabold text-fg">Not available here</h3></div>
          <p className="mt-2 text-sm leading-relaxed text-fg-sec">Pricing, trials, checkout, cancellation, invoices, gifts, and paid-plan entitlements have not been connected. No prices or feature promises are shown until those systems are configured.</p>
        </Card>

        <Card className="flex items-start gap-3 p-5">
          <CircleHelp className="mt-0.5 size-5 shrink-0 text-primary" />
          <div><h3 className="font-display text-sm font-extrabold text-fg">Need help?</h3><p className="mt-1 text-sm leading-relaxed text-fg-sec">If your account tier looks wrong, contact the app administrator. Do not rely on this page for billing or entitlement status.</p></div>
        </Card>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] font-semibold text-fg-ter"><LockKeyhole className="size-3.5" /> No payment details are collected on this page.</p>
      </div>
    </PageShell>
  );
}
