import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Plus, AtSign, Check } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { Avatar, Flag, Button } from "../components/ui";
import { PageShell } from "../components/layout";
import { getSessionUserId } from "../lib/backend";
import { supabase, userService } from "../lib/supabase";

const COUNTRIES = [
  { code: "tr", name: "Turkey" }, { code: "us", name: "United States" }, { code: "gb", name: "United Kingdom" },
  { code: "de", name: "Germany" }, { code: "es", name: "Spain" }, { code: "jp", name: "Japan" }, { code: "br", name: "Brazil" },
];
const INTEREST_POOL = ["Technology", "Movies", "Football", "Travel", "Music", "Cooking", "Gaming", "Books", "Fitness", "Art", "Photography", "Science"];
const BIO_LIMIT = 150;

async function deleteAvatarObject(url: string | null) {
  if (!url) return;
  const marker = "/storage/v1/object/public/media/";
  const index = url.indexOf(marker);
  if (index < 0) return;
  try {
    const path = decodeURIComponent(url.slice(index + marker.length));
    if (!path) return;
    const { error } = await supabase.storage.from("media").remove([path]);
    if (error) console.warn("Avatar file cleanup failed:", error.message);
  } catch (error) {
    console.warn("Avatar file cleanup failed:", error);
  }
}

export default function EditProfilePage() {
  const { user, pushToast, closePage } = useApp();
  const [name, setName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username.replace(/^@/, "").toLowerCase());
  const [bio, setBio] = useState(user.bio);
  const [country, setCountry] = useState(user.country);
  const [interests, setInterests] = useState<string[]>(user.interests);
  const [custom, setCustom] = useState("");
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl);
  const [usernameStatus, setUsernameStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== user.displayName || username !== user.username.replace(/^@/, "").toLowerCase() ||
    bio !== user.bio || country !== user.country || interests.join() !== user.interests.join();

  const checkUsername = async (notifyOnError = true) => {
    const candidate = username.trim().toLowerCase();
    if (candidate.length < 3 || candidate.length > 30) { setUsernameStatus("Use 3–30 characters"); return false; }
    if (candidate === user.username.replace(/^@/, "").toLowerCase()) { setUsernameStatus("Current username"); return true; }
    const uid = getSessionUserId();
    if (!uid) { setUsernameStatus("Sign in to check availability"); return false; }
    setUsernameStatus("Checking…");
    try {
      const { data, error } = await supabase.from("users").select("id")
        .eq("username", `@${candidate}`).neq("id", uid).maybeSingle();
      if (error) throw error;
      setUsernameStatus(data ? "Taken" : "Available");
      return !data;
    } catch (error) {
      setUsernameStatus("Check failed");
      if (notifyOnError) pushToast({ title: "Username check failed", desc: error instanceof Error ? error.message : "Try again.", icon: "alert", tone: "red" });
      return false;
    }
  };

  const save = async () => {
    const uid = getSessionUserId();
    const display = name.trim();
    const candidate = username.trim().toLowerCase();
    if (!uid) { pushToast({ title: "Sign in required", desc: "Profile changes need a real Supabase account.", icon: "alert", tone: "red" }); return; }
    if (display.length < 2 || display.length > 50) { pushToast({ title: "Invalid display name", desc: "Use a name between 2 and 50 characters.", icon: "alert", tone: "red" }); return; }
    if (!/^[a-z0-9_]{3,30}$/.test(candidate)) { pushToast({ title: "Invalid username", desc: "Use 3–30 letters, numbers or underscores.", icon: "alert", tone: "red" }); return; }
    if (bio.length > BIO_LIMIT) { pushToast({ title: "Bio is too long", desc: `Use ${BIO_LIMIT} characters or fewer.`, icon: "alert", tone: "red" }); return; }
    setSaving(true);
    try {
      if (!(await checkUsername(false))) throw new Error("That username is not available or could not be verified.");
      const countryCode = COUNTRIES.find((item) => item.name === country)?.code ?? user.flag;
      const patch = {
        display_name: display,
        username: `@${candidate}`,
        bio: bio.trim(),
        country,
        country_flag: countryCode,
        interests,
      };
      await userService.updateProfile(uid, patch);
      const initials = display.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
      useApp.setState((state) => ({ user: {
        ...state.user,
        displayName: display, firstName: display.split(/\s+/)[0], username: `@${candidate}`,
        bio: bio.trim(), country, flag: countryCode, initials, interests,
      } }));
      pushToast({ title: "Profile saved", desc: "Your changes were saved to your Supabase profile.", icon: "users", tone: "green" });
      closePage();
    } catch (error) {
      pushToast({ title: "Profile not saved", desc: error instanceof Error ? error.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File | null) => {
    if (!file) return;
    const uid = getSessionUserId();
    if (!uid) { pushToast({ title: "Sign in to change your photo", desc: "Profile photos are saved to your account.", icon: "alert", tone: "red" }); return; }
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      pushToast({ title: "Image not accepted", desc: "Choose an image smaller than 8 MB.", icon: "alert", tone: "red" }); return;
    }
    setUploadingAvatar(true);
    try {
      const previousAvatarUrl = user.avatarUrl;
      const avatarUrl = await userService.uploadAvatar(uid, file);
      try {
        await userService.updateProfile(uid, { avatar_url: avatarUrl });
      } catch (error) {
        await deleteAvatarObject(avatarUrl);
        throw error;
      }
      setAvatarPreview(avatarUrl);
      useApp.setState((state) => ({ user: { ...state.user, avatarUrl } }));
      if (previousAvatarUrl !== avatarUrl) await deleteAvatarObject(previousAvatarUrl);
      setAvatarSheet(false);
      pushToast({ title: "Profile photo updated", desc: "The photo is stored in your public profile image bucket.", icon: "users", tone: "green" });
    } catch (error) {
      pushToast({ title: "Photo not uploaded", desc: error instanceof Error ? error.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    const uid = getSessionUserId();
    if (!uid || !user.avatarUrl) return;
    setUploadingAvatar(true);
    try {
      await userService.updateProfile(uid, { avatar_url: null });
      setAvatarPreview(null);
      useApp.setState((state) => ({ user: { ...state.user, avatarUrl: null } }));
      await deleteAvatarObject(user.avatarUrl);
      setAvatarSheet(false);
      pushToast({ title: "Profile photo removed", desc: "Your initials avatar is now shown.", icon: "users", tone: "primary" });
    } catch (error) {
      pushToast({ title: "Photo not removed", desc: error instanceof Error ? error.message : "Try again.", icon: "alert", tone: "red" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <PageShell
      title="Edit Profile"
      sub="How other learners see you"
      right={
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          <Check className="size-4" strokeWidth={3} /> {saving ? "Saving…" : "Save"}
        </Button>
      }
    >
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { void uploadAvatar(e.currentTarget.files?.[0] ?? null); e.currentTarget.value = ""; }} />
        <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadAvatar(e.currentTarget.files?.[0] ?? null); e.currentTarget.value = ""; }} />
        {/* avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar initials={name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || user.initials} color={user.color} size={104} src={avatarPreview} online />
            <button
              onClick={() => setAvatarSheet(true)}
              className="absolute -bottom-1 -right-1 grid size-9 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-white shadow-lift ring-4 ring-bg transition hover:brightness-110"
            >
              <Camera className="size-4" />
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold text-fg-ter">Tap the camera to change your photo</p>
        </div>

        {/* fields */}
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-fg-sec">Display name</span>
          <input
            value={name} onChange={(e) => setName(e.target.value)} maxLength={50}
            className="h-13 w-full rounded-2xl border-2 border-border bg-card px-4 text-sm font-semibold text-fg outline-none transition focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-fg-sec">Username</span>
          <span className="flex h-13 items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 transition focus-within:border-primary/60">
            <AtSign className="size-4 text-fg-ter" />
            <input
              value={username} onChange={(e) => { setUsername(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase()); setUsernameStatus(""); }}
              onBlur={() => void checkUsername()}
              maxLength={30}
              className="h-full w-full bg-transparent text-sm font-semibold text-fg outline-none"
            />
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", usernameStatus === "Available" || usernameStatus === "Current username" ? "bg-green/12 text-green" : usernameStatus === "Taken" ? "bg-red/12 text-red" : "bg-bg-sec text-fg-ter")}>{usernameStatus || "Check on blur"}</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-bold">
            <span className="text-fg-sec">Bio</span>
            <span className={cn("font-mono", bio.length > BIO_LIMIT ? "text-red" : "text-fg-ter")}>{bio.length}/{BIO_LIMIT}</span>
          </span>
          <textarea
            value={bio} onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))} maxLength={BIO_LIMIT} rows={3}
            className="w-full resize-none rounded-2xl border-2 border-border bg-card p-4 text-sm text-fg outline-none transition focus:border-primary/60"
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-bold text-fg-sec">Country</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setCountry(c.name)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-2xl border-2 p-2.5 text-left transition",
                  country === c.name ? "border-primary bg-primary-faint" : "border-border hover:border-primary/40"
                )}
              >
                <Flag code={c.code} size={18} />
                <span className="truncate text-[12.5px] font-bold text-fg">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* interests */}
        <div>
          <span className="mb-1.5 block text-xs font-bold text-fg-sec">Interests — partners with shared interests match better</span>
          <div className="flex flex-wrap gap-2">
            {INTEREST_POOL.map((t) => {
              const on = interests.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => setInterests(on ? interests.filter((x) => x !== t) : [...interests, t])}
                  className={cn(
                    "cursor-pointer rounded-full border px-3.5 py-2 text-[12px] font-bold transition",
                    on ? "border-primary bg-primary text-white shadow-lift" : "border-border bg-card text-fg-sec hover:border-primary/50"
                  )}
                >
                  {t}
                </button>
              );
            })}
            {interests.filter((i) => !INTEREST_POOL.includes(i)).map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border border-primary bg-primary px-3 py-2 text-[12px] font-bold text-white">
                {t}
                <button onClick={() => setInterests(interests.filter((x) => x !== t))} className="cursor-pointer"><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) {
                  setInterests([...new Set([...interests, custom.trim()])]);
                  setCustom("");
                }
              }}
              placeholder="Add your own interest…"
              className="h-11 flex-1 rounded-2xl border-2 border-border bg-card px-4 text-[13px] font-semibold outline-none transition placeholder:text-fg-ter focus:border-primary/60"
            />
            <Button
              size="icon" variant="soft"
              disabled={!custom.trim()}
              onClick={() => { setInterests([...new Set([...interests, custom.trim()])]); setCustom(""); }}
            >
              <Plus className="size-4.5" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2.5 pb-4">
          <Button variant="outline" className="flex-1" onClick={closePage}>Cancel</Button>
          <Button className="flex-1" disabled={!dirty || saving} onClick={() => void save()}>
            <Check className="size-4.5" strokeWidth={3} /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* avatar sheet */}
      <AnimatePresence>
        {avatarSheet && (
          <motion.div className="fixed inset-0 z-[160] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setAvatarSheet(false)} />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="relative w-full max-w-sm rounded-t-[28px] bg-card p-5 pb-8 shadow-lift"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
              <button disabled={uploadingAvatar} onClick={() => cameraInputRef.current?.click()} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-display text-[14px] font-bold transition hover:bg-bg-sec disabled:opacity-60">
                <Camera className="size-4.5" /> Take photo
              </button>
              <button disabled={uploadingAvatar} onClick={() => libraryInputRef.current?.click()} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-display text-[14px] font-bold transition hover:bg-bg-sec disabled:opacity-60">
                <Camera className="size-4.5" /> Choose from library
              </button>
              <button disabled={uploadingAvatar || !user.avatarUrl} onClick={() => void removeAvatar()} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-display text-[14px] font-bold text-red transition hover:bg-bg-sec disabled:cursor-not-allowed disabled:opacity-50">
                <X className="size-4.5" /> Remove photo
              </button>
              {uploadingAvatar && <p className="px-4 pt-2 text-xs font-semibold text-fg-ter">Updating profile photo…</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
