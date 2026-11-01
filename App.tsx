import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "./style.css";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthScreen } from "./AuthScreen";
import { censorProfanity } from "./profanity";
import { Icon } from "./icons.filename";
import { ExplorePage, AdminPage, InvitePreviewCard } from "./DiscoveryPages";

type Reaction = { emoji: string; count: number; reacted: boolean };

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";
function twemojiAsset(emoji: string) {
  const codepoints = Array.from(emoji).map(char => char.codePointAt(0)!.toString(16)).filter(code => code !== "fe0f");
  return TWEMOJI_BASE + codepoints.join("-") + ".svg";
}
function Twemoji({ emoji, className = "" }: { emoji: string; className?: string }) {
  return <img className={`twemoji ${className}`} src={twemojiAsset(emoji)} alt={emoji} draggable={false} loading="lazy" />;
}
const REACTION_EMOJI = [
  ["Smileys", [["😀","grinning"],["😃","smiley"],["😄","smile"],["😁","grin"],["😆","laughing"],["😅","sweat smile"],["😂","joy"],["🤣","rofl"],["😊","blush"],["😇","innocent"],["🙂","slightly smiling"],["🙃","upside down"],["😉","wink"],["😍","heart eyes"],["🥰","smiling hearts"],["😘","kiss"],["😋","yum"],["😎","sunglasses"],["🤔","thinking"],["🫡","salute"],["🤗","hug"],["😭","sob"],["🥹","teary"],["😡","angry"],["🤯","mind blown"],["🥳","party"],["🤩","star struck"],["😴","sleeping"],["🤫","shush"],["🫠","melting"]]],
  ["Gestures", [["👋","wave"],["🤚","raised hand"],["🖐️","hand"],["✋","stop"],["👌","ok"],["🤌","pinched fingers"],["✌️","peace"],["🤞","crossed fingers"],["🫶","heart hands"],["🤟","love you"],["🤘","rock"],["🤙","call me"],["👈","point left"],["👉","point right"],["👆","point up"],["👇","point down"],["☝️","index up"],["👍","thumbs up"],["👎","thumbs down"],["✊","fist"],["👊","punch"],["👏","clap"],["🙌","raised hands"],["👐","open hands"],["🙏","pray"],["💪","muscle"],["🫵","point at you"]]],
  ["Hearts", [["❤️","red heart"],["🧡","orange heart"],["💛","yellow heart"],["💚","green heart"],["💙","blue heart"],["💜","purple heart"],["🖤","black heart"],["🤍","white heart"],["🤎","brown heart"],["🩷","pink heart"],["🩵","light blue heart"],["🩶","grey heart"],["💔","broken heart"],["💕","two hearts"],["💞","revolving hearts"],["💖","sparkling heart"],["💗","growing heart"],["💘","cupid"],["💝","gift heart"],["❤️‍🔥","heart on fire"]]],
  ["Celebration", [["🎉","party popper"],["🎊","confetti"],["🎈","balloon"],["🎂","birthday"],["🏆","trophy"],["🥇","gold medal"],["⭐","star"],["🌟","glowing star"],["✨","sparkles"],["🔥","fire"],["💯","hundred"],["🚀","rocket"],["💎","gem"],["👑","crown"],["🎯","target"],["💥","collision"],["⚡","lightning"],["☀️","sun"],["🌈","rainbow"],["🍀","four leaf clover"]]],
  ["Animals", [["🐶","dog"],["🐱","cat"],["🐭","mouse"],["🐹","hamster"],["🐰","rabbit"],["🦊","fox"],["🐻","bear"],["🐼","panda"],["🐨","koala"],["🐯","tiger"],["🦁","lion"],["🐸","frog"],["🐵","monkey"],["🐧","penguin"],["🐦","bird"],["🦄","unicorn"],["🐝","bee"],["🦋","butterfly"],["🐢","turtle"],["🐬","dolphin"]]],
  ["Food", [["🍎","apple"],["🍊","orange"],["🍋","lemon"],["🍉","watermelon"],["🍇","grapes"],["🍓","strawberry"],["🫐","blueberries"],["🍒","cherries"],["🍍","pineapple"],["🥑","avocado"],["🍕","pizza"],["🍔","burger"],["🍟","fries"],["🌮","taco"],["🍩","donut"],["🍪","cookie"],["🎂","cake"],["☕","coffee"],["🧋","bubble tea"],["🍿","popcorn"]]],
  ["Activities", [["⚽","soccer"],["🏀","basketball"],["🏈","football"],["⚾","baseball"],["🎮","video game"],["🎧","headphones"],["🎵","music"],["🎤","microphone"],["🎬","clapper"],["🎨","art"],["🎲","game die"],["♟️","chess"],["🏹","archery"],["🏋️","lifting"],["🚴","cycling"]]],
  ["Symbols", [["✅","check"],["❌","cross mark"],["❗","exclamation"],["❓","question"],["💤","sleep"],["💬","speech"],["💭","thought"],["🔔","bell"],["🔒","lock"],["❤️","heart"],["♻️","recycle"],["☢️","radioactive"],["🚫","prohibited"],["➕","plus"],["➖","minus"],["🔝","top"],["🔞","18 plus"],["🆗","OK"],["🆒","cool"],["🆙","up"]]]
] as const;
function EmojiPicker({ onSelect, buttonLabel = "Add reaction" }: { onSelect: (emoji: string) => void; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLowerCase();
  const options = REACTION_EMOJI.flatMap(([, entries]) => entries
    .filter(([emoji, label]) => !normalized || label.includes(normalized) || emoji.includes(query.trim()))
    .map(([emoji, label]) => ({ emoji, label })));
  const choose = (emoji: string) => { onSelect(emoji); setOpen(false); setQuery(""); setCustomEmoji(""); };
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(330, window.innerWidth - 24);
      const maxHeight = Math.min(390, window.innerHeight - 24);
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const above = anchor.top > maxHeight + 16;
      const top = above
        ? Math.max(12, anchor.top - maxHeight - 9)
        : Math.min(window.innerHeight - maxHeight - 12, anchor.bottom + 9);
      setPosition({ left, top, maxHeight });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !pickerRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    updatePosition();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);
  return <div className="emoji-picker-wrap">
    <button ref={triggerRef} type="button" className="message-reaction-trigger" onClick={() => setOpen(value => !value)} title={buttonLabel} aria-label={buttonLabel} aria-expanded={open}><Twemoji emoji="🙂" /></button>
    {open && position && createPortal(<div ref={pickerRef} className="emoji-picker" role="dialog" aria-label="Choose an emoji" style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}>
      <div className="emoji-picker-heading"><strong>Choose an emoji</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close emoji picker">×</button></div>
      <input className="emoji-picker-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search emoji" aria-label="Search emoji" autoFocus />
      <div className="emoji-picker-grid" role="list" aria-label="Emoji">
        {options.map(({emoji,label}) => <button type="button" key={emoji + label} title={label} aria-label={label} onClick={() => choose(emoji)}><Twemoji emoji={emoji} /></button>)}
        {!options.length && <span className="emoji-picker-empty">No matching emoji</span>}
      </div>
      <form className="emoji-picker-custom" onSubmit={event => { event.preventDefault(); const value = customEmoji.trim(); if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(value)) choose(value); }}>
        <input value={customEmoji} onChange={event => setCustomEmoji(event.target.value)} placeholder="Or paste any emoji…" aria-label="Paste any emoji" />
        <button type="submit" disabled={!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(customEmoji)}>React</button>
      </form>
    </div>, document.body)}
  </div>;
}
type Attachment = { path: string; name: string; mimeType: string; size: number; url?: string };
type Message = { id: string; publicId?: string; author: string; text: string; time: string; timestamp?: string; editedAt?: string; own?: boolean; reactions?: Reaction[]; replyTo?: { author: string; text: string }; attachments?: Attachment[] };
type PresenceStatus = "Online" | "Idle" | "Do not disturb" | "Offline";
type Person = { id: string; publicId?: string; name: string; online: boolean; status?: PresenceStatus; color: string; preview: string; avatarUrl?: string | null; bio?: string | null; isFriend?: boolean; hasConversation?: boolean };
type Server = { id: string; publicId?: string; name: string; description: string; createdBy?: string; inviteCode?: string; iconUrl?: string | null; bannerUrl?: string | null; role?: "owner" | "admin" | "member" };
type ServerRole = { id: string; server_id: string; name: string; color: string; position: number; permissions: { manage_server?: boolean; manage_roles?: boolean; manage_channels?: boolean; kick_members?: boolean; manage_messages?: boolean; manage_threads?: boolean; publish_announcements?: boolean; manage_announcements?: boolean; reorder_categories_channels?: boolean; mention_roles?: boolean; mention_everyone?: boolean; mention_here?: boolean }; allow_anyone_to_mention?: boolean };
type MentionToken = { type: "user" | "role" | "everyone" | "here"; id?: string };
type MentionSuggestion = { type: "user" | "role" | "everyone" | "here"; id?: string; label: string; detail: string };
type FriendRequest = { id: string; requester_id: string; addressee_id: string; name: string; avatarUrl?: string | null };
type AppNotification = { id: string; actor_id: string | null; type: string; title: string; body: string; entity_id: string | null; read_at: string | null; created_at: string; interruptive?: boolean };

// Keep message activity in the inbox, but do not interrupt users with a toast for it.
function isMessageActivityNotification(notification: AppNotification) {
  return notification.type === "message" || /\b(sent a message|message sent)\b/i.test(`${notification.title} ${notification.body}`);
}
type Channel = { id: string; publicId?: string; name: string; description: string; serverId?: string; category?: string; categoryId?: string | null; position?: number; channelType?: "text" | "announcement" | "forum"; permissionsSynced?: boolean };
type ContextMenuTarget = { kind: "person"; person: Person } | { kind: "server"; server: Server } | { kind: "channel"; channel: Channel } | { kind: "message"; message: Message } | { kind: "channels" };
type ContextMenuState = { x: number; y: number } & ContextMenuTarget;
type VoaxReportTarget = { target_type: "account"; target_user_id: string; snapshot: Record<string, unknown> } | { target_type: "message"; target_message_id: string; snapshot: Record<string, unknown> } | { target_type: "server"; target_server_id: string; snapshot: Record<string, unknown> };
type SavedState = {
  name: string; status: string; active: string; view: "channel" | "dm" | "friends" | "home";
  channels: Channel[]; servers?: Server[]; activeServer?: string; people: Person[]; messages: Record<string, Message[]>;
  compact: boolean; unread?: Record<string, number>;
};

const KEY = "voax.v2";
function readSaved(): SavedState | null {
  try { const value = localStorage.getItem(KEY) ?? localStorage.getItem("minedm.v2"); if (!value) return null; if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, value); return JSON.parse(value) as SavedState; } catch { return null; }
}
const saved = typeof window !== "undefined" ? readSaved() : null;
function initials(name: string) { return name.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "??"; }
function formatClock(date: Date, format: "12h" | "24h") { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: format === "12h" }); }
function formatDateTime(date: Date, format: "12h" | "24h") {
  const now = new Date();
  const dateKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
  const today = dateKey(now);
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = dateKey(date);
  const time = formatClock(date, format);
  if (day === today) return `Today at ${time}`;
  if (day === dateKey(yesterdayDate)) return `Yesterday at ${time}`;
  const month = date.toLocaleDateString([], { month: "long" });
  const value = date.getDate();
  const lastTwo = value % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${month} ${value}${suffix} ${date.getFullYear()} at ${time}`;
}
const SIGNED_ATTACHMENT_URL_TTL_MS = 4 * 60 * 1000;
const signedAttachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();
async function signMessageAttachments(value: unknown): Promise<Attachment[]> {
  const attachments = Array.isArray(value) ? value as Omit<Attachment, "url">[] : [];
  if (!attachments.length) return [];
  const paths = [...new Set(attachments.map(attachment => attachment.path))];
  const now = Date.now();
  const missingPaths = paths.filter(path => {
    const cached = signedAttachmentUrlCache.get(path);
    return !cached || cached.expiresAt <= now;
  });
  if (missingPaths.length) {
    const { data } = await supabase.storage.from("message-attachments").createSignedUrls(missingPaths, 300);
    for (const item of data || []) {
      if (item.path && item.signedUrl) signedAttachmentUrlCache.set(item.path, { url: item.signedUrl, expiresAt: now + SIGNED_ATTACHMENT_URL_TTL_MS });
    }
  }
  return attachments.map(attachment => ({ ...attachment, url: signedAttachmentUrlCache.get(attachment.path)?.url }));
}

type CachedProfile = { id: string; public_id: string | null; username: string | null; status: string | null; avatar_url: string | null; bio: string | null };
const PROFILE_CACHE_TTL_MS = 30_000;
const profileCache = new Map<string, { value: CachedProfile | null; expiresAt: number }>();
async function loadCachedProfiles(ids: string[]): Promise<CachedProfile[]> {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const now = Date.now();
  const missingIds = uniqueIds.filter(id => {
    const entry = profileCache.get(id);
    return !entry || entry.expiresAt <= now;
  });
  if (missingIds.length) {
    const { data, error } = await supabase.from("profiles").select("id,public_id,username,status,avatar_url,bio").in("id", missingIds);
    if (error) throw error;
    const fetched = new Map<string, CachedProfile>((data || []).map(row => [row.id, row as CachedProfile] as const));
    for (const id of missingIds) profileCache.set(id, { value: fetched.get(id) || null, expiresAt: now + PROFILE_CACHE_TTL_MS });
  }
  return uniqueIds.map(id => profileCache.get(id)?.value).filter((profile): profile is CachedProfile => Boolean(profile));
}
type CachedNotificationOverride = { scope_type: "server" | "channel"; scope_id: string; mode: "all" | "mentions" | "none" | "muted" };
const NOTIFICATION_OVERRIDE_CACHE_TTL_MS = 30_000;
const notificationOverrideCache = new Map<string, { value: CachedNotificationOverride[]; expiresAt: number }>();
async function loadCachedNotificationOverrides(userId: string): Promise<CachedNotificationOverride[]> {
  const now = Date.now();
  const cached = notificationOverrideCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;
  const { data, error } = await supabase.from("notification_overrides").select("scope_type,scope_id,mode").eq("user_id", userId);
  if (error) throw error;
  const value = (data || []) as CachedNotificationOverride[];
  notificationOverrideCache.set(userId, { value, expiresAt: now + NOTIFICATION_OVERRIDE_CACHE_TTL_MS });
  return value;
}
function keyFor(view: "channel" | "dm", name: string) { return view === "channel" ? "channel:" + name : "dm:" + name.toLowerCase(); }
function escapeMentionLabel(value: string) { return value.replace(/[.*+?^$()|[\]\\]/g, ch => "\\" + ch); }
function buildMentionTokens(body: string, members: Person[], roles: ServerRole[]): MentionToken[] {
  const tick = String.fromCharCode(96);
  const plain = body.replace(new RegExp(tick+tick+tick+"[\\s\\S]*?"+tick+tick+tick,"g")," ").replace(new RegExp(tick+"[^"+tick+"]*"+tick,"g")," ");
  const found = new Map<string, MentionToken>();
  const add = (token: MentionToken) => found.set(token.type + ":" + (token.id || ""), token);
  for (const type of ["everyone", "here"] as const) {
    const re = new RegExp("(^|[^A-Za-z0-9_\\\\])@" + type + "(?=$|[^A-Za-z0-9_])", "i");
    if (re.test(plain)) add({ type });
  }
  for (const person of members) {
    if (!person.id || !person.name || person.name === "Player") continue;
    const re = new RegExp("(^|[^A-Za-z0-9_\\\\])@" + escapeMentionLabel(person.name) + "(?=$|[^A-Za-z0-9_])", "i");
    if (re.test(plain)) add({ type: "user", id: person.id });
  }
  for (const role of roles) {
    if (!role.id || !role.name) continue;
    const re = new RegExp("(^|[^A-Za-z0-9_\\\\])@" + escapeMentionLabel(role.name) + "(?=$|[^A-Za-z0-9_])", "i");
    if (re.test(plain)) add({ type: "role", id: role.id });
  }
  return [...found.values()];
}

function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <span className={`logo-mark ${className}`} style={{ "--logo-size": `${size}px` } as React.CSSProperties} aria-hidden="true"><img src="/logo.png" alt="" /></span>;
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <span className={`skeleton-bar ${className}`} aria-hidden="true" />;
}

function WorkspaceSkeleton({ variant = "server" }: { variant?: "dm-home" | "server" }) {
  const dmHome = variant === "dm-home";

  return (
    <div
      className={`app-shell workspace-loading ${dmHome ? "loading-dm-home" : "has-members loading-server"}`}
      aria-label={dmHome ? "Loading direct messages home" : "Loading server"}
      aria-busy="true"
    >
      <aside className="server-rail">
        <SkeletonBar className="skeleton-server" />
        <div className="rail-separator" />
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBar key={i} className="skeleton-server" />
        ))}
        <div className="rail-spacer" />
      </aside>

      <aside className="sidebar">
        <div className="workspace-head">
          <div className="skeleton-stack">
            <SkeletonBar className="skeleton-line medium" />
            <SkeletonBar className="skeleton-line wide" />
          </div>
        </div>
        <div className="search-wrap">
          <SkeletonBar className="skeleton-line wide" />
        </div>

        {dmHome ? (
          <>
            <div className="side-heading">
              <SkeletonBar className="skeleton-line medium" />
            </div>
            <div className="dm-list">
              {Array.from({ length: 7 }, (_, i) => (
                <div className="skeleton-person-row" key={i}>
                  <SkeletonBar className="skeleton-avatar" />
                  <div className="skeleton-stack">
                    <SkeletonBar className={`skeleton-line ${i % 3 ? "medium" : "wide"}`} />
                    <SkeletonBar className="skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="side-heading">
              <SkeletonBar className="skeleton-line short" />
            </div>
            <div className="nav-list">
              {Array.from({ length: 5 }, (_, i) => (
                <div className="skeleton-nav-row" key={i}>
                  <SkeletonBar className="skeleton-square" />
                  <SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} />
                </div>
              ))}
            </div>
            <div className="side-heading">
              <SkeletonBar className="skeleton-line short" />
            </div>
            <div className="dm-list">
              {Array.from({ length: 4 }, (_, i) => (
                <div className="skeleton-person-row" key={i}>
                  <SkeletonBar className="skeleton-avatar" />
                  <div className="skeleton-stack">
                    <SkeletonBar className="skeleton-line medium" />
                    <SkeletonBar className="skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="user-bar">
          <SkeletonBar className="skeleton-avatar" />
          <div className="skeleton-stack">
            <SkeletonBar className="skeleton-line medium" />
            <SkeletonBar className="skeleton-line short" />
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <SkeletonBar className="skeleton-square" />
            <div className="skeleton-stack">
              <SkeletonBar className="skeleton-line medium" />
              <SkeletonBar className="skeleton-line wide" />
            </div>
          </div>
          <SkeletonBar className="skeleton-square" />
          <SkeletonBar className="skeleton-square" />
        </header>

        {dmHome ? (
          <div className="dm-home-skeleton-content">
            <div className="skeleton-stack dm-home-skeleton-intro">
              <SkeletonBar className="skeleton-line medium" />
              <SkeletonBar className="skeleton-line dm-home-skeleton-title" />
              <SkeletonBar className="skeleton-line dm-home-skeleton-copy" />
              <div className="dm-home-skeleton-actions">
                <SkeletonBar className="skeleton-line" />
                <SkeletonBar className="skeleton-line" />
              </div>
            </div>
            <div className="dm-home-skeleton-section">
              <SkeletonBar className="skeleton-line medium" />
              {Array.from({ length: 5 }, (_, i) => (
                <div className="dm-home-skeleton-card" key={i}>
                  <SkeletonBar className="skeleton-avatar" />
                  <div className="skeleton-stack">
                    <SkeletonBar className="skeleton-line medium" />
                    <SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} />
                  </div>
                  <SkeletonBar className="skeleton-square" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="message-scroll skeleton-message-list server-loading-messages">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton-message-row" key={i}>
                  <SkeletonBar className="skeleton-avatar" />
                  <div className="skeleton-stack">
                    <SkeletonBar className="skeleton-line medium" />
                    <SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} />
                    <SkeletonBar className="skeleton-line message-line-short" />
                  </div>
                </div>
              ))}
            </div>
            <div className="composer-area">
              <SkeletonBar className="skeleton-composer" />
            </div>
          </>
        )}
      </main>

      {!dmHome && (
        <aside className="member-panel skeleton-member-panel">
          <div className="member-panel-head">
            <div className="skeleton-stack">
              <SkeletonBar className="skeleton-line medium" />
              <SkeletonBar className="skeleton-line short" />
            </div>
          </div>
          {Array.from({ length: 7 }, (_, i) => (
            <div className="skeleton-person-row" key={i}>
              <SkeletonBar className="skeleton-avatar" />
              <div className="skeleton-stack">
                <SkeletonBar className="skeleton-line medium" />
                <SkeletonBar className="skeleton-line short" />
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

function DmConversationSkeleton() {
  return <div className="skeleton-message-list dm-conversation-skeleton" role="status" aria-label="Loading direct messages" aria-busy="true">{Array.from({ length: 7 }, (_, i) => <div className={`skeleton-message-row dm-skeleton-row ${i % 3 === 1 ? "indented" : ""}`} key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><div className="dm-skeleton-author"><SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} /><SkeletonBar className="skeleton-line short" /></div><SkeletonBar className={`skeleton-line ${i % 2 ? "message-line" : "dm-message-line"}`} /><SkeletonBar className="skeleton-line message-line-short" />{i % 3 === 0 && <SkeletonBar className="dm-skeleton-attachment" />}</div></div>)}</div>;
}

function SettingsSkeleton() {
  return <div className="settings-skeleton discord-settings-layout" aria-label="Loading settings" aria-busy="true"><nav className="discord-settings-nav"><SkeletonBar className="skeleton-line wide" />{Array.from({ length: 5 }, (_, i) => <div className="settings-skeleton-nav-row" key={i}><SkeletonBar className="skeleton-square" /><SkeletonBar className={`skeleton-line ${i % 2 ? "medium" : "wide"}`} /></div>)}</nav><div className="discord-settings-content"><div className="settings-skeleton-heading"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="settings-skeleton-title" /><SkeletonBar className="settings-skeleton-copy" /></div><div className="settings-skeleton-profile"><SkeletonBar className="settings-skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line wide" /><SkeletonBar className="skeleton-line short" /></div></div>{Array.from({ length: 4 }, (_, i) => <div className="settings-skeleton-field" key={i}><SkeletonBar className="skeleton-line medium" /><SkeletonBar className="settings-skeleton-input" /></div>)}<div className="settings-skeleton-save"><SkeletonBar className="skeleton-line wide" /></div></div></div>;
}

function Landing({ openApp }: { openApp: () => void }) {
  return <div className="landing">
    <header className="landing-header"><a className="wordmark" href="/"><Logo size={32} />Voax</a><nav><a href="#features">Features</a><a href="#community">Community</a><a href="/docs">User guide</a></nav></header>
    <section className="hero"><Logo size={96} className="is-hero" /><h1>Chat. Chill.<br/><span>Have Fun.</span></h1><p>A familiar, friendly place to chat with your friends, organize your teams, and share your opinions.</p><div className="hero-actions"><button className="btn primary large" onClick={openApp}>Open Voax <Icon name="arrowRight" size={16} /></button><a className="btn secondary large" href="#features">Explore features</a></div><div className="hero-note"><Icon name="sparkles" size={15} /> A friendly space for your people</div></section>
    <section className="landing-features" id="features"><div className="section-kicker">MADE FOR YOUR CREW</div><h2>Everything your squad needs.</h2><div className="feature-grid"><article><div className="feature-icon"><Icon name="message" size={24} /></div><h3>Channels & DMs</h3><p>Keep server conversations organized and jump into private chats whenever you need.</p></article><article><div className="feature-icon"><Icon name="pickaxe" size={24} /></div><h3>Built for builders</h3><p>Talk about builds, share ideas, and plan your next adventure with your crew.</p></article><article><div className="feature-icon"><Icon name="zap" size={24} /></div><h3>Lightweight by design</h3><p>A clean, responsive interface that works on desktop, tablet, and mobile.</p></article></div></section>
    <footer className="landing-footer" id="community"><span className="wordmark"><Logo size={20} />Voax</span><span>© 2026 Voax · An independent community site, not affiliated with Mojang and Discord.</span></footer>
  </div>;
}

type LinkPreviewData = { url: string; title?: string; description?: string; image?: string; siteName?: string; hostname?: string };
function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/link-preview?url=" + encodeURIComponent(url)).then(response => response.ok ? response.json() : null).then(value => {
      if (!cancelled && value && typeof value === "object") setData(value as LinkPreviewData);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  let hostname = "Website";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* invalid URL */ }
  return <a className="link-preview-card" href={url} target="_blank" rel="noopener noreferrer">
    {data?.image && <img className="link-preview-image" src={data.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = "none"; }} />}
    <span className="link-preview-copy"><span className="link-preview-site">{data?.siteName || data?.hostname || hostname}</span><strong>{data?.title || hostname}</strong>{data?.description && <span className="link-preview-description">{data.description}</span>}<span className="link-preview-url">{hostname}</span></span>
  </a>;
}
function MessageContent({ text, onJoinInvite, onOpenProfile, servers = [], members = [], roles = [], onlineCounts = {} }: { text: string; onJoinInvite: (code: string) => void; onOpenProfile: (person: Person) => void; servers?: Server[]; members?: Person[]; roles?: ServerRole[]; onlineCounts?: Record<string,number> }) {
  const mentionLabels = [...members.map(person => ({ label: person.name, type: "user" as const })), ...roles.map(role => ({ label: role.name, type: "role" as const }))].filter(item => item.label.trim() && item.label !== "Player").sort((a, b) => b.label.length - a.label.length);
  const labelPattern = mentionLabels.length ? mentionLabels.map(item => escapeMentionLabel(item.label)).join("|") + "|" : "";
  const tokens = text.split(new RegExp("(https?:\\/\\/[^\\s<>()]+|\\/invite\\/[A-Za-z0-9_-]+|@everyone\\b|@here\\b|@(?:" + labelPattern + "[A-Za-z0-9_-]+)(?=$|[^A-Za-z0-9_]))", "gi")).filter(Boolean);
  const invites = [...new Set((text.match(/(?:https?:\/\/[^\s<>()]+)?\/invite\/([A-Za-z0-9_-]+)/gi) || []).map(value => value.match(/\/invite\/([A-Za-z0-9_-]+)/i)?.[1]).filter((value): value is string => Boolean(value)))];
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>()]+/gi) || []).map(value => value.replace(/[.,!?;:]+$/, "")))].filter(value => !/\/invite\//i.test(value));
  return <div className="message-content"><p>{tokens.map((token, index) => {
    const invite = token.match(/(?:https?:\/\/[^/]+)?\/invite\/([A-Za-z0-9_-]+)/i);
    if (invite) { const linkedServer = servers.find(server => server.inviteCode === invite[1]); return <a key={index} className="invite-inline-link" href={"/invite/" + invite[1]} onClick={event => { event.preventDefault(); window.location.assign("/invite/" + invite[1]); }}>{linkedServer ? "Invite to " + linkedServer.name : "Voax server invite"}</a>; }
    if (/^https?:\/\//i.test(token)) return <a key={index} href={token} target="_blank" rel="noopener noreferrer">{token}</a>;
    if (/^@.+$/s.test(token)) { const label=token.slice(1).toLocaleLowerCase(); const role=roles.find(item=>item.name.toLocaleLowerCase()===label); const person=members.find(item=>item.name.toLocaleLowerCase()===label); const kind=/^everyone$/i.test(label)?"everyone":/^here$/i.test(label)?"here":role?"role":person?"user":"generic"; if(kind==="user"&&person) return <button key={index} type="button" className="mention-pill mention-pill-user mention-pill-clickable" title={"View "+person.name+"’s profile"} onClick={event=>{event.stopPropagation();onOpenProfile(person);}}><span className="mention-pill-avatar">{person.avatarUrl?<img src={person.avatarUrl} alt="" loading="lazy"/>:initials(person.name)}</span><span>{token}</span></button>; return <span key={index} className={"mention-pill mention-pill-"+kind}>{token}</span>; }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  })}</p>
    {invites.map(code => <InvitePreviewCard key={code} code={code} onlineCounts={onlineCounts} onJoin={() => onJoinInvite(code)} />)}
    {urls.map(url => <LinkPreview key={url} url={url} />)}
  </div>;
}


type SavedVoaxAccount = {
  userId: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  savedAt: number;
};
const SAVED_VOAX_ACCOUNTS_KEY = "voax.savedAccounts.v1";
function readSavedVoaxAccounts(): SavedVoaxAccount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_VOAX_ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedVoaxAccount =>
      !!item && typeof item.userId === "string" && typeof item.accessToken === "string" &&
      typeof item.refreshToken === "string" && typeof item.username === "string"
    );
  } catch { return []; }
}
function rememberVoaxAccount(session: Session, profile?: { username?: string; avatarUrl?: string | null }): SavedVoaxAccount[] {
  const accounts = readSavedVoaxAccounts();
  const metadata = session.user.user_metadata || {};
  const email = session.user.email || "";
  const username = profile?.username || (typeof metadata.username === "string" ? metadata.username : "") ||
    (typeof metadata.full_name === "string" ? metadata.full_name : "") || email.split("@")[0] || "Voax user";
  const avatarUrl = profile && "avatarUrl" in profile ? profile.avatarUrl ?? null :
    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : typeof metadata.picture === "string" ? metadata.picture : null);
  const next: SavedVoaxAccount = {
    userId: session.user.id, email, username, avatarUrl,
    accessToken: session.access_token, refreshToken: session.refresh_token, savedAt: Date.now()
  };
  const updated = [next, ...accounts.filter(account => account.userId !== session.user.id)].slice(0, 5);
  try { localStorage.setItem(SAVED_VOAX_ACCOUNTS_KEY, JSON.stringify(updated)); } catch { /* Browser storage may be unavailable or full. */ }
  return updated;
}


type DiscussionTag = { id:string; name:string; color:string };
type DiscussionPost = { id:string; title:string; body:string; authorId:string; author:string; createdAt:string; lastActivityAt:string; status:"open"|"archived"; locked:boolean; pinned:boolean; replyCount:number; tags:DiscussionTag[] };
type DiscussionReply = { id:string; authorId:string; author:string; body:string; createdAt:string };
function ChannelDiscussionView({channel,session,canManageThreads,canPublishAnnouncements,clockFormat,onNotify}:{channel:Channel;session:Session;canManageThreads:boolean;canPublishAnnouncements:boolean;clockFormat:"12h"|"24h";onNotify:(message:string)=>void}) {
  const [posts,setPosts]=useState<DiscussionPost[]>([]);
  const [tags,setTags]=useState<DiscussionTag[]>([]);
  const [selectedTag,setSelectedTag]=useState("");
  const [selectedPost,setSelectedPost]=useState<string|null>(null);
  const [replies,setReplies]=useState<DiscussionReply[]>([]);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [replyBody,setReplyBody]=useState("");
  const [selectedTags,setSelectedTags]=useState<string[]>([]);
  const [newTag,setNewTag]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [following,setFollowing]=useState(false);
  const isAnnouncement=channel.channelType==="announcement";
  const selectedPostData=posts.find(post=>post.id===selectedPost)||null;

  const loadPosts=async()=>{
    setLoading(true);
    const [threadResult,tagResult]=await Promise.all([
      supabase.from("channel_threads").select("id,channel_id,author_id,title,body,status,locked,pinned,created_at,last_activity_at").eq("channel_id",channel.id).order("pinned",{ascending:false}).order("last_activity_at",{ascending:false}).limit(200),
      supabase.from("forum_tags").select("id,name,color,position").eq("channel_id",channel.id).order("position").order("name")
    ]);
    if(threadResult.error){onNotify("Couldn't load channel posts: "+threadResult.error.message);setLoading(false);return;}
    if(tagResult.error&&!isAnnouncement){onNotify("Couldn't load forum tags: "+tagResult.error.message);setLoading(false);return;}
    const rows=threadResult.data||[];
    const tagRows=(tagResult.data||[]) as (DiscussionTag&{position:number})[];
    setTags(tagRows);
    if(!rows.length){setPosts([]);setLoading(false);return;}
    const ids=rows.map(row=>row.id);
    const authorIds=[...new Set(rows.map(row=>row.author_id))];
    const [tagLinksResult,repliesResult,publicationResult,profileResult]=await Promise.all([
      supabase.from("channel_thread_tags").select("thread_id,tag_id").in("thread_id",ids),
      supabase.from("messages").select("id,thread_id,author_id,body,created_at").in("thread_id",ids).order("created_at"),
      supabase.from("announcement_publications").select("message_id").eq("channel_id",channel.id),
      supabase.from("profiles").select("id,username").in("id",authorIds)
    ]);
    if(tagLinksResult.error||repliesResult.error||publicationResult.error||profileResult.error){onNotify("Some post details could not be loaded.");}
    const names=new Map<string,string>((profileResult.data||[]).map(row=>[row.id,row.username||"Member"]));
    const rootMessageIds=new Set((publicationResult.data||[]).map(row=>row.message_id));
    const replyCounts=new Map<string,number>();
    for(const reply of repliesResult.data||[])if(reply.thread_id&&!rootMessageIds.has(reply.id))replyCounts.set(reply.thread_id,(replyCounts.get(reply.thread_id)||0)+1);
    const tagsByThread=new Map<string,DiscussionTag[]>();
    for(const link of tagLinksResult.data||[]){const tag=tagRows.find(item=>item.id===link.tag_id);if(tag){const list=tagsByThread.get(link.thread_id)||[];list.push(tag);tagsByThread.set(link.thread_id,list);}}
    setPosts(rows.map(row=>({id:row.id,title:row.title,body:row.body,authorId:row.author_id,author:names.get(row.author_id)||"Member",createdAt:row.created_at,lastActivityAt:row.last_activity_at,status:row.status,locked:row.locked,pinned:row.pinned,replyCount:replyCounts.get(row.id)||0,tags:tagsByThread.get(row.id)||[]})));
    setLoading(false);
  };

  const loadReplies=async(post:DiscussionPost)=>{
    const [replyResult,publicationResult]=await Promise.all([
      supabase.from("messages").select("id,author_id,body,created_at").eq("thread_id",post.id).order("created_at"),
      supabase.from("announcement_publications").select("message_id").eq("channel_id",channel.id)
    ]);
    if(replyResult.error){onNotify("Couldn't load replies: "+replyResult.error.message);return;}
    const rootIds=new Set((publicationResult.data||[]).map(row=>row.message_id));
    const rows=(replyResult.data||[]).filter(row=>!rootIds.has(row.id));
    const ids=[...new Set(rows.map(row=>row.author_id))];
    const profiles=ids.length?await supabase.from("profiles").select("id,username").in("id",ids):{data:[],error:null};
    const names=new Map<string,string>((profiles.data||[]).map(row=>[row.id,row.username||"Member"]));
    setReplies(rows.map(row=>({id:row.id,authorId:row.author_id,author:names.get(row.author_id)||"Member",body:row.body,createdAt:row.created_at})));
  };

  useEffect(()=>{setSelectedPost(null);setSelectedTag("");void loadPosts();},[channel.id]);
  useEffect(()=>{if(selectedPostData)void loadReplies(selectedPostData);else setReplies([]);},[selectedPost]);
  useEffect(()=>{
    if(!isAnnouncement){setFollowing(false);return;}
    let cancelled=false;
    void supabase.from("announcement_followers").select("user_id").eq("channel_id",channel.id).eq("user_id",session.user.id).maybeSingle().then(({data,error})=>{if(cancelled)return;if(error)onNotify("Couldn't load announcement follow status: "+error.message);else setFollowing(Boolean(data));});
    return()=>{cancelled=true;};
  },[channel.id,isAnnouncement,session.user.id]);

  useEffect(()=>{
    const realtime=supabase.channel("voax-discussions-"+channel.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"channel_threads",filter:"channel_id=eq."+channel.id},()=>{void loadPosts();})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"channel_id=eq."+channel.id},()=>{void loadPosts();if(selectedPostData)void loadReplies(selectedPostData);})
      .subscribe();
    return()=>{void supabase.removeChannel(realtime);};
  },[channel.id,selectedPost]);
  const createPost=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!title.trim()){onNotify("Add a title first.");return;}
    setBusy(true);
    const {data,error}=await supabase.rpc("create_channel_thread",{p_channel_id:channel.id,p_title:title.trim(),p_body:body.trim()});
    if(error){onNotify("Couldn't create post: "+error.message);setBusy(false);return;}
    const postId=String(data);
    if(selectedTags.length){const {error:tagError}=await supabase.from("channel_thread_tags").insert(selectedTags.map(tag_id=>({thread_id:postId,tag_id})));if(tagError)onNotify("Post created, but tags could not be added: "+tagError.message);}
    setTitle("");setBody("");setSelectedTags([]);
    await loadPosts();setSelectedPost(postId);setBusy(false);
  };

  const sendReply=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selectedPostData||!replyBody.trim())return;
    setBusy(true);
    const {error}=await supabase.rpc("send_channel_thread_reply",{p_thread_id:selectedPostData.id,p_body:replyBody.trim()});
    if(error){onNotify("Couldn't send reply: "+error.message);setBusy(false);return;}
    setReplyBody("");await loadReplies(selectedPostData);await loadPosts();setBusy(false);
  };

  const toggleFollow=async()=>{
    setBusy(true);
    const result=following
      ? await supabase.from("announcement_followers").delete().eq("channel_id",channel.id).eq("user_id",session.user.id)
      : await supabase.from("announcement_followers").insert({channel_id:channel.id,user_id:session.user.id});
    setBusy(false);
    if(result.error){onNotify("Couldn't update announcement follow: "+result.error.message);return;}
    setFollowing(!following);onNotify(following?"Unfollowed announcement channel.":"Following announcement channel.");
  };

  const createTag=async(e:React.FormEvent)=>{
    e.preventDefault();if(!newTag.trim())return;
    const {error}=await supabase.from("forum_tags").insert({channel_id:channel.id,name:newTag.trim(),position:tags.length});
    if(error){onNotify("Couldn't create forum tag: "+error.message);return;}
    setNewTag("");await loadPosts();
  };

  const updatePost=async(post:DiscussionPost,changes:Record<string,unknown>)=>{
    const {error}=await supabase.from("channel_threads").update(changes).eq("id",post.id);
    if(error){onNotify("Couldn't update discussion: "+error.message);return;}
    await loadPosts();
  };

  return <section className="discussion-view">
    {selectedPostData ? <div className="discussion-detail">
      <div className="discussion-toolbar"><button type="button" className="discussion-back" onClick={()=>setSelectedPost(null)}>← All {isAnnouncement?"announcements":"posts"}</button>{canManageThreads&&<div className="discussion-mod-actions"><button type="button" className="btn secondary small" onClick={()=>void updatePost(selectedPostData,{pinned:!selectedPostData.pinned})}>{selectedPostData.pinned?"Unpin":"Pin"}</button><button type="button" className="btn secondary small" onClick={()=>void updatePost(selectedPostData,selectedPostData.status==="archived"?{status:"open",archived_at:null,archived_by:null}:{status:"archived",archived_at:new Date().toISOString(),archived_by:session.user.id})}>{selectedPostData.status==="archived"?"Restore":"Archive"}</button><button type="button" className="btn secondary small" onClick={()=>void updatePost(selectedPostData,{locked:!selectedPostData.locked})}>{selectedPostData.locked?"Unlock":"Lock"}</button></div>}</div>
      <article className="discussion-post-full"><div className="discussion-post-meta"><strong>{selectedPostData.author}</strong><time>{formatDateTime(new Date(selectedPostData.createdAt),clockFormat)}</time>{selectedPostData.pinned&&<span>Pinned</span>}{selectedPostData.status==="archived"&&<span>Archived</span>}</div><h1>{selectedPostData.title}</h1>{selectedPostData.tags.length>0&&<div className="discussion-tags">{selectedPostData.tags.map(tag=><span key={tag.id} style={{"--tag-color":tag.color} as React.CSSProperties}>{tag.name}</span>)}</div>}<p className="discussion-post-body">{selectedPostData.body||" "}</p></article>
      <div className="discussion-replies-head"><h3>Replies</h3><span>{replies.length}</span></div>
      <div className="discussion-replies">{replies.map(reply=><article className="discussion-reply" key={reply.id}><div className="discussion-reply-avatar">{reply.author.slice(0,1).toUpperCase()}</div><div><div className="discussion-reply-meta"><strong>{reply.author}</strong><time>{formatDateTime(new Date(reply.createdAt),clockFormat)}</time></div><p>{reply.body}</p></div></article>)}{!replies.length&&<p className="discussion-empty-replies">No replies yet.</p>}</div>
      {selectedPostData.status==="open"&&!selectedPostData.locked?<form className="discussion-reply-form" onSubmit={sendReply}><textarea value={replyBody} onChange={e=>setReplyBody(e.target.value)} rows={2} maxLength={4000} placeholder="Write a reply…" required/><button className="btn primary" disabled={busy||!replyBody.trim()}>{busy?"Sending…":"Reply"}</button></form>:<p className="discussion-closed-note">This discussion is {selectedPostData.status==="archived"?"archived":"locked"}.</p>}
    </div> : <>
      <header className="discussion-header"><div><span className="section-kicker">{isAnnouncement?"ANNOUNCEMENTS":"COMMUNITY FORUM"}</span><h1>{isAnnouncement?"Announcements":"Posts"}</h1><p>{isAnnouncement?"Updates published by this server.":"Share questions, ideas, and discussions with the server."}</p></div>{isAnnouncement?<button type="button" className={"btn "+(following?"secondary":"primary")} disabled={busy} onClick={()=>void toggleFollow()}>{following?"Following":"Follow channel"}</button>:null}</header>
      {isAnnouncement&&<div className="discussion-notice">Only members with Publish Announcements permission can publish here.</div>}
      {!isAnnouncement&&tags.length>0&&<div className="discussion-filter-tags"><button type="button" className={!selectedTag?"active":""} onClick={()=>setSelectedTag("")}>All</button>{tags.map(tag=><button type="button" key={tag.id} className={selectedTag===tag.id?"active":""} onClick={()=>setSelectedTag(tag.id)}>{tag.name}</button>)}</div>}
      {canPublishAnnouncements||!isAnnouncement?<form className="discussion-create" onSubmit={createPost}><h3>{isAnnouncement?"Publish an announcement":"Create a post"}</h3><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder={isAnnouncement?"Announcement title":"Give your post a title"} required/><textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} rows={3} placeholder={isAnnouncement?"Write your announcement…":"Add some details (optional)"}/>{!isAnnouncement&&tags.length>0&&<div className="discussion-tag-picker">{tags.map(tag=><label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={e=>setSelectedTags(old=>e.target.checked?[...old,tag.id]:old.filter(id=>id!==tag.id))}/>{tag.name}</label>)}</div>}<div className="discussion-create-footer"><small>{isAnnouncement?"Publishing makes this visible to channel members.":"Posts can be tagged and discussed in their own thread."}</small><button className="btn primary" disabled={busy||!title.trim()}>{busy?(isAnnouncement?"Publishing…":"Creating…"):(isAnnouncement?"Publish":"Post")}</button></div></form>:null}
      {!isAnnouncement&&canManageThreads&&<form className="discussion-tag-create" onSubmit={createTag}><input value={newTag} onChange={e=>setNewTag(e.target.value)} maxLength={20} placeholder="New forum tag"/><button type="submit" className="btn secondary small" disabled={!newTag.trim()}>Add tag</button></form>}
      <div className="discussion-post-list">{loading?<div className="empty-state">Loading posts…</div>:posts.filter(post=>!selectedTag||post.tags.some(tag=>tag.id===selectedTag)).map(post=><button type="button" className="discussion-post-card" key={post.id} onClick={()=>setSelectedPost(post.id)}><div className="discussion-post-card-top"><strong>{post.title}</strong><span>{post.replyCount} {post.replyCount===1?"reply":"replies"}</span></div><p>{post.body||"Open this post to join the discussion."}</p><div className="discussion-post-card-bottom"><span>{post.author} · {formatDateTime(new Date(post.createdAt),clockFormat)}</span><span className="discussion-tags">{post.tags.map(tag=><i key={tag.id} style={{"--tag-color":tag.color} as React.CSSProperties}>{tag.name}</i>)}</span>{post.pinned&&<span>Pinned</span>}{post.status==="archived"&&<span>Archived</span>}</div></button>)}{!loading&&posts.filter(post=>!selectedTag||post.tags.some(tag=>tag.id===selectedTag)).length===0&&<div className="empty-state"><h3>{isAnnouncement?"No announcements yet":"No posts yet"}</h3><p>{isAnnouncement?"Published updates will appear here.":"Start a discussion to get the forum going."}</p></div>}</div>
    </>}
  </section>;
}

function App({ session }: { session: Session }) {
  const path = window.location.pathname;
  const [showLanding, setShowLanding] = useState(!(path === "/app" || path === "/app/" || path === "/dms" || path === "/dms/" || path.startsWith("/dm/") || path.startsWith("/channel/") || path.startsWith("/channels/") || path.startsWith("/invite/") || path.startsWith("/explore")));
  const [name, setName] = useState("Player");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [mediaViewer, setMediaViewer] = useState<{ items: Attachment[]; index: number } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [serverIconBusy, setServerIconBusy] = useState(false);
  const [serverBannerBusy, setServerBannerBusy] = useState(false);
  const [serverShortDescription, setServerShortDescription] = useState("");
  const [serverBannerUrl, setServerBannerUrl] = useState<string | null>(null);
  const [serverSettingsSection, setServerSettingsSection] = useState<"overview" | "discovery" | "order">("overview");
  const [serverDiscoveryLongDescription, setServerDiscoveryLongDescription] = useState("");
  const [serverDiscoveryTags, setServerDiscoveryTags] = useState("");
  const [serverDiscoveryCategory, setServerDiscoveryCategory] = useState("Community");
  const [serverDiscoveryLanguage, setServerDiscoveryLanguage] = useState("English");
  const [serverDiscoverySaving, setServerDiscoverySaving] = useState(false);
  const [categoryInput, setCategoryInput] = useState("Text Channels");
  const [channelTypeInput, setChannelTypeInput] = useState<"text"|"announcement"|"forum">("text");
  const [channelPermissionOverwrites, setChannelPermissionOverwrites] = useState<{id:string;target_type:"everyone"|"role"|"member";target_id:string|null;allow_permissions:string[];deny_permissions:string[]}[]>([]);
  const [activeChannelAccessOverwrites, setActiveChannelAccessOverwrites] = useState<{target_type:"everyone"|"role"|"member";target_id:string|null;allow_permissions:string[];deny_permissions:string[]}[]>([]);
  const [channelPermissionsLoading, setChannelPermissionsLoading] = useState(false);
  const [channelCategories, setChannelCategories] = useState<{id?:string;serverId:string;name:string;position?:number}[]>([]);
  const [categoryPermissionOverwrites, setCategoryPermissionOverwrites] = useState<{id:string;target_type:"everyone"|"role"|"member";target_id:string|null;allow_permissions:string[];deny_permissions:string[]}[]>([]);
  const [serverMemberRoles, setServerMemberRoles] = useState<Record<string, Record<string, "owner" | "admin" | "member">>>({});
  const [customServerRoles, setCustomServerRoles] = useState<ServerRole[]>([]);
  const [serverPingSettings, setServerPingSettings] = useState({confirmation_threshold:25,cooldown_seconds:60,admin_mass_pings_enabled:true,direct_targets_per_10s:10,role_actions_per_60s:5,messages_per_5s:5});
  const [serverPingSettingsSaving, setServerPingSettingsSaving] = useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false);
  const [customRoleAssignments, setCustomRoleAssignments] = useState<Record<string, Record<string, string[]>>>({});
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleEditorTab, setRoleEditorTab] = useState<"display" | "permissions" | "members">("display");
  const [roleSaveBusy, setRoleSaveBusy] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#00e5ff");
  const [newRolePermissions, setNewRolePermissions] = useState<ServerRole["permissions"]>({manage_channels:false,reorder_categories_channels:false,manage_messages:false,manage_threads:false,publish_announcements:false,manage_announcements:false,kick_members:false,manage_roles:false,manage_server:false});
  const [status, setStatus] = useState<PresenceStatus>("Online");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"account" | "accounts" | "blocked" | "appearance" | "notifications">("account");
  const [blockedPeople,setBlockedPeople]=useState<Person[]>([]);
  const [blockedPeopleLoading,setBlockedPeopleLoading]=useState(false);
  const [accountBan,setAccountBan]=useState<{id:string;reason:string;duration:string;expires_at:string|null}|null>(null);
  const [appealMessage,setAppealMessage]=useState("");
  const [appealBusy,setAppealBusy]=useState(false);
  const [appealSubmitted,setAppealSubmitted]=useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedVoaxAccount[]>(() => readSavedVoaxAccounts());
  const [accountSwitchBusy, setAccountSwitchBusy] = useState<string | null>(null);
  const [accountSwitchNotice, setAccountSwitchNotice] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [globalNotificationMode, setGlobalNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [directMentionsEnabled, setDirectMentionsEnabled] = useState(true);
  const [roleMentionsEnabled, setRoleMentionsEnabled] = useState(true);
  const [everyoneMentionsEnabled, setEveryoneMentionsEnabled] = useState(true);
  const [hereMentionsEnabled, setHereMentionsEnabled] = useState(true);
  const [serverNotificationMode, setServerNotificationMode] = useState<"inherit"|"all"|"mentions"|"none"|"muted">("inherit");
  const [channelNotificationMode, setChannelNotificationMode] = useState<"inherit"|"all"|"mentions"|"none"|"muted">("inherit");
  const [mentionMenu, setMentionMenu] = useState<{ start: number; options: MentionSuggestion[] } | null>(null);
  const [profileBio, setProfileBio] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("voax.theme") ?? localStorage.getItem("minedm.theme")) === "light" ? "light" : "dark");
  useEffect(() => { setSavedAccounts(rememberVoaxAccount(session)); }, [session.user.id, session.access_token, session.refresh_token]);
  const [clockFormat, setClockFormat] = useState<"12h" | "24h">(() => localStorage.getItem("voax.clockFormat") === "24h" ? "24h" : "12h");
  const [sendButtonEnabled, setSendButtonEnabled] = useState(() => { const saved = localStorage.getItem("voax.sendButtonEnabled"); return saved === null ? window.matchMedia("(max-width: 650px)").matches : saved === "true"; });
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({});
  const [dmActivity, setDmActivity] = useState<Record<string, number>>({});
  const [active, setActive] = useState("");
  const initialRouteHandled = useRef(false);
  const [view, setView] = useState<"channel" | "dm" | "friends" | "home" | "explore">(path.startsWith("/explore") ? "explore" : path.startsWith("/dm/") ? "dm" : path.startsWith("/channels/") || path.startsWith("/channel/") ? "channel" : window.location.search === "?view=friends" ? "friends" : "home");
  const [explorePath, setExplorePath] = useState(path.startsWith("/explore") ? path : "/explore");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [modal, setModalState] = useState<"dm" | "friend" | "channel" | "category" | "server" | "joinServer" | "manageServer" | "manageRoles" | "manageChannel" | "manageCategory" | "confirmDelete" | "settings" | "inbox" | null>(null);
  const [categoryCreationMode, setCategoryCreationMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [keyboardSidebarDrag, setKeyboardSidebarDrag] = useState<{ kind: "category" | "channel"; id: string; targetId: string; category: string; after: boolean } | null>(null);
  const [sidebarDragAnnouncement, setSidebarDragAnnouncement] = useState("");
  const [mobileReorderMode, setMobileReorderMode] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const modalCloseTimerRef = useRef<number | null>(null);
  function setModal(next: typeof modal) {
    if (modalCloseTimerRef.current !== null) window.clearTimeout(modalCloseTimerRef.current);
    if (next === null && modal !== null) {
      setModalClosing(true);
      modalCloseTimerRef.current = window.setTimeout(() => {
        setModalState(null);
        setModalClosing(false);
        modalCloseTimerRef.current = null;
      }, 190);
      return;
    }
    setModalClosing(false);
    setModalState(next);
  }
  const [pendingDelete, setPendingDelete] = useState<{ type: "server" | "channel" | "category"; id: string; name: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Person | null>(null);
  const [profileRolePickerOpen, setProfileRolePickerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [modalInput, setModalInput] = useState("");
  const [toast, setToast] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<"owner" | "admin" | "moderator" | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<VoaxReportTarget | null>(null);
  const [reportReason, setReportReason] = useState("Harassment or bullying");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [compact, setCompact] = useState(saved?.compact || false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("voax.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("voax.clockFormat", clockFormat); }, [clockFormat]);
  useEffect(() => { localStorage.setItem("voax.sendButtonEnabled", String(sendButtonEnabled)); }, [sendButtonEnabled]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typingPerson, setTypingPerson] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [filter, setFilter] = useState<"all" | "online">("all");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [incomingVoiceOffer, setIncomingVoiceOffer] = useState<{from:string;description:RTCSessionDescriptionInit}|null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection|null>(null);
  const localStreamRef = useRef<MediaStream|null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement|null>(null);
  const voiceChannelRef = useRef<ReturnType<typeof supabase.channel>|null>(null);
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const [notificationFilter, setNotificationFilter] = useState<"all" | "mentions" | "unread">("all");
  const [pendingMentionJumpId, setPendingMentionJumpId] = useState<string | null>(null);
  const [blockedNotificationActors, setBlockedNotificationActors] = useState<string[]>([]);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, PresenceStatus>>({});
  const [presenceByServer, setPresenceByServer] = useState<Record<string, number>>({});
  const [serverMembersByServer, setServerMembersByServer] = useState<Record<string, string[]>>({});
  const [discoverableServerIds, setDiscoverableServerIds] = useState<string[]>([]);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageEventsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeRef = useRef(active);
  const viewRef = useRef(view);
  const peopleRef = useRef(people);
  const nameRef = useRef(name);
  const currentMessageIdsRef = useRef<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ compact })); } catch { /* browser storage may be disabled */ }
  }, [compact]);
  useEffect(() => {
    const styleId = "voax-micro-animations";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes voax-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes voax-button-spinner { to { transform: rotate(360deg); } }
      .button-spinner { display: inline-block; width: 12px; height: 12px; flex: 0 0 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -2px; animation: voax-button-spinner .7s linear infinite; margin-left: 5px; }
      .btn:disabled, .send-btn:disabled { cursor: wait; opacity: .72; }
      @media (prefers-reduced-motion: reduce) { .button-spinner { animation-duration: 1.8s; } }
      @keyframes voax-pop-in { 0% { opacity: 0; transform: translateY(7px) scale(.985); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes voax-slide-up { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
      @keyframes voax-soft-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); } }
      @keyframes voax-icon-hop { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-4px); } 70% { transform: translateY(1px); } }
      @keyframes voax-icon-nudge { 0%, 100% { transform: translateX(0); } 35% { transform: translateX(-2px); } 70% { transform: translateX(2px); } }
      @keyframes voax-icon-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 65% { transform: rotate(7deg); } }
      @keyframes voax-icon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes voax-icon-plus { 0% { transform: rotate(0) scale(1); } 60% { transform: rotate(100deg) scale(1.16); } 100% { transform: rotate(90deg) scale(1); } }
      @keyframes voax-voice-ping { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); } 100% { box-shadow: 0 0 0 8px transparent; } }
      @keyframes voax-mic-wobble { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-8deg); } 70% { transform: rotate(8deg); } }
      .icon-btn:hover .icon-settings, .workspace-head button:hover .icon-settings, .user-bar button:hover .icon-settings { animation: voax-icon-spin .9s cubic-bezier(.4, 0, .2, 1); }
      .server-icon:hover .icon-pickaxe, .server-icon:hover .icon-tree { animation: voax-icon-hop .42s ease-out; }
      .server-icon.add:hover .icon-plus, .side-heading button:hover .icon-plus, .workspace-head button:hover .icon-plus { animation: voax-icon-plus .4s cubic-bezier(.2,.8,.2,1); }
      .nav-item:hover .icon-hash { animation: voax-icon-nudge .32s ease-in-out; }
      .side-link:hover .icon-users, .dm-item:hover .icon-message { animation: voax-icon-wiggle .38s ease-in-out; }
      .search-wrap:focus-within .icon-search { animation: voax-icon-wiggle .42s ease-in-out; color: var(--accent); }
      .topbar-title .icon-hash, .topbar-title .icon-at, .topbar-title .icon-users { transition: transform .25s ease, filter .25s ease; }
      .topbar-title:hover .icon-hash { transform: translateY(-2px); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)); }
      .voice-toggle { position: relative; overflow: visible; }
      .voice-toggle .ui-icon { transition: transform .22s ease, color .22s ease, filter .22s ease; }
      .voice-toggle:hover .ui-icon { transform: scale(1.12); filter: drop-shadow(0 0 5px currentColor); }
      .voice-toggle[aria-pressed="true"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
      .voice-toggle[aria-pressed="true"].voice-connected { color: #5eead4; border-color: #5eead455; animation: voax-voice-ping .7s ease-out; }
      .voice-toggle[aria-pressed="false"] { color: #ef7777; background: #ef444410; border-color: #ef444425; }
      .voice-toggle[aria-pressed="false"] .icon-micOff { animation: voax-mic-wobble .42s ease-in-out; }
      .voice-toggle[aria-pressed="false"] .icon-headphonesOff { animation: voax-icon-wiggle .38s ease-in-out; }
      .voice-toggle[aria-pressed="true"].voice-connected::after { content: ""; position: absolute; inset: -4px; border: 1px solid #5eead466; border-radius: 10px; animation: voax-soft-pulse 1.8s ease-in-out infinite; pointer-events: none; }
      .landing-header, .hero .eyebrow, .hero h1, .hero > p, .hero-actions, .hero-note { animation: voax-fade-up .55s cubic-bezier(.2,.7,.2,1) both; }
      .hero h1 { animation-delay: .06s; } .hero > p { animation-delay: .12s; } .hero-actions { animation-delay: .18s; } .hero-note { animation-delay: .24s; }
      .feature-grid article { transition: transform .22s ease, border-color .22s ease, background .22s ease; }
      .feature-grid article:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 28%, transparent); background: #151e29; }
      .btn, .icon-btn, .server-icon, .nav-item, .dm-item, .side-link, .filter-tabs button, .friend-card, .attach-btn, .send-btn { transition: transform .16s ease, color .16s ease, background-color .16s ease, border-color .16s ease, box-shadow .16s ease, filter .16s ease; }
      .btn:active, .icon-btn:active, .server-icon:active, .nav-item:active, .dm-item:active, .side-link:active, .send-btn:active { transform: scale(.96); }
      .server-icon:hover, .brand-mark:hover { transform: translateY(-2px); }
      .nav-item:hover, .dm-item:hover, .side-link:hover { transform: translateX(2px); }
      .icon-btn:hover, .attach-btn:hover { transform: scale(1.06); }
      .send-btn:not(:disabled):hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
      .message-row { animation: voax-fade-up .24s ease-out both; }
      .message-row:hover .message-avatar { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent); }
      .composer { transition: border-color .2s ease, box-shadow .2s ease; }
      .composer:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 7%, transparent); }
      .composer-area { position: relative; }
      .mention-suggestions { position:absolute; z-index:30; left:14px; right:14px; bottom:calc(100% - 8px); max-height:280px; overflow:auto; padding:6px; border:1px solid var(--border, #ffffff1a); border-radius:12px; background:var(--panel, #151a23); box-shadow:0 14px 40px #0007; }
      .mention-suggestion { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:9px 10px; border:0; border-radius:8px; background:transparent; color:inherit; cursor:pointer; }
      .mention-suggestion:hover, .mention-suggestion:focus { background:color-mix(in srgb, var(--accent) 12%, transparent); outline:none; }
      .mention-suggestion strong { display:block; font-size:13px; }
      .mention-suggestion small { display:block; color:var(--muted, #98a2b3); font-size:11px; }
      .mention-pill { display:inline; padding:1px 4px; border-radius:4px; background:color-mix(in srgb, var(--accent) 16%, transparent); color:var(--accent); font-weight:600; }
      .ping-setting-group { border:1px solid var(--border, #ffffff1a); border-radius:12px; padding:14px; margin:14px 0; }
      .ping-setting-group h3 { margin:0 0 6px; font-size:14px; }
      .ping-setting-group p { margin:0 0 12px; color:var(--muted, #98a2b3); font-size:12px; }
      .modal-backdrop { animation: voax-pop-in .18s ease-out both; }
      .modal { animation: voax-pop-in .22s cubic-bezier(.2,.8,.2,1) both; }
      .toast { animation: voax-slide-up .22s ease-out both; }
      .pulse, .demo-pill i { animation: voax-soft-pulse 2s ease-in-out infinite; }
      .avatar { transition: transform .18s ease, box-shadow .18s ease; }
      .avatar img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: inherit; }
      .friend-card:hover .avatar { transform: scale(1.05); }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, []);
  useEffect(() => { document.documentElement.style.setProperty("--accent", "#00e5ff"); }, []);
  useEffect(() => { if (activeServer) void loadCustomServerRoles(activeServer); }, [activeServer]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { if (!mediaViewer) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMediaViewer(null); else if (event.key === "ArrowRight") setMediaViewer(current => current ? { ...current, index: (current.index + 1) % current.items.length } : current); else if (event.key === "ArrowLeft") setMediaViewer(current => current ? { ...current, index: (current.index - 1 + current.items.length) % current.items.length } : current); }; window.addEventListener("keydown", onKeyDown); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; }; }, [mediaViewer]);

  // Never display another server's role/settings as a fallback when activeServer is stale.
  const currentServer = servers.find(s => s.id === activeServer);
  const serverMemberIds = serverMembersByServer[activeServer] || [];
  const serverMemberPeople = serverMemberIds.filter(id => id !== session.user.id).map(id => {
    const person = people.find(p => p.id === id);
    const presence = presenceByUser[id];
    return person
      ? { ...person, online: Boolean(presence && presence !== "Offline"), status: (presence && presence !== "Offline" ? presence : "Offline") as PresenceStatus }
      : { id, name: "Player", online: false, status: "Offline" as PresenceStatus, color: "blue", preview: "Server member", avatarUrl: null };
  });
  const onlineServerMembers = serverMemberPeople.filter(person => person.online);
  const onlineServerMemberCount = onlineServerMembers.length + (presenceByUser[session.user.id] && presenceByUser[session.user.id] !== "Offline" ? 1 : 0);
  const offlineServerMembers = serverMemberPeople.filter(person => !person.online);
  const getMemberRole = (userId: string) => {
    const assignedIds = customRoleAssignments[activeServer]?.[userId] || [];
    const customRole = customServerRoles
      .filter(role => assignedIds.includes(role.id))
      .sort((a, b) => b.position - a.position)[0];
    if (customRole) return { name: customRole.name, color: customRole.color };
    const builtInRole = serverMemberRoles[activeServer]?.[userId]
      || (servers.find(server => server.id === activeServer)?.createdBy === userId ? "owner" : "member");
    if (builtInRole === "owner") return { name: "Owner", color: "#f0b232" };
    if (builtInRole === "admin") return { name: "Admin", color: "#e879f9" };
    return { name: "Member", color: "var(--muted)" };
  };
  const isOwnerOrAdmin = currentServer?.role === "owner" || currentServer?.role === "admin";
  const myCustomRoleIds = customRoleAssignments[activeServer]?.[session.user.id] || [];
  const myCustomPermissions = customServerRoles.filter(role => myCustomRoleIds.includes(role.id)).reduce((permissions, role) => ({...permissions, ...Object.fromEntries(Object.entries(role.permissions||{}).map(([key,enabled])=>[key,Boolean(permissions[key as keyof typeof permissions]||enabled)]))}), {} as ServerRole["permissions"]);
  const canManageRoles = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_roles);
  const canManageChannels = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_channels);
  const canReorderCategoriesAndChannels = Boolean(isOwnerOrAdmin || myCustomPermissions.reorder_categories_channels);
  const canManageMessages = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_messages);
  const canKickMembers = Boolean(isOwnerOrAdmin || myCustomPermissions.kick_members);
  const canManageServer = Boolean(isOwnerOrAdmin || myCustomPermissions.manage_server);
  const orderedServerCategories = channelCategories.filter(item=>item.serverId===activeServer&&item.id&&item.name!=="Text Channels").sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name));
  const serverChannels = channels.filter(c => (c.serverId || "block-buddies") === activeServer);
  const serverOrderGroups = useMemo(() => {
    const groups:Record<string,Channel[]>={};
    for(const category of channelCategories.filter(item=>item.serverId===activeServer).sort((a,b)=>a.name==="Text Channels"?-1:b.name==="Text Channels"?1:(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)))groups[category.name]=[];
    for(const channel of serverChannels)(groups[channel.category||"Text Channels"]||=[]).push(channel);
    for(const category of Object.keys(groups))groups[category].sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    return Object.entries(groups);
  },[serverChannels,channelCategories,activeServer]);
  const unreadPingNotifications = notifications.filter(notification => !notification.read_at && notification.type === "mention" && notification.actor_id);
  const dmConversationIds = new Set(Object.values(conversationIds));
  const unreadDmPingNotifications = unreadPingNotifications.filter(notification => Boolean(notification.entity_id && dmConversationIds.has(notification.entity_id)));
  const inboxNotifications = notifications;
  const inboxUnreadTotal = inboxNotifications.filter(notification => !notification.read_at).length;
  const logoUnreadTotal = unreadDmPingNotifications.length;
  const dmUnreadActors = Object.entries(conversationIds)
    .map(([personId, conversationId]) => {
      const person = people.find(item => item.id === personId);
      const unreadCount = notifications.filter(notification =>
        !notification.read_at &&
        notification.type === "message" &&
        notification.entity_id === conversationId
      ).length;
      return person && unreadCount > 0 ? { person, unreadCount, conversationId } : null;
    })
    .filter((item): item is { person: Person; unreadCount: number; conversationId: string } => Boolean(item))
    .sort((a, b) => {
      const latestA = notifications.find(notification => !notification.read_at && notification.type === "message" && notification.entity_id === a.conversationId)?.created_at || "";
      const latestB = notifications.find(notification => !notification.read_at && notification.type === "message" && notification.entity_id === b.conversationId)?.created_at || "";
      return latestB.localeCompare(latestA);
    })
    .slice(0, 5);
  useEffect(() => { document.title = logoUnreadTotal > 0 ? `Voax [${logoUnreadTotal}]` : "Voax"; }, [logoUnreadTotal]);

  const activeChannel = serverChannels.find(c => c.id === active) || serverChannels[0];
  useEffect(() => {
    let cancelled = false;
    const loadAccess = async () => {
      if (view !== "channel" || !activeChannel?.id) {
        setActiveChannelAccessOverwrites([]);
        return;
      }
      const query = supabase.from("channel_permission_overwrites")
        .select("target_type,target_id,allow_permissions,deny_permissions")
        .eq("server_id", activeChannel.serverId || activeServer);
      const result = activeChannel.permissionsSynced && activeChannel.categoryId
        ? await query.eq("category_id", activeChannel.categoryId)
        : await query.eq("channel_id", activeChannel.id);
      if (cancelled) return;
      if (result.error) {
        console.warn("Could not load channel member visibility:", result.error.message);
        setActiveChannelAccessOverwrites([]);
        return;
      }
      setActiveChannelAccessOverwrites((result.data || []) as typeof activeChannelAccessOverwrites);
    };
    void loadAccess();
    return () => { cancelled = true; };
  }, [view, activeChannel?.id, activeChannel?.categoryId, activeChannel?.permissionsSynced, activeChannel?.serverId, activeServer]);

  const canViewActiveChannel = (userId: string) => {
    if (!activeChannel || userId === session.user.id) return true;
    const overwrites = activeChannelAccessOverwrites;
    const everyone = overwrites.find(row => row.target_type === "everyone");
    let allowed = true;
    if (everyone?.deny_permissions?.includes("view_channel")) allowed = false;
    if (everyone?.allow_permissions?.includes("view_channel")) allowed = true;
    const assignedRoleIds = customRoleAssignments[activeServer]?.[userId] || [];
    const roleRows = overwrites.filter(row => row.target_type === "role" && row.target_id && assignedRoleIds.includes(row.target_id));
    const roleDenied = roleRows.some(row => row.deny_permissions?.includes("view_channel"));
    const roleAllowed = roleRows.some(row => row.allow_permissions?.includes("view_channel"));
    if (roleDenied) allowed = false;
    if (roleAllowed) allowed = true;
    const member = overwrites.find(row => row.target_type === "member" && row.target_id === userId);
    if (member?.deny_permissions?.includes("view_channel")) allowed = false;
    if (member?.allow_permissions?.includes("view_channel")) allowed = true;
    return allowed;
  };
  const visibleChannelMemberPeople = serverMemberPeople.filter(person => canViewActiveChannel(person.id));
  const visibleChannelOnlineCount = visibleChannelMemberPeople.filter(person => person.online).length + (presenceByUser[session.user.id] && presenceByUser[session.user.id] !== "Offline" ? 1 : 0);

  const activePerson = people.find(p => p.name.toLowerCase() === active.toLowerCase());
  const activeKey = keyFor(view === "dm" ? "dm" : "channel", active);
  const activeConversationId = view === "dm" && activePerson ? conversationIds[activePerson.id] : null;
  const activeKeyRef = useRef(activeKey);
  useEffect(() => { activeKeyRef.current = activeKey; activeRef.current = active; viewRef.current = view; peopleRef.current = people; nameRef.current = name; }, [activeKey, active, view, people, name]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{try{let profile=await supabase.from("profiles").select("username,status,avatar_url,public_id").eq("id",session.user.id).maybeSingle();if(profile.error)throw profile.error;if(!profile.data){const p=await supabase.from("profiles").upsert({id:session.user.id,username:String(session.user.user_metadata?.username||session.user.user_metadata?.global_name||session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.user_metadata?.preferred_username||session.user.email?.split("@")[0]||"Player").slice(0,32),status:"Online",avatar_url:session.user.user_metadata?.avatar_url||null},{onConflict:"id",ignoreDuplicates:true});if(p.error)throw p.error;profile=await supabase.from("profiles").select("username,status,avatar_url,public_id").eq("id",session.user.id).maybeSingle();if(profile.error)throw profile.error;}if(profile.data){const oauthName=String(session.user.user_metadata?.username||session.user.user_metadata?.global_name||session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.user_metadata?.preferred_username||"").trim().replace(/\s+/g," ").slice(0,32);const resolvedName=profile.data.username==="Player"&&oauthName?oauthName:(profile.data.username||oauthName||"Player");setName(resolvedName);setStatus((profile.data.status||"Online") as PresenceStatus);let resolvedAvatar=profile.data.avatar_url||null;const providerAvatar=session.user.user_metadata?.avatar_url;if(!resolvedAvatar&&typeof providerAvatar==="string"&&providerAvatar.startsWith("https://")){const {error:avatarSyncError}=await supabase.from("profiles").update({avatar_url:providerAvatar,...(profile.data.username==="Player"&&oauthName?{username:oauthName}:{})}).eq("id",session.user.id);if(!avatarSyncError)resolvedAvatar=providerAvatar;}else if(profile.data.username==="Player"&&oauthName){await supabase.from("profiles").update({username:oauthName}).eq("id",session.user.id);}setAvatarUrl(resolvedAvatar);}await loadWorkspace();}catch(error){if(!cancelled)notify("Couldn't load your Voax workspace: "+(error instanceof Error?error.message:"Please try again."));}finally{if(!cancelled)setWorkspaceLoading(false);}})();
    return()=>{cancelled=true;};
  },[session.user.id]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?activeConversationId:null;
    if(!channelId&&!conversationId||channelId&&activeChannel&&activeChannel.channelType!=="text"){setMessagesLoading(false);return;}let cancelled=false;setMessagesLoading(true);
    const loadMessages=async()=>{
      const result=channelId?await supabase.from("messages").select("id,author_id,body,created_at,edited_at,reply_to,channel_id,conversation_id,attachments").eq("channel_id",channelId).order("created_at",{ascending:false}).limit(200):await supabase.from("messages").select("id,author_id,body,created_at,edited_at,reply_to,channel_id,conversation_id,attachments").eq("conversation_id",conversationId!).order("created_at",{ascending:false}).limit(200);
      if(cancelled)return;if(result.error){notify("Couldn't load messages: "+result.error.message);setMessagesLoading(false);return;}
      const rows=[...(result.data||[])].reverse(),authorIds=[...new Set(rows.map(row=>row.author_id))];
      const names=new Map<string,string>(peopleRef.current.map(person=>[person.id,person.name] as const));names.set(session.user.id,nameRef.current);
      const missingAuthorIds=authorIds.filter(id=>!names.has(id));
      if(missingAuthorIds.length){const profiles=await loadCachedProfiles(missingAuthorIds);for(const profile of profiles)names.set(profile.id,profile.username||"Player");}
      const byId=new Map(rows.map(row=>[row.id,row]));
      const reactionMap=new Map<string,Reaction[]>();
      if(rows.length){const rr=await supabase.from("message_reactions").select("message_id,user_id,emoji").in("message_id",rows.map(row=>row.id));if(rr.error){notify("Unable to load reactions: "+rr.error.message);setMessagesLoading(false);return;}for(const r of rr.data||[]){const list=reactionMap.get(r.message_id)||[];const existing=list.find(x=>x.emoji===r.emoji);if(existing){existing.count++;if(r.user_id===session.user.id)existing.reacted=true;}else list.push({emoji:r.emoji,count:1,reacted:r.user_id===session.user.id});reactionMap.set(r.message_id,list);}}
      // Sign all attachment URLs in one Storage request instead of one request per message.
      const signedAttachments=await signMessageAttachments(rows.flatMap(row=>Array.isArray(row.attachments)?row.attachments as Omit<Attachment,"url">[]:[]));
      const attachmentUrls=new Map(signedAttachments.map(attachment=>[attachment.path,attachment.url] as const));
      const mapped:Message[]=rows.map(row=>{const reply=row.reply_to?byId.get(row.reply_to):null;const attachments=Array.isArray(row.attachments)?(row.attachments as Omit<Attachment,"url">[]).map(attachment=>({...attachment,url:attachmentUrls.get(attachment.path)})):[];return{id:row.id,author:names.get(row.author_id)||(row.author_id===session.user.id?nameRef.current:"Member"),text:row.body,time:formatClock(new Date(row.created_at), clockFormat),timestamp:row.created_at,...(row.edited_at?{editedAt:row.edited_at}:{}),own:row.author_id===session.user.id,...(reply?{replyTo:{author:names.get(reply.author_id)||"Member",text:reply.body}}:{}),...(reactionMap.has(row.id)?{reactions:reactionMap.get(row.id)}:{}),...(attachments.length?{attachments}:{})};});
      setMessages(old=>({...old,[activeKey]:mapped,[active]:mapped}));setMessagesLoading(false);
    };
    void loadMessages().catch(error=>{if(!cancelled){notify("Couldn't load messages: "+(error instanceof Error?error.message:"Please try again."));setMessagesLoading(false);}});
    return()=>{cancelled=true;};
  },[active,activeKey,view,session.user.id,activeConversationId,activePerson?.id,activeChannel?.channelType,clockFormat]);
  useEffect(()=>{
    const channelId=view==="channel"?active:null,conversationId=view==="dm"&&activePerson?activeConversationId:null;
    if(!channelId&&!conversationId||channelId&&activeChannel&&activeChannel.channelType!=="text")return;
    const filter=channelId?"channel_id=eq."+channelId:"conversation_id=eq."+conversationId;
    const realtime=supabase.channel("voax-messages-"+(channelId||conversationId))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter},async payload=>{
        const row=payload.new as {id:string;author_id:string;body:string;created_at:string;edited_at?:string|null;reply_to:string|null;attachments?:unknown};
        const attachments=await signMessageAttachments(row.attachments);
        const message:Message={id:row.id,author:row.author_id===session.user.id?nameRef.current:(peopleRef.current.find(p=>p.id===row.author_id)?.name||"Member"),text:row.body,time:formatClock(new Date(row.created_at), clockFormat),timestamp:row.created_at,...(row.edited_at?{editedAt:row.edited_at}:{}),own:row.author_id===session.user.id,...(attachments.length?{attachments}:{})};
        setMessages(old=>{const list=old[activeKey]||old[active]||[];if(list.some(m=>m.id===message.id))return old;const next=[...list,message];return{...old,[activeKey]:next,[active]:next};});
      })
      .on("broadcast",{event:"message-updated"},payload=>{const updated=payload.payload as {id?:string;body?:string;editedAt?:string};if(!updated?.id||typeof updated.body!=="string")return;setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.map(message=>message.id===updated.id?{...message,text:updated.body!,editedAt:updated.editedAt}:message)])));})
      .on("broadcast",{event:"message-deleted"},payload=>{
        const deletedId=payload.payload?.id;
        if(typeof deletedId!=="string")return;
        setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.filter(message=>message.id!==deletedId)])));
      }).subscribe();
    messageEventsChannelRef.current=realtime;
    return()=>{if(messageEventsChannelRef.current===realtime)messageEventsChannelRef.current=null;void supabase.removeChannel(realtime);};
  },[active,activeKey,view,session.user.id,activeConversationId,activePerson?.id,activeChannel?.channelType]);

  useEffect(()=>{
    const channel=supabase.channel("voax-presence",{config:{presence:{key:session.user.id}}});
    const sync=()=>{const state=channel.presenceState() as Record<string,Array<{userId?:string;status?:PresenceStatus;serverIds?:string[]}>>;const next:Record<string,PresenceStatus>={};const byServer:Record<string,Set<string>>={};for(const entries of Object.values(state))for(const entry of entries){if(!entry.userId)continue;const currentStatus=entry.status||"Online";next[entry.userId]=currentStatus;if(currentStatus!=="Offline")for(const serverId of entry.serverIds||[])(byServer[serverId]||=new Set()).add(entry.userId);}setPresenceByUser(next);const counts:Record<string,number>={};for(const [serverId,users] of Object.entries(byServer))counts[serverId]=users.size;setPresenceByServer(counts);};
    channel.on("presence",{event:"sync"},sync).subscribe(async state=>{if(state==="SUBSCRIBED"){if(status==="Offline")await channel.untrack();else await channel.track({userId:session.user.id,status,online_at:new Date().toISOString(),serverIds:discoverableServerIds});sync();}});
    return()=>{void channel.untrack();void supabase.removeChannel(channel);};
  },[session.user.id,status,discoverableServerIds]);
  useEffect(()=>{setPeople(old=>old.map(person=>({...person,online:Boolean(presenceByUser[person.id]&&presenceByUser[person.id]!=="Offline"),status:presenceByUser[person.id]||"Offline"})));},[presenceByUser]);
  useEffect(()=>{let cancelled=false;const load=async()=>{const {data,error}=await supabase.from("user_notification_blocks").select("blocked_actor_id").eq("user_id",session.user.id);if(cancelled)return;if(error){console.warn("Notification blocks unavailable",error.message);}else setBlockedNotificationActors((data||[]).map(row=>row.blocked_actor_id));};void load();return()=>{cancelled=true;};},[session.user.id]);
  useEffect(()=>{let cancelled=false;const load=async()=>{const {data,error}=await supabase.from("user_notification_preferences").select("global_mode,direct_mentions_enabled,role_mentions_enabled,everyone_mentions_enabled,here_mentions_enabled").eq("user_id",session.user.id).maybeSingle();if(cancelled)return;if(error){notify("Unable to load notification preferences: "+error.message);return;}if(data){setGlobalNotificationMode(data.global_mode||"all");setDirectMentionsEnabled(data.direct_mentions_enabled!==false);setRoleMentionsEnabled(data.role_mentions_enabled!==false);setEveryoneMentionsEnabled(data.everyone_mentions_enabled!==false);setHereMentionsEnabled(data.here_mentions_enabled!==false);}};void load();return()=>{cancelled=true;};},[session.user.id]);
  useEffect(()=>{if(!activeServer)return;let cancelled=false;const load=async()=>{const {data,error}=await supabase.from("server_ping_settings").select("confirmation_threshold,cooldown_seconds,admin_mass_pings_enabled,direct_targets_per_10s,role_actions_per_60s,messages_per_5s").eq("server_id",activeServer).maybeSingle();if(cancelled)return;if(error){console.warn("Ping settings unavailable",error.message);return;}if(data)setServerPingSettings({confirmation_threshold:data.confirmation_threshold??25,cooldown_seconds:data.cooldown_seconds??60,admin_mass_pings_enabled:data.admin_mass_pings_enabled??true,direct_targets_per_10s:data.direct_targets_per_10s??10,role_actions_per_60s:data.role_actions_per_60s??5,messages_per_5s:data.messages_per_5s??5});};void load();return()=>{cancelled=true;};},[activeServer]);
  useEffect(()=>{let cancelled=false;const load=async()=>{if(!activeServer&&!(view==="channel"&&active)){setServerNotificationMode("inherit");setChannelNotificationMode("inherit");return;}try{const data=await loadCachedNotificationOverrides(session.user.id);if(cancelled)return;const serverMode=data.find(row=>row.scope_type==="server"&&row.scope_id===activeServer)?.mode;const channelMode=data.find(row=>row.scope_type==="channel"&&row.scope_id===active)?.mode;setServerNotificationMode(serverMode||"inherit");setChannelNotificationMode(channelMode||"inherit");}catch(error){if(!cancelled)console.warn("Notification overrides unavailable",error instanceof Error?error.message:error);}};void load();return()=>{cancelled=true;};},[session.user.id,activeServer,active,view]);
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{const {data,error}=await supabase.from("notifications").select("id,actor_id,type,title,body,entity_id,read_at,created_at,interruptive").order("created_at",{ascending:false}).limit(100);if(cancelled)return;if(error){notify("Unable to load notifications: "+error.message);return;}const rows=(data||[]) as AppNotification[];rows.forEach(row=>seenNotificationIdsRef.current.add(row.id));setNotifications(current=>[...current.filter(row=>!rows.some(loaded=>loaded.id===row.id)),...rows].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,100));};
    void load();const channel=supabase.channel("voax-notifications-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"recipient_id=eq."+session.user.id},payload=>{const incoming=payload.new as AppNotification;const isNew=!seenNotificationIdsRef.current.has(incoming.id);seenNotificationIdsRef.current.add(incoming.id);const isOpenDmMessage=incoming.type==="message"&&view==="dm"&&Boolean(activeConversationId)&&incoming.entity_id===activeConversationId;const row=isOpenDmMessage?{...incoming,read_at:new Date().toISOString()}:incoming;setNotifications(old=>[row,...old.filter(n=>n.id!==row.id)].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,100));if(isOpenDmMessage&&incoming.read_at===null){void supabase.from("notifications").update({read_at:row.read_at}).eq("id",incoming.id).eq("recipient_id",session.user.id).is("read_at",null);}if(isNew&&row.interruptive!==false&&!isMessageActivityNotification(row))notify(row.title);}).subscribe();
    return()=>{cancelled=true;void supabase.removeChannel(channel);};
  },[session.user.id,view,activeConversationId]);
  useEffect(()=>{const channel=supabase.channel("voax-channel-unread-"+session.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{const row=payload.new as {id:string;channel_id:string|null;author_id:string;created_at:string};if(!row.channel_id||row.author_id===session.user.id||(viewRef.current==="channel"&&activeRef.current===row.channel_id))return;const key=keyFor("channel",row.channel_id);setUnread(old=>({...old,[key]:(old[key]||0)+1}));}).subscribe();return()=>{void supabase.removeChannel(channel);};},[session.user.id]);

  useEffect(()=>{
    if((view!=="channel"&&view!=="dm")||messagesLoading)return;
    const scrollContainer=document.querySelector<HTMLElement>(".message-scroll");
    if(scrollContainer)scrollContainer.scrollTop=scrollContainer.scrollHeight;
  },[active,activeKey,view,messagesLoading]);

  useEffect(()=>{
    if(!pendingMentionJumpId||view!=="channel"||messagesLoading)return;
    const target=document.querySelector<HTMLElement>(`[data-message-id="${pendingMentionJumpId}"]`);
    if(!target)return;
    target.scrollIntoView({behavior:"smooth",block:"center"});
    target.classList.add("message-mention-target");
    const timeout=window.setTimeout(()=>target.classList.remove("message-mention-target"),2600);
    setPendingMentionJumpId(null);
    return()=>window.clearTimeout(timeout);
  },[pendingMentionJumpId,view,active,activeKey,messagesLoading,messages]);

  useEffect(()=>{
    const conversationId=activeConversationId;
    if(!conversationId){voiceChannelRef.current=null;return;}
    const channel=supabase.channel("voax-voice-"+conversationId,{config:{broadcast:{self:false},private:true}});
    voiceChannelRef.current=channel;
    channel.on("broadcast",{event:"voice-signal"},async({payload})=>{
      if(payload?.to!==session.user.id||payload?.from!==activePerson?.id)return;
      try{
        if(payload.kind==="offer"&&payload.description&&!peerConnectionRef.current){setIncomingVoiceOffer({from:payload.from,description:payload.description});notify("Incoming voice call. Press the voice button to answer.");}
        else if(payload.kind==="answer"&&payload.description&&peerConnectionRef.current){await peerConnectionRef.current.setRemoteDescription(payload.description);await applyQueuedIce(peerConnectionRef.current);}
        else if(payload.kind==="ice"&&payload.candidate){if(peerConnectionRef.current?.remoteDescription)await peerConnectionRef.current.addIceCandidate(payload.candidate);else queuedIceCandidatesRef.current.push(payload.candidate);}
        else if(payload.kind==="hangup"){stopVoiceCall(false);notify("The voice call ended.");}
      }catch(error){notify("Voice connection error: "+(error instanceof Error?error.message:"Please try again."));}
    }).subscribe();
    return()=>{if(voiceChannelRef.current===channel)voiceChannelRef.current=null;void supabase.removeChannel(channel);if(peerConnectionRef.current)stopVoiceCall(false);};
  },[view,activePerson?.id,activeConversationId,session.user.id]);
  useEffect(()=>{
    if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);
    const channel=supabase.channel("voax-typing-"+activeKey);
    typingChannelRef.current=channel;
    channel.on("broadcast",{event:"typing"},({payload})=>{if(payload?.userId===session.user.id||payload?.activeKey!==activeKey)return;setTypingPerson(payload?.typing?String(payload?.name||"Someone"):null);if(payload?.typing){if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);typingTimeoutRef.current=window.setTimeout(()=>setTypingPerson(null),1800);}}).subscribe();
    return()=>{if(typingTimeoutRef.current!==null)window.clearTimeout(typingTimeoutRef.current);typingChannelRef.current=null;void supabase.removeChannel(channel);};
  },[activeKey,session.user.id]);

  const currentMessages = messages[activeKey] || messages[active] || [];
  const currentMessageIds = currentMessages.map(message=>message.id).join(",");
  useEffect(()=>{currentMessageIdsRef.current=currentMessageIds?currentMessageIds.split(","):[];},[currentMessageIds]);
  useEffect(()=>{const channel=supabase.channel("voax-reactions-"+activeKey).on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{const eventType=(payload as any).eventType as string;const row=((eventType==="DELETE"?(payload as any).old:(payload as any).new)||{}) as {message_id?:string;user_id?:string;emoji?:string};if(!row.message_id||!row.emoji||row.user_id===session.user.id||!currentMessageIdsRef.current.includes(row.message_id))return;const delta=eventType==="DELETE"?-1:1;setMessages(old=>{const key=activeKeyRef.current;const list=old[key]||old[activeRef.current]||[];return{...old,[key]:list.map(message=>{if(message.id!==row.message_id)return message;const reactions=[...(message.reactions||[])];const index=reactions.findIndex(reaction=>reaction.emoji===row.emoji);if(index<0){if(delta<0)return message;reactions.push({emoji:row.emoji!,count:1,reacted:false});}else{const count=reactions[index].count+delta;if(count<=0)reactions.splice(index,1);else reactions[index]={...reactions[index],count};}return{...message,reactions};})};});}).subscribe();return()=>{void supabase.removeChannel(channel);};},[activeKey,session.user.id]);

  const unblockedMessages = currentMessages.filter(message => {
    const authorId = message.own ? session.user.id : people.find(person => person.name === message.author)?.id;
    return !authorId || !blockedUserIds.has(authorId);
  });
  const visibleMessages = search.trim() && (view === "channel" || view === "dm")
    ? unblockedMessages.filter(message => message.text.toLowerCase().includes(search.trim().toLowerCase()) || message.author.toLowerCase().includes(search.trim().toLowerCase()))
    : unblockedMessages;
  const filteredPeople = useMemo(() => people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || p.online) && (view !== "friends" || p.isFriend) && (view !== "home" || p.hasConversation)).sort((a,b) => (dmActivity[b.id] || 0) - (dmActivity[a.id] || 0)), [people, search, filter, view, dmActivity]);
  const filteredChannels = serverChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const channelGroups = useMemo(() => { const groups: Record<string, Channel[]> = {}; const categories=channelCategories.filter(item=>item.serverId===activeServer).sort((a,b)=>a.name==="Text Channels"?-1:b.name==="Text Channels"?1:(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)); for (const category of categories) groups[category.name]=[]; for (const channel of filteredChannels) (groups[channel.category || "Text Channels"] ||= []).push(channel); for (const category of Object.keys(groups)) groups[category].sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)); return Object.entries(groups); }, [filteredChannels, channelCategories, activeServer]);

  function notify(text: string) { setToast(text); }
  async function withBusyAction(key: string, action: () => Promise<unknown>) {
    if (busyAction) return;
    setBusyAction(key);
    try { await action(); } finally { setBusyAction(null); }
  }
  function stopVoiceCall(notifyPeer=true){
    if(notifyPeer&&activePerson&&voiceChannelRef.current)void voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"hangup",from:session.user.id,to:activePerson.id}});
    peerConnectionRef.current?.close();peerConnectionRef.current=null;
    localStreamRef.current?.getTracks().forEach(track=>track.stop());localStreamRef.current=null;
    if(remoteAudioRef.current)remoteAudioRef.current.srcObject=null;
    queuedIceCandidatesRef.current=[];setVoiceConnected(false);setIncomingVoiceOffer(null);
  }
  function createVoicePeer(remoteUserId:string){
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    peerConnectionRef.current=pc;
    pc.onicecandidate=event=>{if(event.candidate&&voiceChannelRef.current)void voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"ice",from:session.user.id,to:remoteUserId,candidate:event.candidate.toJSON()}});};
    pc.ontrack=event=>{if(remoteAudioRef.current){remoteAudioRef.current.srcObject=event.streams[0];remoteAudioRef.current.muted=!audioEnabled;void remoteAudioRef.current.play().catch(()=>{});}};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==="connected"){setVoiceConnected(true);notify("Voice call connected.");}else if(pc.connectionState==="failed"||pc.connectionState==="closed"){if(peerConnectionRef.current===pc)stopVoiceCall(false);}};
    return pc;
  }
  async function applyQueuedIce(pc:RTCPeerConnection){const queued=queuedIceCandidatesRef.current.splice(0);for(const candidate of queued){try{await pc.addIceCandidate(candidate);}catch{/* stale ICE candidates can be ignored */}}}
  async function startVoiceCall(){
    if(view!=="dm"||!activePerson||!conversationIds[activePerson.id]){notify("Open a direct message before starting a voice call.");return;}
    if(!voiceChannelRef.current){notify("Voice signaling is still connecting. Try again in a moment.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});localStreamRef.current=stream;
      const pc=createVoicePeer(activePerson.id);stream.getAudioTracks().forEach(track=>{track.enabled=microphoneEnabled;pc.addTrack(track,stream);});
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      await voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"offer",from:session.user.id,to:activePerson.id,description:pc.localDescription?.toJSON()}});
      setVoiceConnected(true);notify("Calling "+activePerson.name+"… Keep this DM open so they can receive the call.");
    }catch(error){stopVoiceCall(false);notify("Unable to start voice call: "+(error instanceof Error?error.message:"Allow microphone access and try again."));}
  }
  async function answerVoiceCall(){
    const incoming=incomingVoiceOffer;if(!incoming||!voiceChannelRef.current)return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});localStreamRef.current=stream;
      const pc=createVoicePeer(incoming.from);stream.getAudioTracks().forEach(track=>{track.enabled=microphoneEnabled;pc.addTrack(track,stream);});
      await pc.setRemoteDescription(incoming.description);await applyQueuedIce(pc);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      await voiceChannelRef.current.send({type:"broadcast",event:"voice-signal",payload:{kind:"answer",from:session.user.id,to:incoming.from,description:pc.localDescription?.toJSON()}});
      setIncomingVoiceOffer(null);setVoiceConnected(true);notify("Joining voice call…");
    }catch(error){stopVoiceCall(false);notify("Unable to answer voice call: "+(error instanceof Error?error.message:"Allow microphone access and try again."));}
  }
  async function toggleVoiceCall(){if(peerConnectionRef.current||voiceConnected){stopVoiceCall();notify("Voice call ended.");return;}if(incomingVoiceOffer){await answerVoiceCall();return;}await startVoiceCall();}
  async function changeStatus(nextStatus: PresenceStatus) {
    setStatusMenuOpen(false);
    if (nextStatus === status) return;
    const { error } = await supabase.from("profiles").update({ status: nextStatus }).eq("id", session.user.id);
    if (error) { notify("Could not update your status: " + error.message); return; }
    setStatus(nextStatus);
    notify("Status set to " + nextStatus + ".");
  }
  async function saveProfile(e:FormEvent){
    e.preventDefault();
    const displayName=name.trim().replace(/\s+/g," ");
    if(displayName.length<2){notify("Your display name must be at least 2 characters.");return;}
    const {error}=await supabase.from("profiles").update({username:displayName,status,avatar_url:avatarUrl,bio:profileBio.trim().slice(0,190)}).eq("id",session.user.id);
    if(error){if(error.code==="23505"||error.message.includes("profiles_username_lower_unique")){notify("That display name is already taken. Please choose another.");return;}notify("Couldn't save your profile: "+error.message);return;}
    setName(displayName);setModal(null);notify("Profile saved.");
  }
  async function uploadAvatar(file:File|null){
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){notify("Choose a JPG, PNG, WebP, or GIF image.");return;}
    if(file.size>5*1024*1024){notify("Profile pictures must be 5 MB or smaller.");return;}
    setAvatarBusy(true);
    try{
      const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"} as Record<string,string>)[file.type];
      const path=session.user.id+"/"+crypto.randomUUID()+"."+extension;
      const {error:uploadError}=await supabase.storage.from("avatars").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("avatars").getPublicUrl(path);
      const {error:profileError}=await supabase.from("profiles").update({avatar_url:data.publicUrl}).eq("id",session.user.id);
      if(profileError){await supabase.storage.from("avatars").remove([path]);throw profileError;}
      setAvatarUrl(data.publicUrl);notify("Profile picture updated.");
    }catch(error){notify("Couldn't upload your picture: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setAvatarBusy(false);}
  }
  async function uploadServerIcon(file:File|null){
    if(!file||!currentServer)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){notify("Choose a JPG, PNG, WebP, or GIF image.");return;}
    if(file.size>5*1024*1024){notify("Server icons must be 5 MB or smaller.");return;}
    setServerIconBusy(true);
    try{
      const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"} as Record<string,string>)[file.type];
      const path=currentServer.id+"/"+crypto.randomUUID()+"."+extension;
      const {error:uploadError}=await supabase.storage.from("server-icons").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("server-icons").getPublicUrl(path);
      const {error:updateError}=await supabase.from("servers").update({icon_url:data.publicUrl}).eq("id",currentServer.id);
      if(updateError){await supabase.storage.from("server-icons").remove([path]);throw updateError;}
      setServers(old=>old.map(server=>server.id===currentServer.id?{...server,iconUrl:data.publicUrl}:server));
      notify("Server image updated.");
    }catch(error){notify("Couldn't upload the server image: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setServerIconBusy(false);}
  }
  async function removeServerMember(userId:string){
    if(!currentServer||!canKickMembers||userId===currentServer.createdBy||userId===session.user.id)return;
    const person=people.find(item=>item.id===userId);
    if(!window.confirm("Remove "+(person?.name||"this member")+" from "+currentServer.name+"?"))return;
    const {error}=await supabase.from("server_members").delete().eq("server_id",currentServer.id).eq("user_id",userId);
    if(error){notify("Couldn't remove member: "+error.message);return;}
    setServerMembersByServer(old=>({...old,[currentServer.id]:(old[currentServer.id]||[]).filter(id=>id!==userId)}));
    setCustomRoleAssignments(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{})}}));
    notify("Member removed from server.");
    void loadWorkspace();
  }
  async function updateMemberRole(userId:string,role:"admin"|"member"){
    if(!currentServer||!isOwnerOrAdmin||userId===currentServer.createdBy||userId===session.user.id)return;
    if(currentServer.role!=="owner"&&role==="admin"){notify("Only the server owner can assign admin roles.");return;}
    const {error}=await supabase.from("server_members").update({role}).eq("server_id",currentServer.id).eq("user_id",userId);
    if(error){notify("Couldn't update the member role: "+error.message);return;}
    setServerMemberRoles(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{}),[userId]:role}}));
    notify("Member role updated.");
  }
  async function loadCustomServerRoles(serverId:string){
    const [{data:roles,error:rolesError},{data:assignments,error:assignError}]=await Promise.all([
      supabase.from("server_roles").select("id,server_id,name,color,position,permissions,allow_anyone_to_mention").eq("server_id",serverId).order("position",{ascending:false}).order("created_at"),
      supabase.from("server_member_roles").select("server_id,user_id,role_id").eq("server_id",serverId)
    ]);
    if(rolesError||assignError){notify("Couldn't load custom roles: "+(rolesError?.message||assignError?.message));return;}
    setCustomServerRoles(roles||[]);
    const map:Record<string,string[]>={};
    for(const row of assignments||[])(map[row.user_id] ||= []).push(row.role_id);
    setCustomRoleAssignments(old=>({...old,[serverId]:map}));
  }
  async function createCustomServerRole(e:FormEvent){
    e.preventDefault();
    if(!currentServer||!canManageRoles)return;
    const value=newRoleName.trim().replace(/\s+/g," ");
    if(!value)return;
    const normalizedName=value.toLocaleLowerCase();
    if(customServerRoles.some(role=>role.name.trim().toLocaleLowerCase()===normalizedName)){
      notify("A role with this name already exists in this server. Choose a different name.");
      return;
    }
    const permissions={...newRolePermissions};
    if(currentServer.role!=="owner"){permissions.manage_roles=false;permissions.manage_server=false;}
    const {data,error}=await supabase.from("server_roles").insert({server_id:currentServer.id,name:value,color:newRoleColor,permissions,position:customServerRoles.length}).select("id,server_id,name,color,position,permissions,allow_anyone_to_mention").single();
    if(error||!data){
      if(error?.code==="23505"||error?.message?.includes("server_roles_server_id_name_key")){
        const {data:latestRoles}=await supabase.from("server_roles").select("id,server_id,name,color,position,permissions,allow_anyone_to_mention").eq("server_id",currentServer.id).order("position",{ascending:false}).order("created_at");
        if(latestRoles)setCustomServerRoles(latestRoles as ServerRole[]);
        notify("A role with this name already exists in this server. Choose a different name.");
      }else{
        notify("Couldn't create role: "+(error?.message||"Please try again."));
      }
      return;
    }
    setCustomServerRoles(old=>[...old,data as ServerRole]);
    setSelectedRoleId(data.id);
    setRoleEditorTab("display");
    setNewRoleName("");
    notify("Role created.");
  }
  async function assignCustomServerRole(userId:string,roleId:string){
    if(!currentServer||!canManageRoles||!roleId)return;
    const isCurrentUserServerOwner=currentServer.createdBy===session.user.id;
    if(userId===currentServer.createdBy&&userId!==session.user.id)return;
    if(userId===session.user.id&&!isCurrentUserServerOwner)return;
    const previous=customRoleAssignments[currentServer.id]?.[userId]||[];
    const isAssigned=previous.includes(roleId);
    if(isAssigned){
      const {error}=await supabase.from("server_member_roles").delete().eq("server_id",currentServer.id).eq("user_id",userId).eq("role_id",roleId);
      if(error){notify("Couldn't remove role: "+error.message);return;}
      setCustomRoleAssignments(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{}),[userId]:previous.filter(id=>id!==roleId)}}));
      notify("Role removed.");
      return;
    }
    const {error}=await supabase.from("server_member_roles").insert({server_id:currentServer.id,user_id:userId,role_id:roleId});
    if(error){notify("Couldn't assign role: "+error.message);return;}
    setCustomRoleAssignments(old=>({...old,[currentServer.id]:{...(old[currentServer.id]||{}),[userId]:[...(old[currentServer.id]?.[userId]||[]),roleId]}}));
    notify("Role assigned.");
  }
  async function moveCustomRole(roleId:string,direction:-1|1){
    if(!currentServer||!canManageRoles)return;
    const ordered=[...customServerRoles].sort((a,b)=>b.position-a.position);
    const index=ordered.findIndex(role=>role.id===roleId);
    const targetIndex=index+direction;
    if(index<0||targetIndex<0||targetIndex>=ordered.length)return;
    const current=ordered[index],target=ordered[targetIndex];
    const {error}=await supabase.from("server_roles").update({position:target.position}).eq("id",current.id).eq("server_id",currentServer.id);
    if(error){notify("Couldn't reorder roles: "+error.message);return;}
    const {error:swapError}=await supabase.from("server_roles").update({position:current.position}).eq("id",target.id).eq("server_id",currentServer.id);
    if(swapError){
      await supabase.from("server_roles").update({position:current.position}).eq("id",current.id).eq("server_id",currentServer.id);
      notify("Couldn't reorder roles: "+swapError.message);return;
    }
    setCustomServerRoles(ordered.map(role=>role.id===current.id?{...role,position:target.position}:role.id===target.id?{...role,position:current.position}:role).sort((a,b)=>b.position-a.position));
    notify("Role order updated.");
  }
  async function saveCustomRoleDetails(roleId:string, changes:Partial<Pick<ServerRole,"name"|"color"|"permissions"|"allow_anyone_to_mention">>){
    if(!currentServer||!canManageRoles)return;
    const role=customServerRoles.find(item=>item.id===roleId);
    if(!role)return;
    const next={...role,...changes};
    if(currentServer.role!=="owner"&&next.permissions){
      next.permissions={...next.permissions,manage_roles:false,manage_server:false};
    }
    setRoleSaveBusy(true);
    const {error}=await supabase.from("server_roles").update({name:next.name,color:next.color,permissions:next.permissions}).eq("id",roleId).eq("server_id",currentServer.id);
    setRoleSaveBusy(false);
    if(error){notify("Couldn't save role: "+error.message);return;}
    setCustomServerRoles(old=>old.map(item=>item.id===roleId?next:item));
    notify("Role saved.");
  }
  async function deleteCustomServerRole(roleId:string){
    if(!currentServer||!canManageRoles)return;
    const role=customServerRoles.find(item=>item.id===roleId);
    if(!role||!window.confirm("Delete the "+role.name+" role and remove it from members?"))return;
    const {error}=await supabase.from("server_roles").delete().eq("id",roleId).eq("server_id",currentServer.id);
    if(error){notify("Couldn't delete role: "+error.message);return;}
    setCustomServerRoles(old=>old.filter(item=>item.id!==roleId));
    await loadCustomServerRoles(currentServer.id);
    notify("Role deleted.");
  }
  async function loadWorkspace() {
    const uid=session.user.id;
    const [staffResult,blockResult,banResult]=await Promise.all([
      supabase.from("voax_staff_roles").select("role").eq("user_id",uid).maybeSingle(),
      supabase.from("voax_account_blocks").select("blocked_id").eq("blocker_id",uid),
      supabase.from("voax_account_bans").select("id,reason,duration,expires_at").eq("user_id",uid).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle()
    ]);
    if(!staffResult.error)setStaffRole((staffResult.data?.role||null) as "owner"|"admin"|"moderator"|null);
    if(!blockResult.error)setBlockedUserIds(new Set((blockResult.data||[]).map(row=>row.blocked_id)));
    if(!banResult.error){
      const currentBan=banResult.data&&(!banResult.data.expires_at||new Date(banResult.data.expires_at)>new Date())?banResult.data:null;
      setAccountBan(currentBan);
      if(currentBan){const appeal=await supabase.from("voax_ban_appeals").select("id").eq("ban_id",currentBan.id).maybeSingle();setAppealSubmitted(Boolean(appeal.data));}
    }
    const {data:ownMemberships,error:membershipError}=await supabase.from("server_members").select("server_id,role").eq("user_id",uid);
    if(membershipError)throw membershipError;
    const serverIds=[...new Set((ownMemberships||[]).map(row=>row.server_id))];
    setDiscoverableServerIds([]);
    let serverRows:any[]=[],channelRows:any[]=[],serverMemberRows:any[]=[],categoryRows:any[]=[],discoveryRows:any[]=[];
    if(serverIds.length){
      const [sr,cr,mr,cat,dr]=await Promise.all([
        supabase.from("servers").select("id,public_id,name,description,created_by,invite_code,icon_url,banner_url").in("id",serverIds).order("created_at"),
        supabase.from("channels").select("id,public_id,server_id,name,description,category,category_id,position,channel_type,permissions_synced").in("server_id",serverIds).order("position").order("created_at"),
        supabase.from("server_members").select("server_id,user_id,role").in("server_id",serverIds),
        supabase.from("channel_categories").select("id,server_id,name,position").in("server_id",serverIds).order("position").order("created_at"),
        supabase.from("server_discovery").select("server_id").in("server_id",serverIds).eq("listing_enabled",true).eq("listing_status","approved")]);
      if(sr.error)throw sr.error;if(cr.error)throw cr.error;if(mr.error)throw mr.error;if(cat.error)throw cat.error;
      serverRows=sr.data||[];channelRows=cr.data||[];serverMemberRows=mr.data||[];categoryRows=cat.data||[];if(!dr.error)discoveryRows=dr.data||[];else console.warn("Public discovery presence metadata unavailable",dr.error.message);
    }
    const [friendResult,ownConvResult]=await Promise.all([
      supabase.from("friendships").select("id,requester_id,addressee_id,status").or("requester_id.eq."+uid+",addressee_id.eq."+uid),
      supabase.from("conversation_members").select("conversation_id,hidden_at").eq("user_id",uid)
    ]);
    const {data:friendships,error:friendError}=friendResult;
    const {data:ownConvs,error:convError}=ownConvResult;
    if(friendError)throw friendError;if(convError)throw convError;
    const convIds=[...new Set((ownConvs||[]).filter(row=>!row.hidden_at).map(row=>row.conversation_id))];
    const convMembersPromise=convIds.length
      ?supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id",convIds)
      :Promise.resolve({data:[],error:null});
    const latestMessagesPromise=convIds.length
      ?supabase.from("messages").select("conversation_id,created_at").in("conversation_id",convIds).order("created_at",{ascending:false}).limit(1000)
      :Promise.resolve({data:[],error:null});
    const unreadCountsPromise=channelRows.length
      ?supabase.rpc("get_unread_channel_counts")
      :Promise.resolve({data:[],error:null});
    const [convMembersResult,latestMessagesResult,unreadCountsResult]=await Promise.all([convMembersPromise,latestMessagesPromise,unreadCountsPromise]);
    if(convMembersResult.error)throw convMembersResult.error;
    if(latestMessagesResult.error)throw latestMessagesResult.error;
    if(unreadCountsResult.error)throw unreadCountsResult.error;
    const latestActivityByConversation:Record<string,number>={};
    for(const row of latestMessagesResult.data||[])if(row.conversation_id&&!latestActivityByConversation[row.conversation_id])latestActivityByConversation[row.conversation_id]=new Date(row.created_at).getTime();
    const convMembers:any[]=convMembersResult.data||[];
    const unreadByChannel:Record<string,number>=Object.fromEntries((unreadCountsResult.data||[]).map((row:{channel_id:string;unread_count:number|string})=>[keyFor("channel",row.channel_id),Number(row.unread_count)||0]));
    const related=new Set<string>();
    for(const row of serverMemberRows)if(row.user_id!==uid)related.add(row.user_id);
    for(const row of friendships||[]){const id=row.requester_id===uid?row.addressee_id:row.requester_id;if(id!==uid)related.add(id);}
    for(const row of convMembers)if(row.user_id!==uid)related.add(row.user_id);
    const profiles=await loadCachedProfiles([...related]);
    const friendIds=new Set<string>();
    for(const row of friendships||[])if(row.status==="accepted")friendIds.add(row.requester_id===uid?row.addressee_id:row.requester_id);
    const convMap:Record<string,string>={},activityByPerson:Record<string,number>={};
    for(const row of convMembers)if(row.user_id!==uid&&convIds.includes(row.conversation_id)&&!convMap[row.user_id]){convMap[row.user_id]=row.conversation_id;activityByPerson[row.user_id]=latestActivityByConversation[row.conversation_id]||0;}
    setDmActivity(activityByPerson);
    const colors=["green","purple","orange","blue","pink"];
    setServers(serverRows.map(row=>({id:row.id,publicId:row.public_id,name:row.name,description:row.description||"Community server",createdBy:row.created_by,inviteCode:row.invite_code,iconUrl:row.icon_url||null,bannerUrl:row.banner_url||null,role:ownMemberships?.find(m=>m.server_id===row.id)?.role||"member"})));
    setDiscoverableServerIds(discoveryRows.map(row=>row.server_id));
    const membersByServer:Record<string,string[]>={},rolesByServer:Record<string,Record<string,"owner"|"admin"|"member">>={};for(const row of serverMemberRows){(membersByServer[row.server_id] ||= []).push(row.user_id);(rolesByServer[row.server_id] ||= {})[row.user_id]=row.role;}setServerMembersByServer(membersByServer);setServerMemberRoles(rolesByServer);
    setFriendRequests((friendships||[]).filter(row=>row.status==="pending"&&row.addressee_id===uid).map(row=>({id:row.id,requester_id:row.requester_id,addressee_id:row.addressee_id,name:profiles.find(p=>p.id===row.requester_id)?.username||"Player",avatarUrl:profiles.find(p=>p.id===row.requester_id)?.avatar_url||null})));
    setChannels(channelRows.map(row=>({id:row.id,publicId:row.public_id,serverId:row.server_id,name:row.name,description:row.description||"",category:row.category||"Text Channels",categoryId:row.category_id||null,position:Number(row.position)||0,channelType:row.channel_type||"text",permissionsSynced:row.permissions_synced!==false})));
    const categoriesByServerAndName=new Map<string,{id?:string;serverId:string;name:string;position:number}>();
    for(const row of categoryRows)categoriesByServerAndName.set(row.server_id+":"+row.name,{id:row.id,serverId:row.server_id,name:row.name,position:Number(row.position)||0});
    for(const row of channelRows){const name=row.category||"Text Channels",key=row.server_id+":"+name;if(!categoriesByServerAndName.has(key))categoriesByServerAndName.set(key,{id:row.category_id||undefined,serverId:row.server_id,name,position:Number.MAX_SAFE_INTEGER});}
    setChannelCategories([...categoriesByServerAndName.values()]);
    if(channelRows.length)setUnread(old=>({...old,...unreadByChannel}));
    setPeople(profiles.map((p,i)=>({id:p.id,...(p.public_id?{publicId:p.public_id}:{}),name:p.username||"Player",status:presenceByUser[p.id]||(p.status||"Offline") as PresenceStatus,online:Boolean(presenceByUser[p.id]&&presenceByUser[p.id]!=="Offline"),color:colors[i%colors.length],preview:"",avatarUrl:p.avatar_url||null,bio:p.bio||null,isFriend:friendIds.has(p.id),hasConversation:Boolean(convMap[p.id])})));
    setConversationIds(convMap);
    setActiveServer(prev=>serverIds.includes(prev)?prev:(serverRows[0]?.id||""));
    setActive(prev=>(view==="dm"||view==="home"||view==="friends")?prev:(channelRows.some(row=>row.id===prev)?prev:(channelRows[0]?.id||"")));
  }
  async function toggleReaction(messageId:string,emoji:string){
    const existing=(messages[activeKey]||messages[active]||[]).find(m=>m.id===messageId);if(!existing)return;
    const existingReaction=existing.reactions?.find(r=>r.emoji===emoji);const selected=Boolean(existingReaction?.reacted);
    const request=selected?supabase.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",session.user.id).eq("emoji",emoji):supabase.from("message_reactions").insert({message_id:messageId,user_id:session.user.id,emoji});
    const {error}=await request;if(error){notify("Unable to update reaction: "+error.message);return;}
    const grouped:Reaction[]=(existing.reactions||[]).map(reaction=>reaction.emoji!==emoji?reaction:{...reaction,count:reaction.count+(selected?-1:1),reacted:!selected}).filter(reaction=>reaction.count>0);if(!selected&&!existingReaction)grouped.push({emoji,count:1,reacted:true});
    setMessages(old=>{const list=old[activeKey]||old[active]||[];return{...old,[activeKey]:list.map(m=>m.id!==messageId?m:{...m,reactions:grouped})};});
  }
  async function sendFriendRequest(e:FormEvent){
    e.preventDefault();
    const requested=modalInput.trim();
    if(!requested)return;
    const {data:target,error:lookupError}=await supabase.from("profiles").select("id,username").ilike("username",requested).maybeSingle();
    if(lookupError||!target){notify(lookupError?"Unable to find player: "+lookupError.message:"No Voax username \""+requested+"\" was found.");return;}
    if(target.id===session.user.id){notify("You cannot add yourself as a friend.");return;}

    const pairFilter="and(requester_id.eq."+session.user.id+",addressee_id.eq."+target.id+"),and(requester_id.eq."+target.id+",addressee_id.eq."+session.user.id+")";
    const {data:activeRequest,error:activeError}=await supabase.from("friendships").select("id,requester_id,addressee_id,status").in("status",["pending","accepted"]).or(pairFilter).maybeSingle();
    if(activeError){notify("Unable to check friendship: "+activeError.message);return;}
    if(activeRequest?.status==="accepted"){notify("You are already friends.");return;}
    if(activeRequest?.status==="pending"){notify(activeRequest.addressee_id===session.user.id?"That player already sent you a request. Accept it from Friends.":"You already sent a request to that player.");return;}

    // Reuse a rejected row from this same requester/recipient pair. The DB unique
    // constraint intentionally keeps one row per direction, so inserting again fails.
    const {data:rejected,error:rejectedError}=await supabase.from("friendships").select("id").eq("requester_id",session.user.id).eq("addressee_id",target.id).eq("status","rejected").maybeSingle();
    if(rejectedError){notify("Unable to check previous request: "+rejectedError.message);return;}
    if(rejected){
      const {error}=await supabase.from("friendships").update({status:"pending",updated_at:new Date().toISOString()}).eq("id",rejected.id).eq("requester_id",session.user.id).eq("status","rejected");
      if(error){notify("Unable to resend friend request: "+error.message);return;}
    }else{
      const {error}=await supabase.from("friendships").insert({requester_id:session.user.id,addressee_id:target.id,status:"pending"});
      if(error){notify("Unable to send friend request: "+error.message);return;}
    }
    setModal(null);setModalInput("");notify("Friend request sent to "+(target.username||"Player")+".");await loadWorkspace();
  }
  async function respondToFriendRequest(request:FriendRequest,accept:boolean){const {error}=await supabase.from("friendships").update({status:accept?"accepted":"rejected"}).eq("id",request.id).eq("addressee_id",session.user.id).eq("status","pending");if(error){notify("Unable to update friend request: "+error.message);return;}notify(accept?"Friend request accepted.":"Friend request declined.");await loadWorkspace();}
  async function removeFriend(person:Person){if(person.id===session.user.id||!person.isFriend)return;if(!window.confirm("Remove "+person.name+" from your friends?"))return;const pairFilter="and(requester_id.eq."+session.user.id+",addressee_id.eq."+person.id+"),and(requester_id.eq."+person.id+",addressee_id.eq."+session.user.id+")";const {data,error}=await supabase.from("friendships").delete().eq("status","accepted").or(pairFilter).select("id").maybeSingle();if(error){notify("Unable to remove friend: "+error.message);return;}if(!data){notify("Friendship was not found. Refresh and try again.");return;}setSelectedProfile(current=>current?.id===person.id?null:current);notify(person.name+" was removed from your friends.");await loadWorkspace();}
  async function toggleNotificationBlock(person:Person){
    if(person.id===session.user.id)return;
    const isBlocked=blockedNotificationActors.includes(person.id);
    const result=isBlocked?await supabase.from("user_notification_blocks").delete().eq("user_id",session.user.id).eq("blocked_actor_id",person.id):await supabase.from("user_notification_blocks").insert({user_id:session.user.id,blocked_actor_id:person.id});
    if(result.error){notify("Unable to update member notification block: "+result.error.message);return;}
    setBlockedNotificationActors(old=>isBlocked?old.filter(id=>id!==person.id):[...old,person.id]);notify(isBlocked?"Member alerts enabled.":"Member alerts muted.");
  }
  async function openMentionNotification(notification:AppNotification){
    if(!notification.entity_id)return;
    const {data,error}=await supabase.from("messages").select("id,channel_id").eq("id",notification.entity_id).maybeSingle();
    if(error||!data?.channel_id){notify("This message is no longer available.");return;}
    const channel=channels.find(item=>item.id===data.channel_id);
    if(!channel){notify("You no longer have access to this channel.");return;}
    setSearch("");setPendingMentionJumpId(notification.entity_id);switchToChannel(channel);setModal(null);if(!notification.read_at)await markNotificationRead(notification.id);
  }
  async function openAnnouncementNotification(notification:AppNotification){
    if(!notification.entity_id)return;
    const {data,error}=await supabase.from("channel_threads").select("channel_id").eq("id",notification.entity_id).maybeSingle();
    if(error||!data?.channel_id){notify("This announcement is no longer available.");return;}
    const channel=channels.find(item=>item.id===data.channel_id);
    if(!channel){notify("You no longer have access to this announcement channel.");return;}
    setSearch("");switchToChannel(channel);setModal(null);if(!notification.read_at)await markNotificationRead(notification.id);
  }
  async function markNotificationRead(id:string){const readAt=new Date().toISOString();const {error}=await supabase.from("notifications").update({read_at:readAt}).eq("id",id).eq("recipient_id",session.user.id).is("read_at",null);if(error){notify("Unable to update notification: "+error.message);return;}setNotifications(old=>old.map(n=>n.id===id?{...n,read_at:readAt}:n));}
  async function markAllNotificationsRead(){const unreadIds=inboxNotifications.filter(n=>!n.read_at).map(n=>n.id);if(!unreadIds.length)return;const readAt=new Date().toISOString();const {error}=await supabase.from("notifications").update({read_at:readAt}).eq("recipient_id",session.user.id).in("id",unreadIds).is("read_at",null).select("id");if(error){notify("Unable to mark notifications as read: "+error.message);return;}setNotifications(old=>old.map(n=>unreadIds.includes(n.id)&&!n.read_at?{...n,read_at:readAt}:n));notify("All visible notifications marked as read.");}
  function sendTyping(typing:boolean){const channel=typingChannelRef.current;if(!channel)return;void channel.send({type:"broadcast",event:"typing",payload:{userId:session.user.id,name,typing,activeKey}});}
  function startReply(message:Message){setReplyingTo(message);document.querySelector<HTMLInputElement>(".composer input")?.focus();}
  async function copyMessage(text:string){try{await navigator.clipboard.writeText(text);notify("Message copied.");}catch{notify("Clipboard access is blocked by this browser.");}}
  function startEditMessage(message:Message){if(!message.own)return;setEditingMessageId(message.id);setDraft(message.text);setReplyingTo(null);document.querySelector<HTMLInputElement>(".composer input:not([type=file])")?.focus();}
  async function saveEditMessage(e:FormEvent){e.preventDefault();if(!editingMessageId)return;const body=censorProfanity(draft.trim());if(!body){notify("Message cannot be empty.");return;}const messageId=editingMessageId;const {data,error}=await supabase.from("messages").update({body,edited_at:new Date().toISOString()}).eq("id",messageId).eq("author_id",session.user.id).select("id,body,edited_at").maybeSingle();if(error){notify("Couldn't edit your message: "+error.message);return;}if(!data){notify("This message could not be edited. Refresh and try again.");return;}setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.map(message=>message.id===messageId?{...message,text:data.body,editedAt:data.edited_at}:message)])));void messageEventsChannelRef.current?.send({type:"broadcast",event:"message-updated",payload:{id:data.id,body:data.body,editedAt:data.edited_at}});setEditingMessageId(null);setDraft("");notify("Message edited.");}
  async function deleteMessage(message:Message){
    if(!message.own&&!canManageMessages){notify("You don't have permission to delete this message.");return;}
    let deletion=supabase.from("messages").delete().eq("id",message.id);
    if(message.own)deletion=deletion.eq("author_id",session.user.id);
    const {data,error}=await deletion.select("id,attachments").maybeSingle();
    if(error){notify("Couldn't delete your message: "+error.message);return;}
    if(!data){notify("This message could not be deleted. Refresh and try again.");return;}
    setMessages(old=>Object.fromEntries(Object.entries(old).map(([key,list])=>[key,list.filter(item=>item.id!==message.id)])));
    void messageEventsChannelRef.current?.send({type:"broadcast",event:"message-deleted",payload:{id:message.id}});
    const attachmentPaths=Array.isArray(data.attachments)?data.attachments.map((item:any)=>item?.path).filter((path:any):path is string=>typeof path==="string"):[];
    if(attachmentPaths.length){const {error:storageError}=await supabase.storage.from("message-attachments").remove(attachmentPaths);if(storageError){notify("Message deleted, but its attachment files could not be cleaned up: "+storageError.message);return;}}
    notify("Message deleted.");
  }
  function openApp(){window.history.pushState({},"","/app");setShowLanding(false);setView("home");setActive("");setSidebarOpen(false);}
  async function navigateExplore(target:string){
    if(target==="/app"){window.history.pushState({},"","/app");setView("home");setActive("");setShowLanding(false);return;}
    if(target.startsWith("/channel/")||target.startsWith("/channels/")){
      const channelKey=target.split("/")[3]||"";
      const channelResult=await supabase.from("channels").select("id,public_id,server_id,name,description,category,category_id,channel_type,permissions_synced").or("id.eq."+channelKey+",public_id.eq."+channelKey).maybeSingle();
      if(!channelResult.data){window.location.assign(target);return;}
      await loadWorkspace();
      const channel=channelResult.data;
      window.history.pushState({},"",target);setActiveServer(channel.server_id);setActive(channel.id);setView("channel");setShowLanding(false);setSidebarOpen(false);return;
    }
    if(target==="/explore"&&window.location.pathname.startsWith("/explore/"))window.history.replaceState({},"",target);else window.history.pushState({},"",target);
    if(target==="/explore")await loadWorkspace();
    setExplorePath(target);setView("explore");setShowLanding(false);setSidebarOpen(false);
  }
  function openProfile(person:Person){
    setContextMenu(null);
    const cached=person.id===session.user.id?profileBio:(people.find(item=>item.id===person.id)?.bio??person.bio);
    const profile={...person,bio:cached??null};
    setSelectedProfile(profile);
    if(person.id===session.user.id||cached===undefined||cached===null){
      void supabase.from("profiles").select("username,avatar_url,bio,status").eq("id",person.id).maybeSingle().then(({data,error})=>{
        if(error||!data)return;
        const enriched={...profile,name:data.username||profile.name,avatarUrl:data.avatar_url||profile.avatarUrl||null,bio:data.bio||""};
        setPeople(old=>old.map(item=>item.id===person.id?{...item,...enriched}:item));
        setSelectedProfile(current=>current?.id===person.id?{...current,...enriched}:current);
      });
    }
  }
  function showContextMenu(event:React.MouseEvent, target:ContextMenuTarget){event.preventDefault();event.stopPropagation();setStatusMenuOpen(false);setContextMenu({x:event.clientX,y:event.clientY,...target} as ContextMenuState);}
  async function copyContextText(value:string,label:string){try{await navigator.clipboard.writeText(value);notify(label+" copied.");}catch{notify("Clipboard access is blocked by this browser.");}setContextMenu(null);}
  function contextPersonForMessage(message:Message):Person|null{return message.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl,bio:profileBio}:people.find(person=>person.name===message.author)||null;}
  async function loadBlockedPeople(){
    setBlockedPeopleLoading(true);
    const ids=[...blockedUserIds];
    if(!ids.length){setBlockedPeople([]);setBlockedPeopleLoading(false);return;}
    const {data,error}=await supabase.from("profiles").select("id,username,status,avatar_url,bio").in("id",ids);
    if(error){notify("Could not load blocked accounts: "+error.message);setBlockedPeopleLoading(false);return;}
    setBlockedPeople((data||[]).map((profile,index)=>({id:profile.id,name:profile.username||"Player",status:(profile.status||"Offline") as PresenceStatus,online:false,color:["green","purple","orange","blue","pink"][index%5],preview:"Blocked account",avatarUrl:profile.avatar_url||null,bio:profile.bio||null})));
    setBlockedPeopleLoading(false);
  }
  async function toggleAccountBlock(person:Person){
    if(person.id===session.user.id)return;
    const currentlyBlocked=blockedUserIds.has(person.id);
    const result=currentlyBlocked
      ?await supabase.from("voax_account_blocks").delete().eq("blocker_id",session.user.id).eq("blocked_id",person.id)
      :await supabase.from("voax_account_blocks").insert({blocker_id:session.user.id,blocked_id:person.id});
    if(result.error){notify("Couldn't "+(currentlyBlocked?"unblock":"block")+" this account: "+result.error.message);return;}
    setBlockedUserIds(old=>{const next=new Set(old);if(currentlyBlocked)next.delete(person.id);else next.add(person.id);return next;});
    setContextMenu(null);setSelectedProfile(null);if(currentlyBlocked)setBlockedPeople(old=>old.filter(item=>item.id!==person.id));notify(currentlyBlocked?"Account unblocked.":"Account blocked. Their messages are hidden and direct messages are restricted.");
  }
  function beginReport(target:VoaxReportTarget){setReportTarget(target);setReportDetails("");setReportReason(target.target_type==="server"?"Spam or misleading content":"Harassment or bullying");setContextMenu(null);setSelectedProfile(null);}
  async function submitBanAppeal(event:FormEvent){
    event.preventDefault();if(!accountBan||appealMessage.trim().length<10)return;setAppealBusy(true);
    const {error}=await supabase.from("voax_ban_appeals").insert({ban_id:accountBan.id,user_id:session.user.id,message:appealMessage.trim()});
    setAppealBusy(false);
    if(error){notify(error.code==="23505"?"An appeal has already been submitted for this ban.":"Could not submit appeal: "+error.message);return;}
    setAppealSubmitted(true);setAppealMessage("");notify("Your ban appeal has been submitted.");
  }
  async function submitVoaxReport(event:FormEvent){
    event.preventDefault();if(!reportTarget)return;setReportBusy(true);
    const {error}=await supabase.from("voax_reports").insert({reporter_id:session.user.id,...reportTarget,reason:reportReason,details:reportDetails.trim()});
    setReportBusy(false);
    if(error){notify(error.code==="23505"?"You've already reported this item.":"Couldn't submit report: "+error.message);return;}
    setReportTarget(null);setReportDetails("");notify("Report submitted. Thank you for helping keep Voax safe.");
  }
  async function hideDMForPerson(person:Person){const personId=person.id;const conversationId=conversationIds[personId];if(!conversationId){notify("This conversation is no longer available.");setContextMenu(null);return;}const {error}=await supabase.from("conversation_members").update({hidden_at:new Date().toISOString()}).eq("conversation_id",conversationId).eq("user_id",session.user.id);if(error){notify("Unable to remove this conversation: "+error.message);setContextMenu(null);return;}setPeople(old=>old.map(item=>item.id===personId?{...item,hasConversation:false,preview:""}:item));setConversationIds(old=>{const next={...old};delete next[personId];return next;});setContextMenu(null);if(activePerson?.id===personId){const fallbackChannel=channels.find(channel=>channel.serverId===activeServer)||channels[0];setActive(fallbackChannel?.id||"");setView(fallbackChannel?"channel":"home");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"",fallbackChannel?`/channels/${servers.find(server=>server.id===(fallbackChannel.serverId||activeServer))?.publicId||fallbackChannel.serverId||activeServer}/${fallbackChannel.publicId||fallbackChannel.id}`:"/app");}notify("Conversation hidden from your inbox. Messages are kept.");}
  async function openDM(person:Person|string){
    const requestedName=typeof person==="string"?person.trim():person.name;
    let target:Person|null=typeof person==="string"?null:person;
    if(!target){
      const {data,error}=await supabase.from("profiles").select("id,public_id,username,status").ilike("username",requestedName).maybeSingle();
      if(error){notify("Couldn't look up that player: "+error.message);return;}
      if(!data){notify("Couldn't find a Voax account named "+requestedName+".");return;}
      target={id:data.id,publicId:data.public_id,name:data.username||"Player",status:(data.status||"Offline") as PresenceStatus,online:data.status==="Online",color:"blue",preview:"",isFriend:false,hasConversation:false};
    }
    if(target.id===session.user.id){notify("That's your own account.");return;}
    let conversationId=conversationIds[target.id];
    let ownRows:{conversation_id:string;hidden_at:string|null}[]=[];
    if(!conversationId){
      const {data:rows,error:ownError}=await supabase.from("conversation_members").select("conversation_id,hidden_at").eq("user_id",session.user.id);
      if(ownError){notify("Couldn't check existing conversations: "+ownError.message);return;}
      ownRows=(rows||[]) as typeof ownRows;
      const ids=ownRows.map(row=>row.conversation_id);
      if(ids.length){const {data:targetRows,error:targetError}=await supabase.from("conversation_members").select("conversation_id").eq("user_id",target.id).in("conversation_id",ids);if(targetError){notify("Couldn't check existing conversations: "+targetError.message);return;}conversationId=targetRows?.[0]?.conversation_id;}
      if(conversationId&&ownRows.some(row=>row.conversation_id===conversationId&&row.hidden_at)){
        const {error:restoreError}=await supabase.from("conversation_members").update({hidden_at:null}).eq("conversation_id",conversationId).eq("user_id",session.user.id);
        if(restoreError){notify("Couldn't reopen this conversation: "+restoreError.message);return;}
      }
    }
    if(!conversationId){
      const {data:conversation,error:createError}=await supabase.from("conversations").insert({created_by:session.user.id}).select("id").single();
      if(createError||!conversation){notify("Couldn't start the conversation: "+(createError?.message||"Please try again."));return;}
      const {error:memberError}=await supabase.from("conversation_members").insert([{conversation_id:conversation.id,user_id:session.user.id},{conversation_id:conversation.id,user_id:target.id}]);
      if(memberError){notify("Couldn't add the conversation participants: "+memberError.message);return;}
      conversationId=conversation.id;
    }
    setConversationIds(old=>({...old,[target!.id]:conversationId!}));
    setDmActivity(old=>({...old,[target!.id]:Date.now()}));
    setPeople(old=>old.some(p=>p.id===target!.id)?old.map(p=>p.id===target!.id?{...p,hasConversation:true}:p):[...old,{...target!,hasConversation:true}]);
    setActive(target.name);setView("dm");setTypingPerson(null);setShowLanding(false);setSidebarOpen(false);
    setUnread(old=>({...old,[keyFor("dm",target!.name)]:0}));const readAt=new Date().toISOString();void supabase.from("notifications").update({read_at:readAt}).eq("recipient_id",session.user.id).eq("entity_id",conversationId).is("read_at",null).then(({error})=>{if(!error)setNotifications(old=>old.map(n=>n.entity_id===conversationId&&!n.read_at?{...n,read_at:readAt}:n));});window.history.pushState({},"",`/dm/${target.publicId||target.id}`);setModal(null);
  }
  async function markChannelRead(channelId:string){const readAt=new Date().toISOString();const {error}=await supabase.from("channel_read_states").upsert({user_id:session.user.id,channel_id:channelId,last_read_at:readAt},{onConflict:"user_id,channel_id"});if(error){notify("Unable to mark channel as read: "+error.message);return;}setUnread(old=>({...old,[keyFor("channel",channelId)]:0}));}
  function openChannel(channel:Channel){setTypingPerson(null);setActive(channel.id);setView("channel");void markChannelRead(channel.id);setSidebarOpen(false);window.history.pushState({},"",`/channel/${servers.find(server=>server.id===(channel.serverId||activeServer))?.publicId||channel.serverId||activeServer}/${channel.publicId||channel.id}`);}
  async function uploadMessageAttachment(file:File|null){
    if(!file)return;
    const allowedTypes=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","audio/mpeg","audio/ogg","audio/wav","application/pdf","text/plain","application/zip","application/x-zip-compressed"];
    if(!allowedTypes.includes(file.type)){notify("Choose an image, supported audio/video, PDF, text, or ZIP file.");return;}
    if(file.size>20*1024*1024){notify("Attachments must be 20 MB or smaller.");return;}
    if(view!=="channel"&&view!=="dm"){notify("Open a channel or direct message before attaching a file.");return;}
    const scopeType=view==="channel"?"channels":"conversations";
    const scopeId=view==="channel"?activeChannel?.id:(activePerson?conversationIds[activePerson.id]:null);
    if(!scopeId){notify("Open a valid conversation before attaching a file.");return;}
    setAttachmentBusy(true);
    try{
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80)||"attachment";
      const path=scopeType+"/"+scopeId+"/"+session.user.id+"/"+crypto.randomUUID()+"_"+safeName;
      const {error}=await supabase.storage.from("message-attachments").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(error)throw error;
      setPendingAttachments(old=>[...old,{path,name:file.name,mimeType:file.type,size:file.size}]);
      notify("Attachment ready to send.");
    }catch(error){notify("Unable to upload attachment: "+(error instanceof Error?error.message:"Please try again."));}
    finally{setAttachmentBusy(false);}
  }
  async function removePendingAttachment(attachment:Attachment){
    const {error}=await supabase.storage.from("message-attachments").remove([attachment.path]);
    if(error){notify("Unable to remove the uploaded attachment: "+error.message);return;}
    setPendingAttachments(old=>old.filter(item=>item.path!==attachment.path));
  }
  function updateMentionSuggestions(value:string){
    const match=value.match(/(?:^|\\s)@([A-Za-z0-9_ -]*)$/);
    if(!match){setMentionMenu(null);return;}
    const query=match[1].toLocaleLowerCase();
    const start=value.length-match[1].length-1;
    const options:MentionSuggestion[]=view==="channel"
      ? [
          {type:"everyone",label:"everyone",detail:"Mention everyone in this server"},
          {type:"here",label:"here",detail:"Mention members who are Online or Idle"},
          ...serverMemberPeople.filter(person=>person.name&&person.name!=="Player"&&person.id!==session.user.id).map(person=>({type:"user" as const,id:person.id,label:person.name,detail:"Member"})),
          ...customServerRoles.map(role=>({type:"role" as const,id:role.id,label:role.name,detail:"Role mention"}))
        ]
      : activePerson
        ? [{type:"user",id:activePerson.id,label:activePerson.name,detail:"Direct message"}]
        : [];
    const filtered=options.filter(option=>option.label.toLocaleLowerCase().startsWith(query)).slice(0,8);
    setMentionMenu(filtered.length?{start,options:filtered}:null);
  }
  function chooseMentionSuggestion(option:MentionSuggestion){
    if(!mentionMenu)return;
    const next=draft.slice(0,mentionMenu.start)+"@"+option.label+" "+draft.slice(draft.length);
    setDraft(next);setMentionMenu(null);sendTyping(true);
    window.setTimeout(()=>document.querySelector<HTMLInputElement>(".composer input[aria-label='Message']")?.focus(),0);
  }
  async function saveNotificationOverride(scopeType:"server"|"channel",scopeId:string,mode:"inherit"|"all"|"mentions"|"none"|"muted"){
    const request=mode==="inherit"
      ?supabase.from("notification_overrides").delete().eq("user_id",session.user.id).eq("scope_type",scopeType).eq("scope_id",scopeId)
      :supabase.from("notification_overrides").upsert({user_id:session.user.id,scope_type:scopeType,scope_id:scopeId,mode},{onConflict:"user_id,scope_type,scope_id"});
    const {error}=await request;
    if(error){notify("Couldn’t save notification override: "+error.message);return;}
    const cached=notificationOverrideCache.get(session.user.id);
    if(cached){const value=cached.value.filter(row=>row.scope_type!==scopeType||row.scope_id!==scopeId);if(mode!=="inherit")value.push({scope_type:scopeType,scope_id:scopeId,mode});notificationOverrideCache.set(session.user.id,{value,expiresAt:Date.now()+NOTIFICATION_OVERRIDE_CACHE_TTL_MS});}
    if(scopeType==="server")setServerNotificationMode(mode);else setChannelNotificationMode(mode);notify("Notification override saved.");
  }
  async function saveUserNotificationPreferences(changes:Partial<{global_mode:"all"|"mentions"|"none";direct_mentions_enabled:boolean;role_mentions_enabled:boolean;everyone_mentions_enabled:boolean;here_mentions_enabled:boolean}>){
    const next={global_mode:changes.global_mode??globalNotificationMode,direct_mentions_enabled:changes.direct_mentions_enabled??directMentionsEnabled,role_mentions_enabled:changes.role_mentions_enabled??roleMentionsEnabled,everyone_mentions_enabled:changes.everyone_mentions_enabled??everyoneMentionsEnabled,here_mentions_enabled:changes.here_mentions_enabled??hereMentionsEnabled};
    setGlobalNotificationMode(next.global_mode);setDirectMentionsEnabled(next.direct_mentions_enabled);setRoleMentionsEnabled(next.role_mentions_enabled);setEveryoneMentionsEnabled(next.everyone_mentions_enabled);setHereMentionsEnabled(next.here_mentions_enabled);setNotificationPreferencesSaving(true);
    const {error}=await supabase.from("user_notification_preferences").upsert({user_id:session.user.id,...next,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setNotificationPreferencesSaving(false);if(error){notify("Couldn't save notification preferences: "+error.message);return;}notify("Notification preferences saved.");
  }
  async function saveServerPingSettings(changes:Partial<typeof serverPingSettings>){
    if(!currentServer||!isOwnerOrAdmin){notify("Only server owners and administrators can manage ping safeguards.");return;}
    const next={...serverPingSettings,...changes};setServerPingSettings(next);setServerPingSettingsSaving(true);
    const {error}=await supabase.from("server_ping_settings").upsert({server_id:currentServer.id,...next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:"server_id"});
    setServerPingSettingsSaving(false);if(error){notify("Couldn't save ping safeguards: "+error.message);return;}notify("Ping safeguards saved.");
  }
  async function sendMessage(e:FormEvent){
    e.preventDefault();
    if(view==="dm"&&activePerson&&blockedUserIds.has(activePerson.id)){notify("You blocked this account. Unblock them to send a direct message.");return;}
    const body=censorProfanity(draft.trim());if(!body&&!pendingAttachments.length)return;
    if(view==="channel"&&!activeChannel){notify("Create a server and channel before sending messages.");return;}
    const conversationId=view==="dm"&&activePerson?conversationIds[activePerson.id]:null;
    if(view==="dm"&&!conversationId){notify("Open a conversation with a Voax player before sending a message.");return;}
    const scopePrefix=(view==="channel"?"channels/"+activeChannel?.id:"conversations/"+conversationId)+"/";
    if(pendingAttachments.some(attachment=>!attachment.path.startsWith(scopePrefix))){notify("Your attachment belongs to a different conversation. Remove it and attach it again here.");return;}
    const attachmentRows=pendingAttachments.map(({path,name,mimeType,size})=>({path,name,mimeType,size}));
    const mentionMembers:Person[]=[...serverMemberPeople,{id:session.user.id,name,online:status!=="Offline",status,color:"blue",preview:"You"}];
    const dmMentionMembers:Person[] = activePerson ? [activePerson] : [];
     const mentions=buildMentionTokens(body,view==="channel"?mentionMembers:dmMentionMembers,view==="channel"?customServerRoles:[]);
    const send=(confirmed:boolean)=>supabase.rpc("send_message_with_pings",{p_channel_id:view==="channel"?active:null,p_conversation_id:view==="dm"?conversationId:null,p_body:body||"Shared an attachment",p_attachments:attachmentRows,p_reply_to:replyingTo?.id||null,p_mentions:mentions,p_confirmed:confirmed});
    let result=await send(false);
    if(result.error){notify("Message not sent: "+result.error.message);return;}
    let payload=result.data as any;
    if(payload?.confirmation_required){
      const count=Number(payload.target_count)||0;
      if(!window.confirm("This ping will notify "+count+" unique members. Send it anyway?"))return;
      result=await send(true);
      if(result.error){notify("Message not sent: "+result.error.message);return;}
      payload=result.data as any;
    }
    if(!payload?.message?.id){notify("Message not sent: the server returned an invalid response.");return;}
    const data=payload.message;
    const signedAttachments=await signMessageAttachments(data.attachments);
    if(activePerson)setDmActivity(old=>({...old,[activePerson.id]:new Date(data.created_at).getTime()}));
     const item:Message={id:data.id,author:name,text:data.body,time:formatClock(new Date(data.created_at), clockFormat),timestamp:data.created_at,own:true,...(replyingTo?{replyTo:{author:replyingTo.author,text:replyingTo.text}}:{}),...(signedAttachments.length?{attachments:signedAttachments}:{})};
    setMessages(old=>{const list=old[activeKey]||old[active]||[];const next=list.some(m=>m.id===item.id)?list:[...list,item];return{...old,[activeKey]:next,[active]:next};});
    setPeople(old=>old.map(p=>p.id===activePerson?.id?{...p,preview:body||"Shared an attachment",hasConversation:true}:p));setDraft("");setMentionMenu(null);setReplyingTo(null);setPendingAttachments([]);
  }
  async function loadChannelPermissionOverwrites(channelId:string,syncedOverride?:boolean){
    setChannelPermissionsLoading(true);
    const channel=channels.find(item=>item.id===channelId);
    const isSynced=syncedOverride??channel?.permissionsSynced??false;
    const query=supabase.from("channel_permission_overwrites").select("id,target_type,target_id,allow_permissions,deny_permissions");
    const {data,error}=isSynced&&channel?.categoryId?await query.eq("category_id",channel.categoryId):await query.eq("channel_id",channelId);
    setChannelPermissionsLoading(false);
    if(error){notify("Could not load channel permissions: "+error.message);return;}
    setChannelPermissionOverwrites((data||[]) as typeof channelPermissionOverwrites);
  }
  async function ensureChannelOverridesLocal(channelId:string){
    const {data:channel,error:channelError}=await supabase.from("channels").select("permissions_synced").eq("id",channelId).maybeSingle();
    if(channelError){notify("Could not check channel permissions: "+channelError.message);return null;}
    if(channel?.permissions_synced){
      const {error}=await supabase.from("channels").update({permissions_synced:false}).eq("id",channelId);
      if(error){notify("Could not separate channel permissions: "+error.message);return null;}
      setChannels(current=>current.map(item=>item.id===channelId?{...item,permissionsSynced:false}:item));
    }
    const {data,error}=await supabase.from("channel_permission_overwrites").select("id,target_type,target_id,allow_permissions,deny_permissions").eq("channel_id",channelId);
    if(error){notify("Could not load channel permissions: "+error.message);return null;}
    const rows=(data||[]) as typeof channelPermissionOverwrites;
    setChannelPermissionOverwrites(rows);
    return rows;
  }
  async function toggleChannelPermissionSync(channelId:string,synced:boolean){
    const {error}=await supabase.from("channels").update({permissions_synced:synced}).eq("id",channelId);
    if(error){notify("Could not update permission syncing: "+error.message);return;}
    setChannels(current=>current.map(item=>item.id===channelId?{...item,permissionsSynced:synced}:item));
    await loadChannelPermissionOverwrites(channelId,synced);
    notify(synced?"Channel permissions synced with its category.":"Channel now has separate permissions.");
  }
  async function saveChannelPermission(channelId:string,targetType:"everyone"|"role",targetId:string|null,permission:string,enabled:boolean){
    const rows=await ensureChannelOverridesLocal(channelId);if(!rows)return;
    const existing=rows.find(row=>row.target_type===targetType&&row.target_id===targetId);
    const allow=new Set(existing?.allow_permissions||[]),deny=new Set(existing?.deny_permissions||[]);
    allow.delete(permission);deny.delete(permission);
    if(enabled)allow.add(permission);else deny.add(permission);
    const payload={server_id:activeServer,channel_id:channelId,target_type:targetType,target_id:targetId,allow_permissions:[...allow],deny_permissions:[...deny]};
    let result;
    if(existing)result=await supabase.from("channel_permission_overwrites").update({allow_permissions:payload.allow_permissions,deny_permissions:payload.deny_permissions}).eq("id",existing.id);
    else result=await supabase.from("channel_permission_overwrites").insert(payload);
    if(result.error){notify("Could not save channel permissions: "+result.error.message);return;}
    await loadChannelPermissionOverwrites(channelId,false);
  }
  async function setChannelPrivate(channelId:string,privateChannel:boolean){
    const rows=await ensureChannelOverridesLocal(channelId);if(!rows)return;
    const existing=rows.find(row=>row.target_type==="everyone");
    const allow=new Set(existing?.allow_permissions||[]),deny=new Set(existing?.deny_permissions||[]);
    allow.delete("view_channel");deny.delete("view_channel");
    if(privateChannel)deny.add("view_channel");
    const payload={server_id:activeServer,channel_id:channelId,target_type:"everyone",target_id:null,allow_permissions:[...allow],deny_permissions:[...deny]};
    let result;
    if(existing)result=await supabase.from("channel_permission_overwrites").update({allow_permissions:payload.allow_permissions,deny_permissions:payload.deny_permissions}).eq("id",existing.id);
    else if(privateChannel)result=await supabase.from("channel_permission_overwrites").insert(payload);
    else result={error:null};
    if(result.error){notify("Could not update channel visibility: "+result.error.message);return;}
    await loadChannelPermissionOverwrites(channelId,false);
    notify(privateChannel?"Channel is now private.":"Channel is visible to all server members.");
  }
  async function loadCategoryPermissionOverwrites(categoryName:string){
    const category=channelCategories.find(item=>item.serverId===activeServer&&item.name===categoryName);
    if(!category?.id){setCategoryPermissionOverwrites([]);return;}
    const {data,error}=await supabase.from("channel_permission_overwrites").select("id,target_type,target_id,allow_permissions,deny_permissions").eq("category_id",category.id);
    if(error){notify("Could not load category permissions: "+error.message);return;}
    setCategoryPermissionOverwrites((data||[]) as typeof categoryPermissionOverwrites);
  }
  async function saveCategoryPermission(categoryName:string,targetType:"everyone"|"role",targetId:string|null,permission:string,enabled:boolean){
    const category=channelCategories.find(item=>item.serverId===activeServer&&item.name===categoryName);
    if(!category?.id){notify("This category is not linked to a category record yet. Reload the server and try again.");return;}
    const existing=categoryPermissionOverwrites.find(row=>row.target_type===targetType&&row.target_id===targetId);
    const allow=new Set(existing?.allow_permissions||[]),deny=new Set(existing?.deny_permissions||[]);
    allow.delete(permission);deny.delete(permission);if(enabled)allow.add(permission);else deny.add(permission);
    const payload={server_id:activeServer,category_id:category.id,target_type:targetType,target_id:targetId,allow_permissions:[...allow],deny_permissions:[...deny]};
    const result=existing?await supabase.from("channel_permission_overwrites").update({allow_permissions:payload.allow_permissions,deny_permissions:payload.deny_permissions}).eq("id",existing.id):await supabase.from("channel_permission_overwrites").insert(payload);
    if(result.error){notify("Could not save category permissions: "+result.error.message);return;}
    await loadCategoryPermissionOverwrites(categoryName);
  }
  async function createItem(e:FormEvent){
    e.preventDefault();const value=modalInput.trim();if(!value)return;
    if(modal==="dm"){await openDM(value);setModalInput("");return;}
    if(modal==="category"){
      if(!activeServer)return;
      const categoryName=value.replace(/\\s+/g," ").slice(0,32);
      if(channelCategories.some(item=>item.serverId===activeServer&&item.name.toLowerCase()===categoryName.toLowerCase())){notify("That category already exists.");return;}
      const {error}=await supabase.from("channel_categories").insert({server_id:activeServer,name:categoryName,created_by:session.user.id,position:channelGroups.length});
      if(error){notify("Couldn't create the category: "+error.message);return;}
      await loadWorkspace();setModal(null);setModalInput("");notify("Category created.");return;
    }
    if(modal==="channel"){
      const channelName=value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
      // Use only the explicitly selected server. Do not fall back to the first
      // server, because that can pair one server's UI role with another ID.
      const targetServerId=servers.some(server=>server.id===activeServer)?activeServer:"";
      if(!channelName||!targetServerId){notify("Select a server before creating a channel.");return;}
      if(channels.some(c=>c.serverId===targetServerId&&c.name===channelName)){notify("That channel already exists in this server.");return;}
      // Resolve the user from the current Supabase access token immediately
      // before the insert. This keeps created_by identical to auth.uid() even
      // if the React session snapshot was refreshed or became stale.
      const {data:{user:authenticatedUser},error:authUserError}=await supabase.auth.getUser();
      if(authUserError||!authenticatedUser){notify("Your session could not be verified. Please sign in again.");return;}
      const category=(categoryInput.trim().replace(/\s+/g," ").slice(0,32)||"Text Channels");
      const {data:categoryRow,error:categoryError}=await supabase.from("channel_categories").select("id").eq("server_id",targetServerId).eq("name",category).maybeSingle();
      if(categoryError){notify("Couldn't check the channel category: "+categoryError.message);return;}
      const {data:createdChannel,error}=await supabase.rpc("create_server_channel",{p_server_id:targetServerId,p_name:channelName,p_category:category,p_category_id:categoryRow?.id||null,p_channel_type:channelTypeInput,p_description:"A new community channel"});
      const data=createdChannel as {id:string;server_id:string;name:string;description:string;category:string;category_id:string|null;channel_type:string;permissions_synced:boolean}|null;
      if(error||!data){notify("Couldn't create the channel: "+(error?.message||"Please try again."));return;}
      await loadWorkspace();setActiveServer(targetServerId);setActive(data.id);setView("channel");setShowLanding(false);setCategoryInput("Text Channels");setChannelTypeInput("text");notify("Channel created.");
    }
    setModal(null);setModalInput("");
  }
  async function joinServerByCode(rawCode:string){
    const inviteCode=rawCode.trim().replace(/^https?:\/\/[^/]+\/invite\//i,"").replace(/^\/invite\//i,"").replace(/\/$/,"");
    if(!inviteCode)return false;
    const {data:serverId,error}=await supabase.rpc("join_server_by_invite",{p_invite_code:inviteCode});
    if(error||!serverId){notify("Couldn't join that server: "+(error?.message||"Check the invite link and try again."));return false;}
    await loadWorkspace();
    const [{data:server},{data:channel}]=await Promise.all([
      supabase.from("servers").select("id,public_id").eq("id",serverId).maybeSingle(),
      supabase.from("channels").select("id,public_id").eq("server_id",serverId).order("created_at").limit(1).maybeSingle()
    ]);
    if(server){setActiveServer(server.id);setActive(channel?.id||"");setView("channel");setShowLanding(false);window.history.pushState({},"",channel?"/channel/"+(server.public_id||server.id)+"/"+(channel.public_id||channel.id):"/app");}
    setModal(null);setModalInput("");notify("You've joined the server.");return true;
  }
  async function joinServer(e:FormEvent){e.preventDefault();await joinServerByCode(modalInput);}

  async function createServer(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().replace(/\s+/g," ");if(!value)return;
    if(servers.some(s=>s.name.toLowerCase()===value.toLowerCase())){notify("A server with that name already exists.");return;}
    const {data:server,error}=await supabase.from("servers").insert({name:value,description:"A Voax server",created_by:session.user.id}).select("id,name,description,created_by,invite_code").single();
    if(error||!server){notify("Couldn't create the server: "+(error?.message||"Please try again."));return;}
    const {error:memberError}=await supabase.from("server_members").insert({server_id:server.id,user_id:session.user.id,role:"owner"});
    if(memberError){await supabase.from("servers").delete().eq("id",server.id);notify("Couldn't add you to the new server: "+memberError.message);return;}
    const {data:channel,error:channelError}=await supabase.from("channels").insert({server_id:server.id,name:"general",description:"The place for everything",created_by:session.user.id}).select("id,server_id,name,description").single();
    if(channelError||!channel){notify("Server created, but its first channel couldn't be created: "+(channelError?.message||"Please try again."));await loadWorkspace();return;}
    await loadWorkspace();setActiveServer(server.id);setActive(channel.id);setView("channel");setShowLanding(false);setSidebarOpen(false);setModal(null);setModalInput("");notify("Server created.");
  }
  async function renameServer(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().replace(/\s+/g," ");if(!value||!currentServer)return;
    if(servers.some(s=>s.id!==currentServer.id&&s.name.toLowerCase()===value.toLowerCase())){notify("A server with that name already exists.");return;}
    const description=serverShortDescription.trim().replace(/\s+/g," ").slice(0,120);
    const {error}=await supabase.from("servers").update({name:value,description,banner_url:serverBannerUrl}).eq("id",currentServer.id);
    if(error){notify("Couldn't save server settings: "+error.message);return;}
    await supabase.from("server_discovery").update({short_description:description}).eq("server_id",currentServer.id);
    await loadWorkspace();setModal(null);setModalInput("");notify("Server settings saved.");
  }
  async function uploadServerBanner(file:File|null){
    if(!file||!currentServer)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){notify("Use a JPG, PNG or WebP banner.");return;}
    if(file.size>5*1024*1024){notify("Server banners must be 5 MB or smaller.");return;}
    setServerBannerBusy(true);
    const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const path=currentServer.id+"/server-banner-"+crypto.randomUUID()+"."+extension;
    const {error}=await supabase.storage.from("server-discovery-banners").upload(path,file,{contentType:file.type,upsert:false});
    if(error){notify("Banner upload failed: "+error.message);setServerBannerBusy(false);return;}
    const {data}=supabase.storage.from("server-discovery-banners").getPublicUrl(path);
    const {error:updateError}=await supabase.from("servers").update({banner_url:data.publicUrl}).eq("id",currentServer.id);
    if(updateError){notify("Banner uploaded, but couldn't save it: "+updateError.message);setServerBannerBusy(false);return;}
    setServerBannerUrl(data.publicUrl);await loadWorkspace();setServerBannerBusy(false);notify("Server banner updated.");
  }
  async function loadServerDiscoverySettings(){
    if(!currentServer)return;
    const {data,error}=await supabase.from("server_discovery").select("full_description,tags,category,language").eq("server_id",currentServer.id).maybeSingle();
    if(error){notify("Couldn't load discovery settings: "+error.message);return;}
    setServerDiscoveryLongDescription(data?.full_description||"");
    setServerDiscoveryTags((data?.tags||[]).join(", "));
    setServerDiscoveryCategory(data?.category||"Community");
    setServerDiscoveryLanguage(data?.language||"English");
  }
  async function saveServerDiscoverySettings(e:FormEvent){
    e.preventDefault();if(!currentServer)return;setServerDiscoverySaving(true);
    const payload={server_id:currentServer.id,owner_id:currentServer.createdBy||session.user.id,server_name:currentServer.name,icon_url:currentServer.iconUrl||null,banner_url:serverBannerUrl,short_description:serverShortDescription.trim()||currentServer.name+" community",full_description:serverDiscoveryLongDescription.trim().slice(0,500),category:serverDiscoveryCategory,tags:[...new Set(serverDiscoveryTags.split(",").map(tag=>tag.trim().toLowerCase()).filter(Boolean))].slice(0,10),language:serverDiscoveryLanguage.trim().slice(0,40)||"English",listing_enabled:false,listing_status:"pending"};
    const {data:existing,error:lookupError}=await supabase.from("server_discovery").select("id").eq("server_id",currentServer.id).maybeSingle();
    if(lookupError){setServerDiscoverySaving(false);notify("Couldn't check discovery listing: "+lookupError.message);return;}
    const result=existing?await supabase.from("server_discovery").update({server_name:payload.server_name,icon_url:payload.icon_url,...(serverBannerUrl?{banner_url:serverBannerUrl}:{}),short_description:payload.short_description,full_description:payload.full_description,category:payload.category,tags:payload.tags,language:payload.language}).eq("id",existing.id):await supabase.from("server_discovery").insert(payload);
    setServerDiscoverySaving(false);
    if(result.error){notify("Couldn't save discovery settings: "+result.error.message);return;}
    notify("Discovery settings saved. Your listing visibility is unchanged.");
  }
  async function persistCategoryOrder(ordered:{id?:string;serverId:string;name:string;position?:number}[]){
    const saved=ordered.filter(item=>item.id&&item.name!=="Text Channels");
    if(!activeServer)return false;
    const {error}=await supabase.rpc("reorder_server_categories",{p_server_id:activeServer,p_category_ids:saved.map(item=>item.id)});
    if(error){notify("Could not save category order: "+error.message);await loadWorkspace();return false;}
    const positions=new Map(saved.map((item,position)=>[item.id!,position]));
    setChannelCategories(current=>current.map(item=>item.id&&positions.has(item.id)?{...item,position:positions.get(item.id)!}:item));
    return true;
  }
  async function dropCategory(draggedName:string,targetName:string,after=false){
    if(!canReorderCategoriesAndChannels||!activeServer||draggedName===targetName||draggedName==="Text Channels")return;
    const ordered=channelCategories.filter(item=>item.serverId===activeServer&&item.id&&item.name!=="Text Channels").sort((a,b)=>(a.position??0)-(b.position??0));
    const from=ordered.findIndex(item=>item.name===draggedName),to=ordered.findIndex(item=>item.name===targetName);
    if(from<0||to<0)return;
    const next=[...ordered];const [moved]=next.splice(from,1);
    const targetIndex=next.findIndex(item=>item.name===targetName);if(targetIndex<0)return;
    next.splice(targetIndex+(after?1:0),0,moved);
    if(await persistCategoryOrder(next))notify("Category order saved.");
  }
  async function dropChannel(channelId:string,targetCategory:string,targetChannelId?:string,after=false){
    if(!canReorderCategoriesAndChannels||!activeServer||channelId===targetChannelId)return;
    const dragged=channels.find(item=>item.id===channelId&&item.serverId===activeServer);if(!dragged)return;
    const targetCategoryRow=channelCategories.find(item=>item.serverId===activeServer&&item.name===targetCategory);
    const destination=channels.filter(item=>item.serverId===activeServer&&item.id!==channelId&&(item.category||"Text Channels")===targetCategory).sort((a,b)=>(a.position??0)-(b.position??0));
    let insertAt=destination.length;
    if(targetChannelId){const targetIndex=destination.findIndex(item=>item.id===targetChannelId);if(targetIndex<0)return;insertAt=targetIndex+(after?1:0);}
    destination.splice(insertAt,0,{...dragged,category:targetCategory,categoryId:targetCategoryRow?.id||null});
    const {error}=await supabase.rpc("move_server_channel",{p_server_id:activeServer,p_channel_id:channelId,p_target_category_id:targetCategoryRow?.id||null,p_target_category_name:targetCategory,p_destination_channel_ids:destination.map(item=>item.id)});
    if(error){notify("Could not move channel: "+error.message);await loadWorkspace();return;}
    const sourceCategory=dragged.category||"Text Channels";
    const sourceSiblings=channels.filter(item=>item.serverId===activeServer&&item.id!==channelId&&(item.category||"Text Channels")===sourceCategory).sort((a,b)=>(a.position??0)-(b.position??0));
    const destinationPositions=new Map(destination.map((item,position)=>[item.id,position]));
    const sourcePositions=new Map(sourceSiblings.map((item,position)=>[item.id,position]));
    setChannels(current=>current.map(item=>{
      if(item.serverId!==activeServer)return item;
      if(destinationPositions.has(item.id))return {...item,category:targetCategory,categoryId:targetCategoryRow?.id||null,position:destinationPositions.get(item.id)!};
      if(sourcePositions.has(item.id))return {...item,position:sourcePositions.get(item.id)!};
      return item;
    }));
    notify(sourceCategory===targetCategory?"Channel order saved.":"Channel moved.");
  }
  function handleSidebarDragStart(e:React.DragEvent<HTMLElement>,kind:"category"|"channel",id:string,label:string){
    if(!canReorderCategoriesAndChannels){e.preventDefault();return;}
    e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",kind+":"+id);
    const preview=document.createElement("div");preview.className="sidebar-drag-preview";preview.textContent=label;
    document.body.appendChild(preview);e.dataTransfer.setDragImage(preview,16,16);window.setTimeout(()=>preview.remove(),0);
    e.currentTarget.classList.add("is-dragging");setSidebarDragAnnouncement("Picked up "+label+". Move to a destination and drop, or press Escape to cancel.");
  }
  function handleSidebarDragOver(e:React.DragEvent<HTMLElement>){
    if(!canReorderCategoriesAndChannels)return;e.preventDefault();e.dataTransfer.dropEffect="move";
    const target=e.currentTarget,rect=target.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;
    target.classList.remove("drop-before","drop-after");target.classList.add(after?"drop-after":"drop-before");
    const list=target.closest(".channels-container")?.querySelector(".nav-list") as HTMLElement|null;
    if(list){const bounds=list.getBoundingClientRect(),edge=42;if(e.clientY<bounds.top+edge)list.scrollTop-=Math.ceil((bounds.top+edge-e.clientY)/4);else if(e.clientY>bounds.bottom-edge)list.scrollTop+=Math.ceil((e.clientY-(bounds.bottom-edge))/4);}
  }
  function handleSidebarDragLeave(e:React.DragEvent<HTMLElement>){
    const next=e.relatedTarget as Node|null;if(next&&e.currentTarget.contains(next))return;
    e.currentTarget.classList.remove("drag-over","drop-before","drop-after");
  }
  async function handleCategoryDrop(e:React.DragEvent<HTMLElement>,category:string){
    e.preventDefault();const after=e.currentTarget.classList.contains("drop-after");
    e.currentTarget.classList.remove("drag-over","drop-before","drop-after");
    const payload=e.dataTransfer.getData("text/plain");const [kind,...parts]=payload.split(":");const id=parts.join(":");
    if(kind==="category")await dropCategory(id,category,after);else if(kind==="channel")await dropChannel(id,category);
    setSidebarDragAnnouncement("Sidebar item moved.");
  }
  async function handleChannelDrop(e:React.DragEvent<HTMLElement>,channel:Channel){
    e.preventDefault();e.stopPropagation();const after=e.currentTarget.classList.contains("drop-after");
    e.currentTarget.classList.remove("drag-over","drop-before","drop-after");
    const payload=e.dataTransfer.getData("text/plain");const [kind,...parts]=payload.split(":");const id=parts.join(":");
    if(kind==="channel")await dropChannel(id,channel.category||"Text Channels",channel.id,after);
    setSidebarDragAnnouncement("Channel position updated.");
  }
  function handleSidebarKeyDown(e:React.KeyboardEvent<HTMLElement>,kind:"category"|"channel",id:string,category:string){
    if(!canReorderCategoriesAndChannels)return;const current=keyboardSidebarDrag;
    if(!current&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){
      e.preventDefault();setKeyboardSidebarDrag({kind,id,targetId:id,category,after:false});
      setSidebarDragAnnouncement("Picked up "+(kind==="category"?"category ":"channel ")+category+". Use arrow keys to choose a position, Enter to drop, or Escape to cancel.");return;
    }
    if(!current||current.kind!==kind||current.id!==id)return;
    if(e.key==="Escape"){e.preventDefault();setKeyboardSidebarDrag(null);setSidebarDragAnnouncement("Drag cancelled.");return;}
    if(e.key==="Enter"||e.key===" "){
      e.preventDefault();if(current.targetId!==id){if(kind==="category")void dropCategory(id,current.targetId,current.after);else void dropChannel(id,current.category,current.targetId,current.after);}
      setKeyboardSidebarDrag(null);setSidebarDragAnnouncement("Sidebar item dropped.");return;
    }
    if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const delta=e.key==="ArrowDown"?1:-1;
    if(kind==="category"){
      const ordered=channelCategories.filter(item=>item.serverId===activeServer&&item.id&&item.name!=="Text Channels").sort((a,b)=>(a.position??0)-(b.position??0));
      const index=ordered.findIndex(item=>item.name===current.targetId),next=ordered[Math.max(0,Math.min(ordered.length-1,index+delta))];
      if(next&&next.name!==id){setKeyboardSidebarDrag({...current,targetId:next.name,category:next.name,after:delta>0});setSidebarDragAnnouncement("Drop "+(delta>0?"after ":"before ")+next.name+".");}
    }else{
      const ordered=channels.filter(item=>item.serverId===activeServer&&(item.category||"Text Channels")===current.category).sort((a,b)=>(a.position??0)-(b.position??0));
      const index=ordered.findIndex(item=>item.id===current.targetId),next=ordered[Math.max(0,Math.min(ordered.length-1,index+delta))];
      if(next&&next.id!==id){setKeyboardSidebarDrag({...current,targetId:next.id,after:delta>0});setSidebarDragAnnouncement("Drop "+(delta>0?"after ":"before ")+"#"+next.name+".");}
    }
  }
  function moveCategoryBy(name:string,delta:number){
    if(!canReorderCategoriesAndChannels)return;const index=orderedServerCategories.findIndex(item=>item.name===name),target=orderedServerCategories[index+delta];if(target)void dropCategory(name,target.name,delta>0);
  }
  function moveChannelBy(channel:Channel,delta:number){
    if(!canReorderCategoriesAndChannels)return;const category=channel.category||"Text Channels";
    const ordered=channels.filter(item=>item.serverId===activeServer&&(item.category||"Text Channels")===category).sort((a,b)=>(a.position??0)-(b.position??0));
    const index=ordered.findIndex(item=>item.id===channel.id),target=ordered[index+delta];if(target)void dropChannel(channel.id,category,target.id,delta>0);
  }
  async function renameCategory(e:FormEvent){
    e.preventDefault();
    const oldName=selectedCategory;
    const nextName=modalInput.trim().replace(/\s+/g," ").slice(0,32);
    if(!activeServer||!oldName||!nextName)return;
    if(channelCategories.some(item=>item.serverId===activeServer&&item.name.toLowerCase()===nextName.toLowerCase()&&item.name!==oldName)){notify("That category already exists.");return;}
    const channelUpdate=await supabase.from("channels").update({category:nextName}).eq("server_id",activeServer).eq("category",oldName);
    if(channelUpdate.error){notify("Could not rename the category: "+channelUpdate.error.message);return;}
    const categoryUpdate=await supabase.from("channel_categories").update({name:nextName}).eq("server_id",activeServer).eq("name",oldName);
    if(categoryUpdate.error){notify("Channels were updated, but the category name could not be saved: "+categoryUpdate.error.message);return;}
    await loadWorkspace();setModal(null);setModalInput("");setSelectedCategory("");notify("Category renamed.");
  }
  async function renameChannel(e:FormEvent){
    e.preventDefault();const value=modalInput.trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");if(!value||!activeChannel)return;
    if(serverChannels.some(c=>c.id!==activeChannel.id&&c.name.toLowerCase()===value)){notify("That channel already exists in this server.");return;}
    const category=categoryInput.trim().replace(/\s+/g," ").slice(0,32)||"Text Channels";
    const {data:categoryRow}=await supabase.from("channel_categories").select("id").eq("server_id",activeServer).eq("name",category).maybeSingle();
    const {error}=await supabase.from("channels").update({name:value,category,category_id:categoryRow?.id||null,channel_type:channelTypeInput}).eq("id",activeChannel.id);if(error){notify("Couldn't rename the channel: "+error.message);return;}
    await loadWorkspace();setModal(null);setModalInput("");setCategoryInput("Text Channels");notify("Channel updated.");
  }
  function askDeleteServer(){if(!currentServer)return;if(servers.length<=1){notify("Keep at least one server.");return;}setPendingDelete({type:"server",id:currentServer.id,name:currentServer.name});setModal("confirmDelete");}
  function askDeleteChannel(channel:Channel){if(serverChannels.length<=1){notify("Each server must keep at least one channel.");return;}setPendingDelete({type:"channel",id:channel.id,name:channel.name});setModal("confirmDelete");}
  async function askDeleteCategory(){
    if(!activeServer||!selectedCategory||selectedCategory==="Text Channels"||!canManageChannels)return;
    const category=channelCategories.find(item=>item.serverId===activeServer&&item.name===selectedCategory);
    if(!category?.id){notify("This category cannot be deleted.");return;}
    const check=await supabase.from("channels").select("id",{count:"exact",head:true}).eq("server_id",activeServer).eq("category",selectedCategory);
    if(check.error){notify("Could not verify whether the category is empty: "+check.error.message);return;}
    if((check.count||0)>0){notify("Move or delete every channel in this category before deleting it.");return;}
    setPendingDelete({type:"category",id:category.id,name:selectedCategory});setModal("confirmDelete");
  }
  async function confirmDelete(){
    if(!pendingDelete)return;const item=pendingDelete;
    if(item.type==="channel"){const {error}=await supabase.from("channels").delete().eq("id",item.id);if(error){notify("Couldn't delete the channel: "+error.message);return;}setMessages(old=>{const next={...old};delete next[item.id];delete next[keyFor("channel",item.id)];return next;});await loadWorkspace();notify("Channel deleted.");}
    else if(item.type==="category"){
      const check=await supabase.from("channels").select("id",{count:"exact",head:true}).eq("server_id",activeServer).eq("category",item.name);
      if(check.error){notify("Could not verify the category is empty: "+check.error.message);return;}
      if((check.count||0)>0){notify("This category is no longer empty. Move or delete its channels first.");setPendingDelete(null);setModal("manageCategory");return;}
      const {error}=await supabase.from("channel_categories").delete().eq("id",item.id).eq("server_id",activeServer);
      if(error){notify("Could not delete the category: "+error.message);return;}
      await loadWorkspace();setSelectedCategory("");notify("Category deleted.");
    }
    else{const {error}=await supabase.from("servers").delete().eq("id",item.id);if(error){notify("Couldn't delete the server: "+error.message);return;}await loadWorkspace();notify("Server deleted.");}
    setPendingDelete(null);setModal(null);
  }
  function switchToDMHome(){setView("home");setActive("");setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"","/app");}
  function switchToServer(server?:Server){const target=server||currentServer;if(!target)return;const targetChannel=channels.find(c=>c.serverId===target.id);setActiveServer(target.id);setActive(targetChannel?.id||"");setView("channel");if(targetChannel)void markChannelRead(targetChannel.id);setShowLanding(false);setSidebarOpen(false);window.history.pushState({},"",targetChannel?`/channel/${target.publicId||target.id}/${targetChannel.publicId||targetChannel.id}`:"/app");}

  function switchToFriends() { setView("friends"); setShowLanding(false); setSidebarOpen(false); window.history.pushState({}, "", "/app?view=friends"); }
  function switchToChannel(channel: Channel) { openChannel(channel); }
  async function deleteCurrentDM() { if(activePerson) await hideDMForPerson(activePerson); }


  useEffect(() => {
    if (workspaceLoading || initialRouteHandled.current) return;
    initialRouteHandled.current = true;
    const path = window.location.pathname;
    if(path.startsWith("/explore")){setExplorePath(path);setView("explore");setShowLanding(false);return;}
    if (path.startsWith("/invite/")) { const inviteCode = decodeURIComponent(path.split("/")[2] || ""); if (inviteCode) { setModalInput(inviteCode); setModal("joinServer"); setShowLanding(false); return; } window.history.replaceState({}, "", "/app"); setShowLanding(false); return; }
    if (path === "/dms" || path === "/dms/") {
      window.history.replaceState({}, "", "/app");
      setView("home");
      setActive("");
      setShowLanding(false);
      return;
    }
    if (path === "/app" || path === "/app/") {
      setView(window.location.search === "?view=friends" ? "friends" : "home");
      setActive("");
      setShowLanding(false);
      return;
    }
    if (path.startsWith("/dm/")) {
      const userId = decodeURIComponent(path.split("/")[2] || "");
      if (!userId) { window.history.replaceState({}, "", "/app"); setView("home"); return; }
      const knownPerson = people.find(person => person.id === userId || person.publicId === userId);
      if (knownPerson) { void openDM(knownPerson); return; }
      void (async () => {
        let { data, error } = await supabase.from("profiles").select("id,public_id,username,status,avatar_url").eq("public_id", userId).maybeSingle();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (!data && isUuid) { const fallback = await supabase.from("profiles").select("id,public_id,username,status,avatar_url").eq("id", userId).maybeSingle(); data = fallback.data; error = fallback.error; }
        if (error || !data) { window.history.replaceState({}, "", "/app"); setView("home"); return; }
        const status = (data.status || "Offline") as PresenceStatus;
        void openDM({ id: data.id, publicId: data.public_id, name: data.username || "Player", status, online: status === "Online", color: "blue", preview: "Start a conversation", avatarUrl: data.avatar_url || null, isFriend: false, hasConversation: false });
      })();
      return;
    }
    if (path.startsWith("/channels/") || path.startsWith("/channel/")) {
      const [, , serverId, channelId] = path.split("/");
      const channel = channels.find(item => (item.publicId === channelId || item.id === channelId) && (servers.find(server => server.id === item.serverId)?.publicId === serverId || item.serverId === serverId));
      if (channel) {
        setActiveServer(channel.serverId || serverId);
        setActive(channel.id);
        setView("channel");
        setShowLanding(false);
        void markChannelRead(channel.id);
        return;
      }
      window.history.replaceState({}, "", "/app");
      setView("home");
      return;
    }
    if (path === "/") { setShowLanding(true); return; }
    window.history.replaceState({}, "", "/app");
    setView("home");
    setShowLanding(false);
  }, [workspaceLoading]);

  if (showLanding) return <Landing openApp={openApp} />;
  if (workspaceLoading) return <WorkspaceSkeleton variant={view === "home" ? "dm-home" : "server"} />;
  if(accountBan&&(!accountBan.expires_at||new Date(accountBan.expires_at)>new Date())) return <main className="voax-suspended-screen"><section className="voax-suspended-card"><div className="voax-suspended-icon"><Icon name="shield" size={28}/></div><span className="discovery-eyebrow">VOAX ACCOUNT SAFETY</span><h1>Account suspended</h1><p>Your account is currently suspended from using Voax.</p><div className="voax-suspended-detail"><strong>Reason</strong><span>{accountBan.reason}</span><strong>Duration</strong><span>{accountBan.duration==="permanent"?"Permanent":accountBan.duration}</span>{accountBan.expires_at&&<><strong>Ends</strong><span>{new Date(accountBan.expires_at).toLocaleString()}</span></>}</div>{appealSubmitted?<div className="voax-appeal-confirmation"><strong>Appeal submitted</strong><p>Your appeal is in the moderation queue. You can sign out while you wait for a response.</p></div>:<form onSubmit={submitBanAppeal}><label htmlFor="voax-ban-appeal">Appeal this decision</label><textarea id="voax-ban-appeal" value={appealMessage} onChange={e=>setAppealMessage(e.target.value)} minLength={10} maxLength={2000} rows={5} placeholder="Explain why you believe this suspension should be reviewed…" required/><button className="discovery-primary" disabled={appealBusy||appealMessage.trim().length<10}>{appealBusy?"Submitting…":"Submit appeal"}</button></form>}<button type="button" className="discovery-secondary" onClick={()=>void supabase.auth.signOut()}>Sign out</button></section></main>;
  return <div className={`app-shell ${compact ? "compact" : ""} ${showMembers && view === "channel" ? "has-members" : ""} ${view === "explore" ? "explore-mode" : ""}`}>
    <audio ref={remoteAudioRef} autoPlay playsInline style={{display:"none"}} aria-label="Remote voice audio" />
    <aside className="server-rail"><button className={`brand-mark ${view === "home" ? "brand-active" : ""}`} title="Open direct messages" aria-label="Open direct messages" onClick={switchToDMHome}><Logo size={36} /></button>{dmUnreadActors.length > 0 && <div className="rail-ping-stack" aria-label="Unread direct messages">{dmUnreadActors.map(({person,unreadCount}) => <button key={person.id} type="button" className="rail-ping-avatar dm-unread-shortcut" title={`${unreadCount} unread message${unreadCount===1?"":"s"} from ${person.name} · Open direct message`} aria-label={`${unreadCount} unread message${unreadCount===1?"":"s"} from ${person.name}. Open direct message`} onClick={() => void openDM(person)}>{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span>{initials(person.name)}</span>}<span className="dm-unread-count" aria-hidden="true">{unreadCount>99?"99+":unreadCount}</span></button>)}</div>}<div className="rail-separator"/><div className="server-rail-list">{servers.map((server) => <button key={server.id} className={`server-icon ${activeServer === server.id && view !== "home" && view !== "dm" && view !== "explore" ? "selected" : ""}`} title={server.name} aria-label={`Open ${server.name}`} onClick={() => switchToServer(server)} onContextMenu={e=>showContextMenu(e,{kind:"server",server})}>{server.iconUrl ? <img className="server-icon-image" src={server.iconUrl} alt="" /> : <span style={{fontWeight:900,fontSize:12}}>{initials(server.name)}</span>}</button>)}</div><button className="server-icon add" title="Create server" aria-label="Create server" onClick={() => { setModalInput(""); setModal("server"); }}><Icon name="plus" size={20} /></button><button className="server-icon explore-rail-button" title="Explore servers" aria-label="Explore servers" onClick={() => {void navigateExplore("/explore");}}><Icon name="explore" size={19}/></button>{(staffRole==="owner"||staffRole==="admin")&&<button className="server-icon staff-rail-button admin-rail-button" title="Admin Panel" aria-label="Admin Panel" onClick={()=>window.location.assign("/admin")}><Icon name="shield" size={19}/></button>}{staffRole==="moderator"&&<button className="server-icon staff-rail-button mod-rail-button" title="Mod Panel" aria-label="Mod Panel" onClick={()=>window.location.assign("/mod")}><Icon name="shield" size={19}/></button>}<div className="rail-spacer"/></aside>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="workspace-head">{view==="explore"?<div><strong>Explore</strong></div>:view !== "home" && view !== "dm" && currentServer ? <div className="server-workspace-menu-wrap"><button type="button" className="server-workspace-menu-trigger" aria-haspopup="menu" aria-expanded={serverDropdownOpen} onClick={() => setServerDropdownOpen(open => !open)}><span className="server-workspace-menu-copy"><strong>{currentServer.name}</strong><small>{currentServer.description || ""}</small></span><Icon name="chevronDown" size={16}/></button>{serverDropdownOpen && <><button type="button" className="server-workspace-menu-dismiss" aria-label="Close server menu" onClick={() => setServerDropdownOpen(false)}/><div className="server-workspace-dropdown" role="menu" aria-label={currentServer.name + " menu"}>{(canManageServer||canReorderCategoriesAndChannels) && <button type="button" role="menuitem" onClick={() => { setServerDropdownOpen(false); setModalInput(currentServer.name); setServerShortDescription(currentServer.description||""); setServerBannerUrl(currentServer.bannerUrl||null); setServerSettingsSection(canManageServer?"overview":"order"); setModal("manageServer"); }}><Icon name="settings" size={16}/>Server Settings</button>}{currentServer.inviteCode && <button type="button" role="menuitem" onClick={async () => { const inviteUrl = window.location.origin + "/invite/" + currentServer.inviteCode; try { await navigator.clipboard.writeText(inviteUrl); notify("Invite link copied."); } catch { notify("Clipboard access is blocked by this browser."); } setServerDropdownOpen(false); }}><Icon name="copy" size={16}/>Copy Invite</button>}<div className="server-workspace-dropdown-divider"/><div className="server-workspace-owner"><span>Owner:</span><strong>{currentServer.createdBy === session.user.id ? name : people.find(person => person.id === currentServer.createdBy)?.name || "Unknown"}</strong></div></div></>}</div> : <div><strong>Direct Messages</strong></div>}</div>
      {view!=="explore"&&<div className="search-wrap"><span><Icon name="search" size={17} /></span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." aria-label="Search conversations"/></div>}
      {view!=="explore"&&<>{view !== "home" && view !== "dm" ? <>{view !== "channel" && <button className={`side-link ${view === "friends" ? "active" : ""}`} onClick={switchToFriends}><span><Icon name="users" size={17} /></span> Friends <span className="side-count">{people.length}</span></button>}<div className="channels-container" onContextMenu={e=>showContextMenu(e,{kind:"channels"})}><div className="side-heading"><span>CHANNELS</span>{canReorderCategoriesAndChannels&&<button type="button" className={"sidebar-reorder-toggle"+(mobileReorderMode?" active":"")} onClick={()=>setMobileReorderMode(value=>!value)} aria-pressed={mobileReorderMode}>{mobileReorderMode?"Done":"Reorder"}</button>}{canManageChannels&&<button onClick={() => { setModal("category"); setModalInput(""); }} aria-label="Create category" title="Create category"><Icon name="plus" size={17}/></button>}</div><div className="nav-list">{channelGroups.map(([category, groupedChannels]) => <React.Fragment key={category}><div className={"channel-category-label"+(keyboardSidebarDrag?.kind==="category"&&keyboardSidebarDrag.targetId===category?" keyboard-drop-target":"")} draggable={canReorderCategoriesAndChannels&&category!=="Text Channels"} tabIndex={canReorderCategoriesAndChannels?0:undefined} aria-roledescription={canReorderCategoriesAndChannels?"Draggable category":undefined} onKeyDown={e=>handleSidebarKeyDown(e,"category",category,category)} onDragStart={e=>handleSidebarDragStart(e,"category",category,category)} onDragEnd={e=>e.currentTarget.classList.remove("is-dragging","drop-before","drop-after","drag-over")} onDragOver={e=>{if(e.dataTransfer.types.includes("text/plain"))handleSidebarDragOver(e);}} onDragLeave={handleSidebarDragLeave} onDrop={e=>void handleCategoryDrop(e,category)}><button type="button" className={"category-collapse-trigger"+(collapsedCategories[activeServer+":"+category]?" is-collapsed":"")} aria-expanded={!collapsedCategories[activeServer+":"+category]} onClick={()=>setCollapsedCategories(old=>({...old,[activeServer+":"+category]:!old[activeServer+":"+category]}))}><span>{category}</span></button><div className="channel-category-actions">{canManageChannels&&<button type="button" className="category-add-channel" title={"Create channel in "+category} aria-label={"Create channel in "+category} onClick={()=>{setModalInput("");setCategoryInput(category);setModal("channel");}}><Icon name="plus" size={15}/></button>}{(canManageChannels||canReorderCategoriesAndChannels)&&category!=="Text Channels"&&<button type="button" className="category-settings-button" title={"Category settings for "+category} aria-label={"Category settings for "+category} onClick={()=>{setSelectedCategory(category);setModalInput(category);setModal("manageCategory");void loadCategoryPermissionOverwrites(category);}}><Icon name="settings" size={14}/></button>}{canReorderCategoriesAndChannels&&mobileReorderMode&&category!=="Text Channels"&&<div className="mobile-sidebar-reorder-controls"><button type="button" title="Move category up" aria-label={"Move "+category+" up"} onClick={()=>moveCategoryBy(category,-1)}><Icon name="chevron-up" size={13}/></button><button type="button" title="Move category down" aria-label={"Move "+category+" down"} onClick={()=>moveCategoryBy(category,1)}><Icon name="chevron-down" size={13}/></button></div>}</div></div>{!collapsedCategories[activeServer+":"+category]&&groupedChannels.map(c => <div key={c.id} className={"channel-row"+(keyboardSidebarDrag?.kind==="channel"&&keyboardSidebarDrag.targetId===c.id?" keyboard-drop-target":"")} draggable={canReorderCategoriesAndChannels} tabIndex={canReorderCategoriesAndChannels?0:undefined} aria-roledescription={canReorderCategoriesAndChannels?"Draggable channel":undefined} onKeyDown={e=>handleSidebarKeyDown(e,"channel",c.id,c.category||"Text Channels")} onDragStart={e=>handleSidebarDragStart(e,"channel",c.id,"#"+c.name)} onDragEnd={e=>e.currentTarget.classList.remove("is-dragging","drop-before","drop-after","drag-over")} onDragOver={e=>{if(e.dataTransfer.types.includes("text/plain"))handleSidebarDragOver(e);}} onDragLeave={handleSidebarDragLeave} onDrop={e=>void handleChannelDrop(e,c)}><button className={`nav-item ${view === "channel" && active === c.id ? "active" : ""} ${(unread[keyFor("channel", c.id)] || 0) > 0 ? "channel-unread" : ""}`} style={{flex:1,minWidth:0}} onClick={() => switchToChannel(c)} onContextMenu={e=>showContextMenu(e,{kind:"channel",channel:c})}><span className="hash"><Icon name="hash" size={15} /></span><span className="channel-name" style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span></button>{canManageServer&&<button className="icon-btn channel-settings" title={"Manage #" + c.name} aria-label={"Manage #" + c.name} onClick={() => { setActive(c.id); setModalInput(c.name); setCategoryInput(c.category || "Text Channels"); setChannelTypeInput(c.channelType||"text"); setModal("manageChannel"); void loadChannelPermissionOverwrites(c.id); }}><Icon name="settings" size={14}/></button>}{canReorderCategoriesAndChannels&&mobileReorderMode&&<div className="mobile-sidebar-reorder-controls channel-mobile-reorder-controls"><button type="button" title={"Move #"+c.name+" up"} aria-label={"Move #"+c.name+" up"} onClick={()=>moveChannelBy(c,-1)}><Icon name="chevron-up" size={13}/></button><button type="button" title={"Move #"+c.name+" down"} aria-label={"Move #"+c.name+" down"} onClick={()=>moveChannelBy(c,1)}><Icon name="chevron-down" size={13}/></button><select aria-label={"Move #"+c.name+" to category"} value={c.category||"Text Channels"} onChange={e=>void dropChannel(c.id,e.target.value)}>{channelGroups.map(([targetCategory])=><option key={targetCategory} value={targetCategory}>{targetCategory}</option>)}</select></div>}</div>)}</React.Fragment>)}</div><div className="sidebar-drag-announcer" aria-live="assertive" aria-atomic="true">{sidebarDragAnnouncement}</div></div></> : <>{view==="home"&&<button type="button" className="side-link dm-home-friends-link" onClick={switchToFriends}><span><Icon name="users" size={17}/></span> Friends <span className="side-count">{people.length}</span></button>}<div className="side-heading"><span>DIRECT MESSAGES</span><button onClick={() => { setModal("dm"); setModalInput(""); }} aria-label="New direct message"><Icon name="plus" size={20} /></button></div><div className="dm-list">{filteredPeople.map(p => <div key={p.name.toLowerCase()} className={`dm-item-row ${view === "dm" && active.toLowerCase() === p.name.toLowerCase() ? "active" : ""}`} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})}><button type="button" className="dm-item" onClick={() => openDM(p)}><span className={`avatar ${p.color}`}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}{p.online && <i/>}</span><span className="dm-label"><strong>{p.name}</strong>{p.preview && <small>{p.preview}</small>}</span>{notifications.filter(n=>!n.read_at&&n.type==="mention"&&n.actor_id===p.id).length > 0 && <span className="dm-ping-count">{notifications.filter(n=>!n.read_at&&n.type==="mention"&&n.actor_id===p.id).length}</span>}</button><button type="button" className="dm-close-btn" title={`Close ${p.name} conversation`} aria-label={`Close ${p.name} conversation`} onClick={e=>{e.stopPropagation();void hideDMForPerson(p);}}><Icon name="close" size={15}/></button></div>)}</div></>}</>}
      <div className="user-bar"><div className="user-avatar-wrap"><div className="avatar self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}</div><button type="button" className={"user-status-indicator status-" + status.toLowerCase().replace(/\s+/g, "-")} aria-label={"Change status, currently " + status} title={"Status: " + status} onClick={() => setStatusMenuOpen(v => !v)} /></div>{statusMenuOpen && <div className="user-status-menu" role="menu" aria-label="Set your status"><div className="user-status-menu-title">Set your status</div>{([{value:"Online",label:"Online",description:"You’re active",color:"online"},{value:"Idle",label:"Idle",description:"You may be away",color:"idle"},{value:"Do not disturb",label:"Do Not Disturb",description:"Mute notifications",color:"dnd"},{value:"Offline",label:"Invisible",description:"Appear offline",color:"offline"}] as const).map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={status===option.value} className={"user-status-option " + (status===option.value?"selected":"")} onClick={() => { void changeStatus(option.value); }}><i className={"status-option-dot " + option.color} /><span><strong>{option.label}</strong><small>{option.description}</small></span>{status===option.value&&<span aria-hidden="true">✓</span>}</button>)}</div>}<div className="user-account"><div className="user-account-top"><div className="user-label"><strong>{name}</strong><small>{status}</small></div><button className="icon-btn user-settings" title="User settings" aria-label="User settings" onClick={() => {setModal("settings");setSettingsLoading(true);void (async()=>{try{const {data,error}=await supabase.from("profiles").select("username,status,avatar_url,public_id,bio").eq("id",session.user.id).maybeSingle();if(error)throw error;if(data){if(data.username)setName(data.username);setSavedAccounts(rememberVoaxAccount(session,{username:data.username||name,avatarUrl:data.avatar_url||null}));if(data.status)setStatus(data.status as PresenceStatus);setAvatarUrl(data.avatar_url||null);setProfileBio(data.bio||"");}}catch(error){const message=error&&typeof error==="object"&&"message" in error&&typeof error.message==="string"?error.message:error instanceof Error?error.message:"Please try again.";notify("Couldn't load settings: "+message);}finally{setSettingsLoading(false);}})();}}><Icon name="settings" size={17} /></button></div><div className="user-voice-controls"><button type="button" className={`icon-btn voice-toggle ${voiceConnected ? "voice-connected" : ""}`} title={voiceConnected ? "End voice call" : incomingVoiceOffer ? "Answer voice call" : "Start voice call (direct messages)"} aria-label={voiceConnected ? "End voice call" : incomingVoiceOffer ? "Answer voice call" : "Start voice call (direct messages)"} aria-pressed={voiceConnected} onClick={() => { void toggleVoiceCall(); }}><Icon name="voice" size={16} /></button><button type="button" className="icon-btn voice-toggle" title={microphoneEnabled ? "Mute microphone" : "Unmute microphone"} aria-label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"} aria-pressed={microphoneEnabled} onClick={() => { const next=!microphoneEnabled;setMicrophoneEnabled(next);localStreamRef.current?.getAudioTracks().forEach(track=>track.enabled=next);notify(next ? "Microphone unmuted." : "Microphone muted."); }}><Icon name={microphoneEnabled ? "mic" : "micOff"} size={16} /></button><button type="button" className="icon-btn voice-toggle" title={audioEnabled ? "Turn audio off" : "Turn audio on"} aria-label={audioEnabled ? "Turn audio off" : "Turn audio on"} aria-pressed={audioEnabled} onClick={() => { const next=!audioEnabled;setAudioEnabled(next);if(remoteAudioRef.current)remoteAudioRef.current.muted=!next;notify(next ? "Call audio enabled." : "Call audio muted."); }}><Icon name={audioEnabled ? "headphones" : "headphonesOff"} size={16} /></button></div></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="mobile-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Icon name="menu" size={20} /></button><div className="topbar-title"><span className="title-symbol">{view === "channel" ? <Icon name="hash" /> : view === "dm" ? <Icon name="at" /> : <Icon name="users" />}</span><div><strong>{view === "explore" ? "Explore servers" : view === "channel" ? activeChannel?.name || active : view === "dm" ? active : view === "home" ? "Direct Messages" : "Friends"}</strong><small>{view === "channel" ? (activeChannel?.channelType==="forum"?"Forum channel":activeChannel?.channelType==="announcement"?"Announcement channel":activeChannel?.description) : view === "dm" && typingPerson === active ? "Typing…" : ""}</small></div></div><div className="topbar-actions">{view === "channel" && <button className={`icon-btn member-toggle ${showMembers ? "active" : ""}`} title={showMembers ? "Hide member list" : "Show member list"} aria-label={showMembers ? "Hide member list" : "Show member list"} aria-pressed={showMembers} onClick={() => setShowMembers(v => !v)}><Icon name="users" size={18} /></button>}<button className="icon-btn inbox-trigger" title={"Inbox"+(inboxUnreadTotal>0?" · "+inboxUnreadTotal+" unread":"")} aria-label={"Inbox"+(inboxUnreadTotal>0?", "+inboxUnreadTotal+" unread":"")} onClick={() => setModal("inbox")}><Icon name="inbox" size={18} />{inboxUnreadTotal>0&&<span className="inbox-trigger-badge">{inboxUnreadTotal>99?"99+":inboxUnreadTotal}</span>}</button></div></header>
      {view==="explore" ? <ExplorePage session={session} embedded routePath={explorePath} onNavigate={navigateExplore} onlineCounts={presenceByServer}/> : (view === "friends" || view === "home") ? <section className={"friends-view "+(view==="home"?"dm-home-view":"friends-page-view")}><div className="friends-intro"><h1>{view === "home" ? "Direct Messages" : "Friends"}</h1>{view==="home"&&<p className="dm-home-intro-copy">Your conversations, friends, and people you can message — all in one place.</p>}<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn primary" onClick={() => { setModal("dm"); setModalInput(""); }}>＋ Start a conversation</button><button className="btn secondary" onClick={() => { setModal("friend"); setModalInput(""); }}>＋ Add friend</button></div>{view==="friends"&&friendRequests.length>0&&<div style={{marginTop:20}}><h3>Friend requests</h3>{friendRequests.map(request=><div key={request.id} className="friend-card" style={{marginBottom:8}}><div className="avatar">{request.avatarUrl?<img src={request.avatarUrl} alt=""/>:initials(request.name)}</div><div className="friend-info"><strong>{request.name}</strong><small>Wants to be your friend</small></div><button className="btn small primary" disabled={busyAction !== null} onClick={()=>void withBusyAction("friend-request-"+request.id,()=>respondToFriendRequest(request,true))}>{busyAction === "friend-request-"+request.id ? <>Accepting <span className="button-spinner" aria-hidden="true" /></> : "Accept"}</button><button className="btn small secondary" disabled={busyAction !== null} onClick={()=>void withBusyAction("friend-request-"+request.id,()=>respondToFriendRequest(request,false))}>{busyAction === "friend-request-"+request.id ? <>Updating <span className="button-spinner" aria-hidden="true" /></> : "Decline"}</button></div>)}</div>}</div><div className="friend-tools"><div className="filter-tabs">{view === "friends" ? <><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All friends <span>{people.length}</span></button><button className={filter === "online" ? "chosen" : ""} onClick={() => setFilter("online")}>Online <span>{people.filter(p => p.online).length}</span></button></> : <><button className={filter==="all"?"chosen":""} onClick={()=>setFilter("all")}>All <span>{people.length}</span></button><button className={filter==="online"?"chosen":""} onClick={()=>setFilter("online")}>Online <span>{people.filter(p=>p.online).length}</span></button></>}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a friend..." aria-label="Find a friend"/></div><div className="friend-grid">{filteredPeople.map(p => <article className={"friend-card "+(view==="home"?"dm-home-person-card":"")} key={p.name} onClick={() => openProfile(p)} onContextMenu={e=>showContextMenu(e,{kind:"person",person:p})} style={{cursor:"pointer"}}><div className={`avatar large ${p.color}`} role="button" aria-label={`View ${p.name} profile`}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}<i className={p.online ? "online" : ""}/></div><div className="friend-info"><strong>{p.name}</strong>{view==="home"&&<small>{p.preview|| (p.online?"Online":"Offline")}</small>}</div><button className="btn small primary" onClick={e => {e.stopPropagation();void openDM(p);}}>{view === "home" ? "Open DM" : "Message"}</button>{view==="friends"&&<button className="btn small secondary" onClick={e=>{e.stopPropagation();void removeFriend(p);}}>Remove</button>}</article>)}</div>{!filteredPeople.length && <div className="empty-state">No friends match that search.</div>}</section> :
      view==="channel"&&activeChannel&&(activeChannel.channelType==="forum"||activeChannel.channelType==="announcement")?<ChannelDiscussionView channel={activeChannel} session={session} canManageThreads={canManageChannels||customServerRoles.some(role=>(customRoleAssignments[activeServer]?.[session.user.id]||[]).includes(role.id)&&Boolean(role.permissions.manage_threads))} canPublishAnnouncements={canManageChannels||customServerRoles.some(role=>(customRoleAssignments[activeServer]?.[session.user.id]||[]).includes(role.id)&&Boolean(role.permissions.publish_announcements))} clockFormat={clockFormat} onNotify={notify}/>:<><div className={`message-scroll ${view === "dm" ? "dm-open-message-scroll" : ""}`} key={activeKey}>{messagesLoading ? (view === "dm" ? <DmConversationSkeleton /> : <div className="skeleton-message-list server-loading-messages" role="status" aria-label="Loading channel messages">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-message-row" key={i}><SkeletonBar className="skeleton-avatar" /><div className="skeleton-stack"><SkeletonBar className="skeleton-line medium" /><SkeletonBar className={`skeleton-line ${i % 2 ? "wide" : "message-line"}`} /><SkeletonBar className="skeleton-line message-line-short" /></div></div>)}</div>) : visibleMessages.length ? visibleMessages.map((m, messageIndex) => { const previousMessage=visibleMessages[messageIndex-1]; const currentTimestamp=m.timestamp?Date.parse(m.timestamp):NaN; const previousTimestamp=previousMessage?.timestamp?Date.parse(previousMessage.timestamp):NaN; const sameAuthor=Boolean(previousMessage)&&Boolean(m.own)===Boolean(previousMessage.own)&&(m.own||m.author.toLowerCase()===previousMessage.author.toLowerCase()); const grouped=Boolean(sameAuthor&&Number.isFinite(currentTimestamp)&&Number.isFinite(previousTimestamp)&&currentTimestamp>=previousTimestamp&&currentTimestamp-previousTimestamp<5*60*1000); return <article data-message-id={m.id} className={`message-row message-row-actionable ${compact ? "tight" : ""} ${grouped ? "message-group-continuation" : ""}`} key={m.id} onContextMenu={e=>showContextMenu(e,{kind:"message",message:m})}>{!grouped ? <div className={`avatar message-avatar ${m.own ? "self" : (m.author === "Voax" || m.author === "voax") ? "bot" : "blue"}`} role="button" tabIndex={0} style={{cursor:"pointer"}} onClick={() => {const p=m.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl,bio:profileBio}:people.find(p=>p.name===m.author);if(p)openProfile(p);}}>{(m.own ? avatarUrl : people.find(p=>p.name===m.author)?.avatarUrl) ? <img src={(m.own ? avatarUrl : people.find(p=>p.name===m.author)?.avatarUrl) || ""} alt="" /> : initials(m.author)}</div> : <div className="message-avatar-spacer" aria-hidden="true"><time>{m.timestamp ? formatClock(new Date(m.timestamp), clockFormat) : m.time}</time></div>}<div className="message-body">{!grouped && <div className="message-meta"><strong role="button" tabIndex={0} style={{cursor:"pointer",...(view==="channel"?(()=>{const authorId=m.own?session.user.id:people.find(p=>p.name===m.author)?.id;const assignedIds=authorId?(customRoleAssignments[activeServer]?.[authorId]||[]):[];const authorRole=[...customServerRoles].sort((a,b)=>b.position-a.position).find(role=>assignedIds.includes(role.id));return authorRole?{color:authorRole.color}:{};})():{})}} onClick={() => {const p=m.own?{id:session.user.id,name,status,online:status!=="Offline",color:"self",preview:"Your profile",avatarUrl}:people.find(p=>p.name===m.author);if(p)openProfile(p);}}>{m.author === "voax" ? "Voax" : m.author}</strong>{(m.author === "Voax" || m.author === "voax") && <span className="bot-tag">BOT</span>}<time>{m.timestamp ? formatDateTime(new Date(m.timestamp), clockFormat) : m.time}</time></div>}{m.replyTo && <div className="reply-context"><span>↳ Replying to <strong>{m.replyTo.author}</strong></span><p>{m.replyTo.text}</p></div>}<MessageContent text={m.text} servers={servers} members={view==="channel"?[...serverMemberPeople,{id:session.user.id,name,online:status!=="Offline",status,color:"self",preview:"You",avatarUrl}]:people} roles={view==="channel"?customServerRoles:[]} onlineCounts={presenceByServer} onOpenProfile={openProfile} onJoinInvite={(code)=>void withBusyAction("join-invite-"+code,()=>joinServerByCode(code))} />{m.editedAt&&<span className="message-edited-label">(edited)</span>}{!!m.attachments?.length && <div className="message-attachments">{m.attachments.map((attachment,attachmentIndex)=>{const isImage=attachment.mimeType.startsWith("image/"),isVideo=attachment.mimeType.startsWith("video/"),isMedia=isImage||isVideo;return <div key={attachment.path} className={"message-attachment"+(isMedia?" message-attachment-media":"")}>{isMedia&&attachment.url?<button type="button" className="message-media-thumb" onClick={()=>setMediaViewer({items:m.attachments!.filter(item=>(item.mimeType.startsWith("image/")||item.mimeType.startsWith("video/"))&&Boolean(item.url)),index:m.attachments!.filter(item=>(item.mimeType.startsWith("image/")||item.mimeType.startsWith("video/"))&&Boolean(item.url)).findIndex(item=>item.path===attachment.path)})} aria-label={"View "+(isVideo?"video ":"image ")+attachment.name}>{isImage?<img src={attachment.url} alt={attachment.name} loading="lazy"/>:<><video src={attachment.url} preload="metadata" muted playsInline/><span className="message-video-play"><Icon name="play" size={22}/></span></>}</button>:<a className="message-attachment-file" href={attachment.url} target="_blank" rel="noreferrer" download={attachment.name}><span className="message-attachment-icon">📎</span><span><strong>{attachment.name}</strong><small>{(attachment.size/1024/1024).toFixed(2)} MB</small></span></a>}{isMedia&&<span className="message-attachment-caption"><strong>{attachment.name}</strong><small>{(attachment.size/1024/1024).toFixed(2)} MB</small></span>}</div>;})}</div>}{!!m.reactions?.length && <div className="message-reactions">{m.reactions.map(reaction => <button key={reaction.emoji} className={`reaction-chip ${reaction.reacted?"selected":""}`} onClick={() => toggleReaction(m.id, reaction.emoji)} aria-label={`${reaction.reacted?"Remove":"Add"} ${reaction.emoji} reaction`}><Twemoji emoji={reaction.emoji}/><span>{reaction.count}</span></button>)}</div>}<div className="message-actions"><EmojiPicker onSelect={emoji => void toggleReaction(m.id, emoji)} /><button onClick={() => startReply(m)} title="Reply" aria-label={`Reply to ${m.author}`}><Icon name="reply" size={14}/></button><button onClick={() => { void copyMessage(m.text); }} title="Copy message" aria-label="Copy message"><Icon name="copy" size={14}/></button>{m.own&&<><button onClick={()=>startEditMessage(m)} title="Edit your message" aria-label="Edit your message"><Icon name="edit" size={14}/></button><button onClick={()=>void deleteMessage(m)} title="Delete your message" aria-label="Delete your message"><Icon name="delete" size={14}/></button></>}</div></div></article>;}) : <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={25} /></div><h3>{search.trim() ? "No matching messages" : "This is the beginning."}</h3><p>{search.trim() ? "Try another keyword or clear the search." : "Send the first message to get the conversation going."}</p></div>}{typingPerson && <div style={{ padding: "0 4vw 8px", color: "#8792a5", fontSize: 11 }} role="status">{typingPerson} is typing<span aria-hidden="true">…</span></div>}</div><div className="composer-area">{mentionMenu&&<div className="mention-suggestions" role="listbox" aria-label="Mention suggestions">{mentionMenu.options.map(option=><button key={option.type+":"+(option.id||option.label)} type="button" className="mention-suggestion" onMouseDown={e=>e.preventDefault()} onClick={()=>chooseMentionSuggestion(option)}>{option.type==="user"&&(()=>{const person=serverMemberPeople.find(item=>item.id===option.id)||(activePerson?.id===option.id?activePerson:null);return person?<span className="mention-suggestion-avatar">{person.avatarUrl?<img src={person.avatarUrl} alt=""/>:initials(person.name)}</span>:null;})()}<span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div>}{replyingTo && <div className="replying-banner"><span><Icon name="reply" size={14}/> Replying to <strong>{replyingTo.author}</strong><small>{replyingTo.text}</small></span><button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><Icon name="close" size={14}/></button></div>}{pendingAttachments.length>0&&<div className="pending-attachments">{pendingAttachments.map(attachment=><div className="pending-attachment" key={attachment.path}><span>📎 {attachment.name}</span><button type="button" className="icon-btn" aria-label={"Remove "+attachment.name} onClick={()=>void removePendingAttachment(attachment)}><Icon name="close" size={13}/></button></div>)}</div>}<form className={"composer"+(editingMessageId?" composer-editing":"")} onSubmit={e => { e.preventDefault(); void withBusyAction(editingMessageId?"edit-message":"send-message", () => editingMessageId?saveEditMessage(e):sendMessage(e)); }}>{!editingMessageId&&<button type="button" className="attach-btn" title={attachmentBusy?"Uploading attachment…":"Attach file"} aria-label="Attach file" disabled={attachmentBusy} onClick={() => attachmentInputRef.current?.click()}><Icon name="paperclip" size={18} /></button>}{!editingMessageId&&<input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain,application/zip,application/x-zip-compressed" multiple hidden onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value="";void(async()=>{for(const file of files)await uploadMessageAttachment(file);})();}}/>}<input value={draft} onChange={e => {setDraft(e.target.value);updateMentionSuggestions(e.target.value);sendTyping(Boolean(e.target.value.trim()));}} onKeyDown={e=>{if(e.key==="Escape")setMentionMenu(null);}} onBlur={()=>sendTyping(false)} placeholder={editingMessageId?"Edit your message…":view === "channel" ? `Message #${activeChannel?.name || active}` : `Message @${active}`} aria-label={editingMessageId?"Edit message":"Message"} maxLength={4000}/><EmojiPicker buttonLabel="Insert emoji" onSelect={emoji => setDraft(value => value + emoji)} />{editingMessageId&&<button type="button" className="icon-btn" onClick={()=>{setEditingMessageId(null);setDraft("");}} aria-label="Cancel editing">×</button>}{sendButtonEnabled && <button className="send-btn" type="submit" disabled={!draft.trim() || busyAction !== null} aria-label={editingMessageId?"Save edited message":busyAction === "send-message" ? "Sending message" : "Send message"}>{busyAction === "send-message"||busyAction==="edit-message" ? <span className="button-spinner" aria-hidden="true" /> : editingMessageId?<Icon name="check" size={17}/>:<Icon name="send" size={17} />}</button>}</form></div></>}
    </main>

    {mediaViewer && mediaViewer.items[mediaViewer.index] && <div className="media-viewer-backdrop" role="presentation" onClick={()=>setMediaViewer(null)}><div className="media-viewer-dialog" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={event=>event.stopPropagation()}><div className="media-viewer-toolbar"><span className="media-viewer-filename">{mediaViewer.items[mediaViewer.index].name}</span><span className="media-viewer-count">{mediaViewer.index+1} / {mediaViewer.items.length}</span><button type="button" className="media-viewer-close" onClick={()=>setMediaViewer(null)} aria-label="Close viewer"><Icon name="close" size={21}/></button></div><div className="media-viewer-stage">{mediaViewer.items[mediaViewer.index].mimeType.startsWith("video/")?<video key={mediaViewer.items[mediaViewer.index].path} src={mediaViewer.items[mediaViewer.index].url} controls autoPlay playsInline/>:<img src={mediaViewer.items[mediaViewer.index].url} alt={mediaViewer.items[mediaViewer.index].name}/>}</div>{mediaViewer.items.length>1&&<><button type="button" className="media-viewer-nav media-viewer-prev" onClick={()=>setMediaViewer(current=>current?{...current,index:(current.index-1+current.items.length)%current.items.length}:current)} aria-label="Previous media"><Icon name="chevron-left" size={25}/></button><button type="button" className="media-viewer-nav media-viewer-next" onClick={()=>setMediaViewer(current=>current?{...current,index:(current.index+1)%current.items.length}:current)} aria-label="Next media"><Icon name="chevron-right" size={25}/></button></>}</div></div>}
    {showMembers && view === "channel" && <aside className="member-panel" aria-label="Channel members">
      <div className="member-panel-head"><div><strong>Members</strong><span>{visibleChannelOnlineCount} online · {visibleChannelMemberPeople.length + 1} members</span></div></div>
      {(() => {
        const allMembers: Person[] = [
          { id: session.user.id, name, online: status !== "Offline", status, color: "blue", preview: "You", avatarUrl, isFriend: false },
          ...visibleChannelMemberPeople
        ];
        const orderedRoles = [...customServerRoles].sort((a, b) => b.position - a.position);
        const getPrimaryCustomRole = (userId: string) => {
          const assignedIds = customRoleAssignments[activeServer]?.[userId] || [];
          return orderedRoles.find(role => assignedIds.includes(role.id));
        };
        const onlineMembers = allMembers.filter(person => person.online);
        const offlineMembers = allMembers.filter(person => !person.online);
        const groups = [
          ...orderedRoles.map(role => ({ id: role.id, name: role.name, color: role.color, members: onlineMembers.filter(person => getPrimaryCustomRole(person.id)?.id === role.id) })),
          { id: "unassigned", name: "Online", color: "var(--muted)", members: onlineMembers.filter(person => !getPrimaryCustomRole(person.id)) },
          { id: "offline", name: "Offline", color: "var(--muted)", members: offlineMembers }
        ].filter(group => group.members.length > 0);
        return groups.map(group => <section className="member-role-group" key={group.id}>
          <div className="member-group-label member-role-group-label"><span className="member-status-dot" style={{background: group.color}}/><span>{group.name.toUpperCase()}</span><span className="member-role-group-count">{group.members.length}</span></div>
          <div className="member-list">{group.members.map(person => {
            const isSelf = person.id === session.user.id;
            const primaryRole = getPrimaryCustomRole(person.id);
            const memberStatus = person.status || (person.online ? "Online" : "Offline");
            return <button className={"member-entry" + (person.online ? "" : " offline")} key={person.id} onClick={() => isSelf ? openProfile({ ...person }) : openProfile(person)} onContextMenu={e => !isSelf && showContextMenu(e, {kind:"person",person})} title={isSelf ? "Your profile" : `View ${person.name} profile`}>
              <span className={`avatar member-avatar ${person.color || "blue"}`}>{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(person.name)}<i className={person.online ? "online" : ""}/></span>
              <span className="member-entry-copy"><strong style={primaryRole ? {color:primaryRole.color} : undefined}>{person.name}{isSelf ? " (you)" : ""}</strong><small>{memberStatus}</small></span>
              {!isSelf && <span className="member-entry-action"><span role="button" tabIndex={0} aria-label={`Message ${person.name}`} title={`Message ${person.name}`} onClick={e=>{e.stopPropagation();void openDM(person);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();void openDM(person);}}}><Icon name="message" size={15}/></span></span>}
            </button>;
          })}</div>
        </section>);
      })()}
    </aside>}
    {modal && <div className={"modal-backdrop " + (modalClosing ? "is-closing" : "")} onMouseDown={e => { if (e.target === e.currentTarget) { setModal(null); setCategoryCreationMode(false); } }}><section className={"modal " + (modalClosing ? "is-closing" : "") + " " + (modal === "settings" ? "discord-settings-modal" : modal === "manageServer" || modal === "manageRoles" ? "discord-server-settings-modal" : modal === "manageChannel" ? "discord-channel-settings-modal" : "")} role="dialog" aria-modal="true"><button className="modal-x" onClick={() => {setModal(null);setCategoryCreationMode(false);}} aria-label="Close"><Icon name="close" size={18} /></button>
      {modal === "dm" && <><span className="section-kicker">DIRECT MESSAGES</span><h2>New direct message</h2><p>Enter the username of someone with a Voax account.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-dm", () => createItem(e)); }}><label htmlFor="modalInput">Username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-dm" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create DM"}</button></div></form></>}
      {modal === "friend" && <><h2>Add a friend</h2><p>Send a request using the player’s exact Voax username.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("send-friend-request", () => sendFriendRequest(e)); }}><label htmlFor="modalInput">Voax username</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e=>setModalInput(e.target.value)} placeholder="e.g. AlexTheBuilder" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "send-friend-request" ? <>Sending <span className="button-spinner" aria-hidden="true" /></> : "Send request"}</button></div></form></>}
      {modal === "server" && <><span className="section-kicker">NEW COMMUNITY</span><h2>Create a server</h2><p>Give your community a name. We will create a #general channel automatically.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-server", () => createServer(e)); }}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={40} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Survival Squad" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => {setModalInput("");setModal("joinServer");}}>Join with invite</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-server" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create server"}</button></div></form></>}
      {modal === "joinServer" && <><span className="section-kicker">JOIN COMMUNITY</span><h2>Join a server</h2><p>Paste an invite code from someone in the community.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("join-server", () => joinServer(e)); }}><label htmlFor="modalInput">Invite code</label><input id="modalInput" autoFocus maxLength={128} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Paste invite code" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => {setModalInput("");setModal("server");}}>Back</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "join-server" ? <>Joining <span className="button-spinner" aria-hidden="true" /></> : "Join server"}</button></div></form></>}
      {modal === "manageServer" && <div className="discord-server-settings-layout"><nav className="discord-server-settings-nav" aria-label="Server settings sections"><div className="discord-settings-nav-title">SERVER SETTINGS</div><div className="discord-server-nav-server">{currentServer?.iconUrl ? <img src={currentServer.iconUrl} alt="" /> : <span>{initials(currentServer?.name || "Server")}</span>}<strong>{currentServer?.name || "Server"}</strong></div>{canManageServer&&<><button type="button" className={serverSettingsSection==="overview"?"active":""} onClick={()=>setServerSettingsSection("overview")}><Icon name="settings" size={16}/> Overview</button><button type="button" className={serverSettingsSection==="discovery"?"active":""} onClick={()=>{setServerSettingsSection("discovery");void loadServerDiscoverySettings();}}><Icon name="search" size={16}/> Discovery</button></>}{canReorderCategoriesAndChannels&&<button type="button" className={serverSettingsSection==="order"?"active":""} onClick={()=>setServerSettingsSection("order")}><Icon name="arrow-up-down" size={16}/> Order Server</button>}{canManageRoles&&<button type="button" onClick={() => setModal("manageRoles")}><Icon name="users" size={16}/> Members &amp; Roles</button>}<button type="button" onClick={async () => {if(!currentServer?.inviteCode)return;try{await navigator.clipboard.writeText(window.location.origin+"/invite/"+currentServer.inviteCode);notify("Invite link copied.");}catch{notify("Clipboard access is blocked by this browser.");}}}><Icon name="link" size={16}/> Invite people</button><div className="discord-settings-nav-spacer"/><div className="discord-settings-nav-title">DANGER ZONE</div><button type="button" className="discord-server-danger" disabled={servers.length <= 1 || currentServer?.role !== "owner"} onClick={askDeleteServer}><Icon name="delete" size={16}/> Delete server</button></nav><div className="discord-settings-content">{serverSettingsSection==="overview"?<><div className="discord-settings-heading"><span className="section-kicker">SERVER SETTINGS</span><h2>Server Overview</h2><p>Customize {currentServer?.name || "this server"}’s identity and manage access.</p></div><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-server", () => renameServer(e)); }}><label htmlFor="modalInput">Server name</label><input id="modalInput" autoFocus maxLength={60} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><label htmlFor="serverShortDescription">Short description <small>Shown in the workspace and invite card · up to 120 characters</small></label><input id="serverShortDescription" maxLength={120} value={serverShortDescription} onChange={e=>setServerShortDescription(e.target.value)} placeholder="A quick introduction to your server"/><label htmlFor="serverBannerFile">Server banner</label><div className="server-banner-upload-row">{serverBannerUrl?<img src={serverBannerUrl} alt="Server banner preview"/>:<span>No banner uploaded yet</span>}<div><input id="serverBannerFile" type="file" accept="image/jpeg,image/png,image/webp" disabled={serverBannerBusy} onChange={e=>{void uploadServerBanner(e.target.files?.[0]||null);e.currentTarget.value="";}}/><small>{serverBannerBusy?"Uploading…":"JPG, PNG or WebP · max 5 MB"}</small></div></div><label htmlFor="serverIconFile">Server image</label><div className="server-icon-upload-row"><div className="server-icon-preview">{currentServer?.iconUrl ? <img src={currentServer.iconUrl} alt="" /> : <span>{initials(currentServer?.name || "Server")}</span>}</div><div className="server-icon-upload-control"><input id="serverIconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={serverIconBusy} onChange={e => {void uploadServerIcon(e.target.files?.[0]||null);e.currentTarget.value="";}}/><small>{serverIconBusy ? "Uploading image…" : "JPG, PNG, WebP or GIF · max 5 MB"}</small></div></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-server" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form><div className="discord-settings-heading" style={{marginTop:28}}><span className="section-kicker">MESSAGING &amp; SAFETY</span><h2>Ping safeguards</h2><p>Configure mass-ping confirmation, cooldowns, and anti-spam limits for this server.</p></div><div className="ping-setting-group"><h3>Mass-ping protection</h3><p>Confirm pings above the recipient threshold. The cooldown applies per sender and server.</p><label>Confirmation threshold<input type="number" min={1} max={10000} value={serverPingSettings.confirmation_threshold} disabled={!isOwnerOrAdmin||serverPingSettingsSaving} onChange={e=>setServerPingSettings(s=>({...s,confirmation_threshold:Math.max(1,Math.min(10000,Number(e.target.value)||1))}))} onBlur={e=>void saveServerPingSettings({confirmation_threshold:Math.max(1,Math.min(10000,Number(e.currentTarget.value)||25))})}/></label><label>Mass-ping cooldown (seconds)<input type="number" min={0} max={3600} value={serverPingSettings.cooldown_seconds} disabled={!isOwnerOrAdmin||serverPingSettingsSaving} onChange={e=>setServerPingSettings(s=>({...s,cooldown_seconds:Math.max(0,Math.min(3600,Number(e.target.value)||0))}))} onBlur={e=>void saveServerPingSettings({cooldown_seconds:Math.max(0,Math.min(3600,Number(e.currentTarget.value)||0))})}/></label><label className="settings-preference-row"><span><strong>Allow administrators to use mass pings</strong><small>Only the server owner can change this control.</small></span><input type="checkbox" checked={serverPingSettings.admin_mass_pings_enabled} disabled={currentServer?.role!=="owner"||serverPingSettingsSaving} onChange={e=>void saveServerPingSettings({admin_mass_pings_enabled:e.target.checked})}/></label></div><div className="ping-setting-group"><h3>Rate limits</h3><p>Limits are enforced by the database, even if a client tries to bypass the UI.</p><label>Direct mention targets per 10 seconds<input type="number" min={1} max={1000} value={serverPingSettings.direct_targets_per_10s} disabled={!isOwnerOrAdmin||serverPingSettingsSaving} onChange={e=>setServerPingSettings(s=>({...s,direct_targets_per_10s:Math.max(1,Math.min(1000,Number(e.target.value)||1))}))} onBlur={e=>void saveServerPingSettings({direct_targets_per_10s:Math.max(1,Math.min(1000,Number(e.currentTarget.value)||10))})}/></label><label>Role mentions per 60 seconds<input type="number" min={1} max={100} value={serverPingSettings.role_actions_per_60s} disabled={!isOwnerOrAdmin||serverPingSettingsSaving} onChange={e=>setServerPingSettings(s=>({...s,role_actions_per_60s:Math.max(1,Math.min(100,Number(e.target.value)||1))}))} onBlur={e=>void saveServerPingSettings({role_actions_per_60s:Math.max(1,Math.min(100,Number(e.currentTarget.value)||5))})}/></label><label>Messages per 5 seconds<input type="number" min={1} max={100} value={serverPingSettings.messages_per_5s} disabled={!isOwnerOrAdmin||serverPingSettingsSaving} onChange={e=>setServerPingSettings(s=>({...s,messages_per_5s:Math.max(1,Math.min(100,Number(e.target.value)||1))}))} onBlur={e=>void saveServerPingSettings({messages_per_5s:Math.max(1,Math.min(100,Number(e.currentTarget.value)||5))})}/></label>{serverPingSettingsSaving&&<small className="settings-help">Saving safeguards…</small>}</div></>:serverSettingsSection==="discovery"?<div className="server-discovery-settings"><div className="discord-settings-heading"><span className="section-kicker">SERVER SETTINGS</span><h2>Discovery</h2><p>Set the public information people see when they find your community in Explore.</p></div><form onSubmit={e=>void saveServerDiscoverySettings(e)}><label>Long description <small>Up to 500 characters</small><textarea rows={6} maxLength={500} value={serverDiscoveryLongDescription} onChange={e=>setServerDiscoveryLongDescription(e.target.value)} placeholder="Describe what your community is about, what members do, and who should join."/></label><label>Tags <small>Comma separated · up to 10</small><input value={serverDiscoveryTags} onChange={e=>setServerDiscoveryTags(e.target.value)} placeholder="minecraft, survival, friends"/></label><div className="server-discovery-fields"><label>Category<select value={serverDiscoveryCategory} onChange={e=>setServerDiscoveryCategory(e.target.value)}>{["Gaming","Minecraft","Community","Technology","Art","Music","Education","Other","Programming","Sports","Entertainment"].map(item=><option key={item}>{item}</option>)}</select></label><label>Language<input maxLength={40} value={serverDiscoveryLanguage} onChange={e=>setServerDiscoveryLanguage(e.target.value)} placeholder="English"/></label></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setServerSettingsSection("overview")}>Back to overview</button><button className="btn primary" disabled={serverDiscoverySaving}>{serverDiscoverySaving?"Saving…":"Save discovery details"}</button></div><p className="settings-help">These details do not automatically publish your server or change its Explore visibility.</p></form></div>:<div className="server-order-settings"><div className="discord-settings-heading"><span className="section-kicker">SERVER SETTINGS</span><h2>Order Server</h2><p>Change the order of categories and channels in {currentServer?.name||"this server"}. Updates save immediately.</p></div>{serverOrderGroups.map(([category,groupedChannels])=><section className="server-order-group" key={category}><div className="server-order-group-heading"><div><strong>{category}</strong><small>{groupedChannels.length} {groupedChannels.length===1?"channel":"channels"}</small></div>{canReorderCategoriesAndChannels&&category!=="Text Channels"&&<div className="server-order-move-buttons"><button type="button" title={"Move "+category+" up"} aria-label={"Move "+category+" up"} disabled={orderedServerCategories.findIndex(item=>item.name===category)<=0} onClick={()=>moveCategoryBy(category,-1)}><Icon name="chevron-up" size={16}/></button><button type="button" title={"Move "+category+" down"} aria-label={"Move "+category+" down"} disabled={orderedServerCategories.findIndex(item=>item.name===category)<0||orderedServerCategories.findIndex(item=>item.name===category)>=orderedServerCategories.length-1} onClick={()=>moveCategoryBy(category,1)}><Icon name="chevron-down" size={16}/></button></div>}</div>{groupedChannels.map((channel,index)=><div className="server-order-row" key={channel.id}><span><Icon name="hash" size={15}/>{channel.name}</span><div className="server-order-move-buttons"><button type="button" title={"Move #"+channel.name+" up"} aria-label={"Move #"+channel.name+" up"} disabled={index===0} onClick={()=>moveChannelBy(channel,-1)}><Icon name="chevron-up" size={16}/></button><button type="button" title={"Move #"+channel.name+" down"} aria-label={"Move #"+channel.name+" down"} disabled={index===groupedChannels.length-1} onClick={()=>moveChannelBy(channel,1)}><Icon name="chevron-down" size={16}/></button></div></div>)}</section>)}</div>}</div></div>}
      {modal === "manageRoles" && <div className="discord-role-settings">
        <div className="discord-role-heading"><div><span className="section-kicker">SERVER SETTINGS</span><h2>Roles</h2><p>Manage role names, colors, permissions, and members for {currentServer?.name || "this server"}.</p></div><button type="button" className="btn secondary" onClick={()=>setModal("manageServer")}>Back to settings</button></div>
        <div className="discord-role-workspace">
          <aside className="discord-role-list-panel"><div className="discord-role-list-title"><strong>ROLES</strong><span>{customServerRoles.length}</span></div>
            <div className="discord-role-list-items">
              {customServerRoles.map(role=><button type="button" key={role.id} className={"discord-role-list-item "+((selectedRoleId===role.id||(!selectedRoleId&&customServerRoles[0]?.id===role.id))?"active":"")} onClick={()=>{setSelectedRoleId(role.id);setRoleEditorTab("display");}}><span className="discord-role-color" style={{background:role.color}}/><span className="discord-role-list-name">{role.name}</span><Icon name="chevronRight" size={15}/></button>)}
              <button type="button" className="discord-role-list-item discord-everyone-role" onClick={()=>notify("@everyone is represented by the default member role in Voax.")}><span className="discord-role-color everyone-dot">@</span><span className="discord-role-list-name">@everyone</span><Icon name="lock" size={14}/></button>
            </div>
            {canManageRoles&&<form className="discord-role-create" onSubmit={createCustomServerRole}><label htmlFor="newRoleName">Create a role</label><input id="newRoleName" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} maxLength={32} placeholder="New role name" required/><div className="discord-role-create-actions"><input aria-label="New role color" type="color" value={newRoleColor} onChange={e=>setNewRoleColor(e.target.value)}/><button className="btn primary" type="submit"><Icon name="plus" size={14}/> Create role</button></div></form>}
          </aside>
          <section className="discord-role-editor">
            {customServerRoles.length===0?<div className="discord-role-empty"><div className="discord-role-empty-icon"><Icon name="shield" size={25}/></div><h3>Create your first role</h3><p>Roles let you organize members and control what they can do in this server.</p></div>:<>{/* Selected role editor */}{(()=>{const role=customServerRoles.find(item=>item.id===selectedRoleId)||customServerRoles[0];return <div className="discord-role-editor-inner">
              <header className="discord-role-editor-header"><div><span className="section-kicker">EDIT ROLE</span><h3><span className="discord-role-color large" style={{background:role.color}}/>{role.name}</h3><small className="discord-role-hierarchy-hint">Role hierarchy · higher roles take precedence</small></div><div className="discord-role-header-actions">{canManageRoles&&<div className="discord-role-order-actions"><button type="button" className="icon-btn" title="Move role up" aria-label="Move role up" disabled={customServerRoles.slice().sort((a,b)=>b.position-a.position)[0]?.id===role.id} onClick={()=>void moveCustomRole(role.id,-1)}>↑</button><button type="button" className="icon-btn" title="Move role down" aria-label="Move role down" disabled={customServerRoles.slice().sort((a,b)=>b.position-a.position).at(-1)?.id===role.id} onClick={()=>void moveCustomRole(role.id,1)}>↓</button></div>}{canManageRoles&&<button type="button" className="icon-btn discord-role-delete" title="Delete role" aria-label={"Delete "+role.name} onClick={()=>void deleteCustomServerRole(role.id)}><Icon name="delete" size={16}/></button>}</div></header>
              <div className="discord-role-tabs" role="tablist" aria-label="Role editor tabs"><button type="button" role="tab" aria-selected={roleEditorTab==="display"} className={roleEditorTab==="display"?"active":""} onClick={()=>setRoleEditorTab("display")}>Display</button><button type="button" role="tab" aria-selected={roleEditorTab==="permissions"} className={roleEditorTab==="permissions"?"active":""} onClick={()=>setRoleEditorTab("permissions")}>Permissions</button><button type="button" role="tab" aria-selected={roleEditorTab==="members"} className={roleEditorTab==="members"?"active":""} onClick={()=>setRoleEditorTab("members")}>Manage Members <span>{serverMemberIds.filter(id=>(customRoleAssignments[activeServer]?.[id]||[]).includes(role.id)).length}</span></button></div>
              {roleEditorTab==="display"&&<form key={role.id} className="discord-role-display-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void saveCustomRoleDetails(role.id,{name:String(form.get("roleName")||role.name).trim().replace(/\s+/g," "),color:String(form.get("roleColor")||role.color)});}}><div className="discord-role-form-section"><h4>ROLE NAME</h4><label htmlFor="editRoleName">Name</label><input id="editRoleName" name="roleName" defaultValue={role.name} maxLength={32} required disabled={!canManageRoles}/></div><div className="discord-role-form-section"><h4>ROLE COLOR</h4><p>Use a color to help identify members with this role throughout Voax.</p><div className="discord-role-color-picker"><input id="editRoleColor" name="roleColor" type="color" defaultValue={role.color} disabled={!canManageRoles}/><span className="discord-role-color-preview" style={{color:role.color}}>{role.name}</span><span className="discord-role-color-hex">{role.color.toUpperCase()}</span></div><div className="discord-role-swatches">{["#00e5ff","#5eead4","#38bdf8","#818cf8","#facc15","#42ef9b","#f59e0b","#fb7185","#a78bfa","#94a3b8"].map(color=><button key={color} type="button" aria-label={"Use color "+color} title={color} style={{background:color}} onClick={()=>{const input=document.getElementById("editRoleColor") as HTMLInputElement|null;if(input)input.value=color;}} />)}</div></div><div className="discord-role-form-section"><h4>MENTION PERMISSIONS</h4><label className="discord-role-permission-row"><span><strong>Allow anyone to mention this role</strong><small>Members can ping this role without a separate mention-roles permission.</small></span><input type="checkbox" checked={Boolean(role.allow_anyone_to_mention)} disabled={!canManageRoles} onChange={e=>void saveCustomRoleDetails(role.id,{allow_anyone_to_mention:e.target.checked})}/></label></div><div className="discord-role-editor-footer">{canManageRoles?<button className="btn primary" type="submit" disabled={roleSaveBusy}>{roleSaveBusy?"Saving…":"Save changes"}</button>:<small>You don’t have permission to edit this role.</small>}</div></form>}
              {roleEditorTab==="permissions"&&<div className="discord-role-permissions"><div className="discord-role-permissions-intro"><h4>ROLE PERMISSIONS</h4><p>Choose what members with this role are allowed to manage. Changes are saved when you select a permission.</p></div>{([{key:"manage_server",label:"Manage server",description:"Change server settings and manage server-wide configuration."},{key:"manage_roles",label:"Manage roles",description:"Create and edit roles, and assign roles to members."},{key:"manage_channels",label:"Manage channels",description:"Create, edit, and organize server channels."},{key:"reorder_categories_channels",label:"Reorder Categories & Channels",description:"Drag or move categories and channels to organize the server sidebar."},{key:"manage_messages",label:"Manage messages",description:"Moderate messages in server channels."},{key:"manage_threads",label:"Manage threads",description:"Lock, archive, pin, and moderate forum discussions."},{key:"publish_announcements",label:"Publish announcements",description:"Publish posts in announcement channels."},{key:"manage_announcements",label:"Manage announcements",description:"Remove or manage published announcements."},{key:"kick_members",label:"Remove members",description:"Remove members from this server."},{key:"mention_roles",label:"Mention roles",description:"Mention roles that do not allow everyone to ping them."},{key:"mention_everyone",label:"Use @everyone",description:"Send a mass mention to all server members."},{key:"mention_here",label:"Use @here",description:"Mention members who are currently Online or Idle."}] as const).map(permission=><label key={permission.key} className="discord-role-permission-row"><span><strong>{permission.label}</strong><small>{permission.description}</small></span><input type="checkbox" checked={Boolean(role.permissions?.[permission.key])} disabled={!canManageRoles||(currentServer?.role!=="owner"&&(permission.key==="manage_roles"||permission.key==="manage_server"))} onChange={e=>void saveCustomRoleDetails(role.id,{permissions:{...role.permissions,[permission.key]:e.target.checked}})}/></label>)}<div className="discord-role-danger-note"><Icon name="shieldAlert" size={17}/><span><strong>Administrator-level access</strong><small>Only the server owner can grant Manage server or Manage roles in Voax.</small></span></div></div>}
              {roleEditorTab==="members"&&<div className="discord-role-members-editor"><div className="discord-role-permissions-intro"><h4>MANAGE MEMBERS</h4><p>Assign this role to members or remove it from them.</p></div>{serverMemberIds.length===0?<p className="discord-role-empty-copy">No members found.</p>:serverMemberIds.map(id=>{const person=people.find(p=>p.id===id);const self=id===session.user.id;const label=self?name:(person?.name||"Player");const image=self?avatarUrl:person?.avatarUrl;const owner=id===currentServer?.createdBy;const assigned=(customRoleAssignments[activeServer]?.[id]||[]).includes(role.id);return <div className="discord-role-member-assignment" key={id}><span className="avatar role-member-avatar">{image?<img src={image} alt=""/>:initials(label)}</span><span className="discord-role-member-copy"><strong>{label}</strong><small>{owner?"Server owner":self?"You":"Server member"}</small></span><button type="button" className={"discord-role-assignment-button "+(assigned?"assigned":"")} disabled={!canManageRoles||self||owner} onClick={()=>void assignCustomServerRole(id,role.id)}>{assigned?<><Icon name="check" size={14}/> Assigned</>:"Assign role"}</button></div>})}</div>}
            </div>})()}</>}
          </section>
        </div>
        <div className="discord-role-bottom-actions"><button type="button" className="btn secondary" onClick={()=>setModal("manageServer")}>Back to server settings</button><button type="button" className="btn primary" onClick={()=>setModal(null)}>Done</button></div>
      </div>}
      {modal === "manageChannel" && <div className="discord-channel-settings-layout"><nav className="discord-channel-settings-nav" aria-label="Channel settings sections"><span>CHANNEL SETTINGS</span><button type="button" className="selected" onClick={()=>document.getElementById("channel-overview")?.scrollIntoView({behavior:"smooth",block:"start"})}>Overview</button><button type="button" onClick={()=>document.getElementById("channel-permissions")?.scrollIntoView({behavior:"smooth",block:"start"})}>Permissions</button></nav><div className="discord-channel-settings-content"><span className="section-kicker">CHANNEL SETTINGS</span><h2>Channel settings</h2><p>Manage the channel’s details and who can access it.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-channel", () => renameChannel(e)); }}><section className="discord-channel-settings-section" id="channel-overview"><h3>Overview</h3><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} required/><label htmlFor="channelTypeInput">Channel type</label><select id="channelTypeInput" value={channelTypeInput} onChange={e=>setChannelTypeInput(e.target.value as "text"|"announcement"|"forum")}><option value="text">Text</option><option value="announcement">Announcement</option><option value="forum">Forum</option></select><label htmlFor="categoryInput">Category</label><select id="categoryInput" value={categoryInput} onChange={e=>setCategoryInput(e.target.value)}><option value="Text Channels">Text Channels</option>{channelCategories.filter(item=>item.serverId===activeServer&&item.name!=="Text Channels").map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select></section><div className="channel-access-settings" id="channel-permissions"><h3>Permissions</h3><label className="settings-preference-row"><span><strong>Sync permissions with category</strong><small>Keep this channel’s access rules identical to its category.</small></span><input type="checkbox" checked={activeChannel?.permissionsSynced!==false} disabled={!canManageChannels||!activeChannel} onChange={e=>activeChannel&&void toggleChannelPermissionSync(activeChannel.id,e.target.checked)}/></label><label className="settings-preference-row"><span><strong>Private channel</strong><small>Only members granted View Channel access can see this channel.</small></span><input type="checkbox" checked={channelPermissionOverwrites.some(row=>row.target_type==="everyone"&&row.deny_permissions.includes("view_channel"))} disabled={!canManageChannels||channelPermissionsLoading} onChange={e=>activeChannel&&void setChannelPrivate(activeChannel.id,e.target.checked)}/></label><div className="channel-role-access-list"><strong>Role access</strong><small>Grant View Channel to roles that should be able to see this channel.</small>{channelPermissionsLoading?<small>Loading permissions…</small>:customServerRoles.map(role=><label key={role.id} className="settings-preference-row"><span><strong style={{color:role.color}}>{role.name}</strong></span><input type="checkbox" checked={channelPermissionOverwrites.some(row=>row.target_type==="role"&&row.target_id===role.id&&row.allow_permissions.includes("view_channel"))} disabled={!canManageChannels} onChange={e=>activeChannel&&void saveChannelPermission(activeChannel.id,"role",role.id,"view_channel",e.target.checked)}/></label>)}</div>{activeChannel?.permissionsSynced&&<small className="settings-help">This channel inherits category permissions. Changes here create channel-specific overrides.</small>}</div><div className="discord-channel-settings-footer"><button type="button" className="btn secondary" disabled={serverChannels.length <= 1} onClick={() => activeChannel && askDeleteChannel(activeChannel)}>Delete channel</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-channel" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form></div></div>}
      {modal === "confirmDelete" && <><span className="section-kicker">CONFIRM DELETION</span><h2>Delete {pendingDelete?.type === "server" ? "server" : pendingDelete?.type === "category" ? "category" : "channel"}?</h2><p>{pendingDelete?.type === "server" ? `“${pendingDelete.name}” and all its channels and local messages will be removed from this browser.` : pendingDelete?.type === "category" ? `“${pendingDelete.name}” will be removed. Categories can only be deleted while they contain no channels.` : `#${pendingDelete?.name || "channel"} and its local message history will be removed from this browser.`} This cannot be undone.</p><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => { setModal(pendingDelete?.type === "server" ? "manageServer" : pendingDelete?.type === "category" ? "manageCategory" : "manageChannel"); setPendingDelete(null); }}>Cancel</button><button type="button" className="btn primary" disabled={busyAction !== null} onClick={() => void withBusyAction("delete", confirmDelete)}>{busyAction === "delete" ? <>Deleting <span className="button-spinner" aria-hidden="true" /></> : "Delete permanently"}</button></div></>}
      {modal === "category" && <><span className="section-kicker">{currentServer?.name || "SERVER"}</span><h2>Create a category</h2><p>Categories organize your server channels. You can add channels to this category at any time.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-category", () => createItem(e)); }}><label htmlFor="modalInput">Category name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="Text Channels" required/><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-category" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create category"}</button></div></form></>}{modal === "manageCategory" && <><span className="section-kicker">CATEGORY SETTINGS</span><h2>Category settings</h2><p>Rename this category and manage the permissions inherited by synced channels.</p>{canReorderCategoriesAndChannels&&<div className="category-order-controls"><div><strong>Category position</strong><small>Move this category higher or lower in the server sidebar.</small></div><div className="server-order-move-buttons"><button type="button" title="Move category up" aria-label="Move category up" disabled={orderedServerCategories.findIndex(item=>item.name===selectedCategory)<=0} onClick={()=>moveCategoryBy(selectedCategory,-1)}><Icon name="chevron-up" size={16}/></button><button type="button" title="Move category down" aria-label="Move category down" disabled={orderedServerCategories.findIndex(item=>item.name===selectedCategory)<0||orderedServerCategories.findIndex(item=>item.name===selectedCategory)>=orderedServerCategories.length-1} onClick={()=>moveCategoryBy(selectedCategory,1)}><Icon name="chevron-down" size={16}/></button></div></div>}<form onSubmit={e=>{e.preventDefault();void withBusyAction("rename-category",()=>renameCategory(e));}}><label htmlFor="modalInput">Category name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e=>setModalInput(e.target.value)} disabled={!canManageChannels} required/><div className="channel-access-settings"><h3>Category permissions</h3><label className="settings-preference-row"><span><strong>Hide from everyone</strong><small>Deny View Channel by default. Grant access to selected roles below.</small></span><input type="checkbox" checked={categoryPermissionOverwrites.some(row=>row.target_type==="everyone"&&row.deny_permissions.includes("view_channel"))} disabled={!canManageChannels} onChange={e=>void saveCategoryPermission(selectedCategory,"everyone",null,"view_channel",!e.target.checked)}/></label><div className="channel-role-access-list"><strong>Role access</strong>{customServerRoles.map(role=><label key={role.id} className="settings-preference-row"><span><strong style={{color:role.color}}>{role.name}</strong></span><input type="checkbox" checked={categoryPermissionOverwrites.some(row=>row.target_type==="role"&&row.target_id===role.id&&row.allow_permissions.includes("view_channel"))} disabled={!canManageChannels} onChange={e=>void saveCategoryPermission(selectedCategory,"role",role.id,"view_channel",e.target.checked)}/></label>)}</div><small className="settings-help">Synced channels inherit these rules. Unsynced channels keep their own permission overrides.</small></div><div className="modal-actions">{canManageChannels&&selectedCategory!=="Text Channels"&&channelCategories.some(item=>item.serverId===activeServer&&item.name===selectedCategory&&item.id)&&!channels.some(channel=>channel.serverId===activeServer&&(channel.category||"Text Channels")===selectedCategory)&&<button type="button" className="btn secondary discord-role-delete" onClick={()=>void askDeleteCategory()}><Icon name="delete" size={14}/> Delete category</button>}<button type="button" className="btn secondary" onClick={()=>setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction!==null||!canManageChannels}>{busyAction==="rename-category"?<>Saving <span className="button-spinner" aria-hidden="true"/></>:"Save changes"}</button></div></form></>}
      {modal === "channel" && <><span className="section-kicker">{currentServer?.name || "SERVER"}</span><h2>Create a channel</h2><p>Add a channel and choose its type and category.</p><form onSubmit={e => { e.preventDefault(); void withBusyAction("create-channel", () => createItem(e)); }}><label htmlFor="modalInput">Channel name</label><input id="modalInput" autoFocus maxLength={32} value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="build-plans" required/><label htmlFor="channelTypeInput">Channel type</label><select id="channelTypeInput" value={channelTypeInput} onChange={e=>setChannelTypeInput(e.target.value as "text"|"announcement"|"forum")}><option value="text">Text</option><option value="announcement">Announcement</option><option value="forum">Forum</option></select><label htmlFor="categoryInput">Category</label><select id="categoryInput" value={categoryInput} onChange={e=>setCategoryInput(e.target.value)}><option value="Text Channels">Text Channels</option>{channelCategories.filter(item=>item.serverId===activeServer&&item.name!=="Text Channels").map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busyAction !== null}>{busyAction === "create-channel" ? <>Creating <span className="button-spinner" aria-hidden="true" /></> : "Create channel"}</button></div></form></>}{modal === "settings" && (settingsLoading ? <SettingsSkeleton /> : <div className="discord-settings-layout"><nav className="discord-settings-nav" aria-label="User settings sections"><div className="discord-settings-nav-title">USER SETTINGS</div><button type="button" className={settingsSection === "account" ? "active" : ""} onClick={() => setSettingsSection("account")}><Icon name="user" size={16}/> My Account</button><button type="button" className={settingsSection === "accounts" ? "active" : ""} onClick={() => { setSettingsSection("accounts"); setAccountSwitchNotice(""); setSavedAccounts(rememberVoaxAccount(session, { username: name, avatarUrl })); }}><Icon name="users" size={16}/> Switch Accounts</button><button type="button" className={settingsSection === "blocked" ? "active" : ""} onClick={() => { setSettingsSection("blocked"); void loadBlockedPeople(); }}><Icon name="shield" size={16}/> Blocked Accounts</button><div className="discord-settings-nav-divider"/><div className="discord-settings-nav-title">APP SETTINGS</div><button type="button" className={settingsSection === "appearance" ? "active" : ""} onClick={() => setSettingsSection("appearance")}><Icon name="palette" size={16}/> Appearance</button><button type="button" className={settingsSection === "notifications" ? "active" : ""} onClick={() => setSettingsSection("notifications")}><Icon name="bell" size={16}/> Notifications</button><div className="discord-settings-nav-spacer"/><button type="button" className="discord-settings-signout" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) notify("Could not sign out: " + error.message); }}><Icon name="close" size={16}/> Log Out</button></nav><div className="discord-settings-content">{settingsSection === "account" ? <><div className="discord-settings-heading"><span className="section-kicker">USER SETTINGS</span><h2>My Account</h2><p>Manage your Voax profile and how other people see you.</p></div><form onSubmit={e => { e.preventDefault(); void withBusyAction("save-profile", () => saveProfile(e)); }}><div className="settings-profile-banner"><div className="avatar large self">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}</div><div className="member-entry-copy"><strong style={{color:getMemberRole(session.user.id).color}}>{name}</strong></div></div><label htmlFor="displayName">Display name</label><input id="displayName" maxLength={32} minLength={2} value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="profileBio">Bio</label><textarea id="profileBio" maxLength={190} rows={3} value={profileBio} onChange={e => setProfileBio(e.target.value)} placeholder="A little about you…"/><small className="settings-help">{profileBio.length}/190 characters</small><label htmlFor="status">Status</label><select id="status" value={status} onChange={e => setStatus(e.target.value as PresenceStatus)}><option>Online</option><option>Idle</option><option>Do not disturb</option><option>Offline</option></select><label htmlFor="avatarFile">Profile picture</label><input id="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarBusy} onChange={e => {void uploadAvatar(e.target.files?.[0]||null);e.currentTarget.value="";}}/><small className="settings-help">{avatarBusy ? "Uploading picture…" : "JPG, PNG, WebP or GIF · max 5 MB"}</small><div className="modal-actions"><button className="btn primary" disabled={busyAction !== null}>{busyAction === "save-profile" ? <>Saving <span className="button-spinner" aria-hidden="true" /></> : "Save changes"}</button></div></form></> : settingsSection === "accounts" ? <><div className="discord-settings-heading"><span className="section-kicker">USER SETTINGS</span><h2>Switch accounts</h2><p>Keep up to five Voax accounts on this browser and move between them without re-entering your login each time.</p></div>{accountSwitchNotice && <div className="account-switcher-notice" role="status">{accountSwitchNotice}</div>}<div className="account-switcher-panel"><div className="account-switcher-panel-heading"><div><h3>Your accounts</h3><p>{savedAccounts.length} of 5 accounts saved on this browser</p></div></div><div className="account-switcher-list">{savedAccounts.map(account => <article className={"account-switcher-row" + (account.userId === session.user.id ? " is-current" : "")} key={account.userId}><div className="account-switcher-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : initials(account.username)}</div><div className="account-switcher-meta"><strong>{account.username}</strong><small>{account.email || "Voax account"}</small></div>{account.userId === session.user.id ? <span className="account-switcher-current">Current</span> : <div className="account-switcher-actions"><button type="button" className="btn small primary" disabled={accountSwitchBusy !== null} onClick={async () => { setAccountSwitchBusy(account.userId); setAccountSwitchNotice(""); const { error } = await supabase.auth.setSession({ access_token: account.accessToken, refresh_token: account.refreshToken }); if (error) { setAccountSwitchNotice("Couldn't switch to that account. It may need to sign in again."); setAccountSwitchBusy(null); return; } window.location.reload(); }}>{accountSwitchBusy === account.userId ? "Switching…" : "Switch"}</button><button type="button" className="account-switcher-remove" aria-label={"Remove " + account.username} title="Remove saved account" disabled={accountSwitchBusy !== null} onClick={() => { const updated = readSavedVoaxAccounts().filter(item => item.userId !== account.userId); localStorage.setItem(SAVED_VOAX_ACCOUNTS_KEY, JSON.stringify(updated)); setSavedAccounts(updated); }}>×</button></div>}</article>)}</div>{!savedAccounts.length && <p className="account-switcher-empty">Your current account will appear here automatically.</p>}<div className="account-switcher-add"><div className="account-switcher-add-copy"><strong>Add another account</strong><p>Sign in with another Voax account. Your current account will stay saved here.</p></div><div className="account-switcher-add-fields"><input type="email" autoComplete="username" placeholder="Email address" aria-label="Email address for the account to add" value={newAccountEmail} onChange={e => setNewAccountEmail(e.target.value)} /><input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password for the account to add" value={newAccountPassword} onChange={e => setNewAccountPassword(e.target.value)} /></div><button type="button" className="btn secondary" disabled={accountSwitchBusy !== null || !newAccountEmail.trim() || !newAccountPassword} onClick={async () => { setAccountSwitchBusy("add"); setAccountSwitchNotice(""); setSavedAccounts(rememberVoaxAccount(session, { username: name, avatarUrl })); const { error } = await supabase.auth.signInWithPassword({ email: newAccountEmail.trim(), password: newAccountPassword }); setNewAccountPassword(""); if (error) { setAccountSwitchNotice("Couldn't add that account: " + error.message); setAccountSwitchBusy(null); return; } window.location.reload(); }}><Icon name="plus" size={15}/> {accountSwitchBusy === "add" ? "Adding…" : "Add account"}</button></div></div><p className="account-switcher-security-note">Saved account sessions are stored in this browser profile. Only save accounts on a device you trust, and remove them before sharing this browser profile.</p></> : settingsSection === "blocked" ? <><div className="discord-settings-heading"><span className="section-kicker">USER SETTINGS</span><h2>Blocked accounts</h2><p>Accounts you block cannot send you direct messages or friend requests. Their messages are hidden from shared spaces.</p></div>{blockedPeopleLoading?<p className="admin-muted">Loading blocked accounts…</p>:blockedPeople.length?blockedPeople.map(person=><div className="settings-preference-row" key={person.id}><span><strong>{person.name}</strong><small>Blocked account</small></span><button type="button" className="btn secondary" onClick={()=>void toggleAccountBlock(person)}>Unblock</button></div>):<div className="empty-state"><h3>No blocked accounts</h3><p>When you block someone, they will appear here.</p></div>}</> : settingsSection === "notifications" ? <><div className="discord-settings-heading"><span className="section-kicker">USER SETTINGS</span><h2>Notifications</h2><p>Choose which Voax activity can interrupt you. More-specific server and channel settings can override this global mode.</p></div><div className="ping-setting-group"><h3>Global notification mode</h3><p>Global None can be overridden by a more-specific server or channel preference.</p><select value={globalNotificationMode} disabled={notificationPreferencesSaving} onChange={e=>void saveUserNotificationPreferences({global_mode:e.target.value as "all"|"mentions"|"none"})}><option value="all">All notifications</option><option value="mentions">Mentions only</option><option value="none">None</option></select></div><div className="ping-setting-group"><h3>Server and channel overrides</h3><p>These more-specific settings can override your global mode. Choose Inherit to use the next applicable level.</p>{currentServer&&<label>Server: {currentServer.name}<select value={serverNotificationMode} disabled={notificationPreferencesSaving} onChange={e=>void saveNotificationOverride("server",currentServer.id,e.target.value as any)}><option value="inherit">Inherit global</option><option value="all">All notifications</option><option value="mentions">Mentions only</option><option value="none">None</option><option value="muted">Muted</option></select></label>}{view==="channel"&&activeChannel&&<label>Channel: #{activeChannel.name}<select value={channelNotificationMode} disabled={notificationPreferencesSaving} onChange={e=>void saveNotificationOverride("channel",activeChannel.id,e.target.value as any)}><option value="inherit">Inherit server</option><option value="all">All notifications</option><option value="mentions">Mentions only</option><option value="none">None</option><option value="muted">Muted</option></select></label>}</div><div className="ping-setting-group"><h3>Mention alerts</h3><p>These preferences control alert delivery, not whether a mention appears in chat or your mentions inbox.</p>{([{key:"direct_mentions_enabled",label:"Direct member mentions",value:directMentionsEnabled},{key:"everyone_mentions_enabled",label:"@everyone mentions",value:everyoneMentionsEnabled},{key:"here_mentions_enabled",label:"@here mentions",value:hereMentionsEnabled}] as const).map(item=><label className="settings-preference-row" key={item.key}><span><strong>{item.label}</strong></span><input type="checkbox" checked={item.value} disabled={notificationPreferencesSaving} onChange={e=>void saveUserNotificationPreferences({[item.key]:e.target.checked})}/></label>)}</div><div className="ping-setting-group"><h3>Presence and quiet mode</h3><p>Do Not Disturb suppresses interruptive mention alerts. Online and Idle members can be targeted by @here; Offline members cannot.</p></div></> : <><div className="discord-settings-heading"><span className="section-kicker">APP SETTINGS</span><h2>Appearance</h2><p>Adjust how conversations are displayed in Voax.</p></div><div className="settings-preference-row"><span><strong>Color theme</strong><small>Choose the look that feels right for you.</small></span><div className="theme-choice-group"><button type="button" className={"btn " + (theme === "dark" ? "primary" : "secondary")} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button><button type="button" className={"btn " + (theme === "light" ? "primary" : "secondary")} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button></div></div><div className="settings-preference-row"><span><strong>Clock format</strong><small>Choose how message timestamps are displayed.</small></span><div className="theme-choice-group clock-format-choice"><button type="button" className={"btn " + (clockFormat === "12h" ? "primary" : "secondary")} aria-pressed={clockFormat === "12h"} onClick={() => setClockFormat("12h")}>12-hour <small>AM / PM</small></button><button type="button" className={"btn " + (clockFormat === "24h" ? "primary" : "secondary")} aria-pressed={clockFormat === "24h"} onClick={() => setClockFormat("24h")}>24-hour <small>13:00</small></button></div></div><label className="settings-preference-row"><span><strong>Compact message spacing</strong><small>Reduce the vertical space between messages.</small></span><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/></label><label className="settings-preference-row"><span><strong>Show send button</strong><small>Display a send button beside the message box. Off by default on desktop.</small></span><input type="checkbox" checked={sendButtonEnabled} onChange={e => setSendButtonEnabled(e.target.checked)}/></label><div className="settings-preference-row"><span><strong>Reset local preferences</strong><small>Restore local display preferences to their defaults.</small></span><button type="button" className="btn secondary" onClick={() => { localStorage.removeItem(KEY); localStorage.removeItem("voax.theme"); localStorage.removeItem("voax.clockFormat"); localStorage.removeItem("voax.sendButtonEnabled"); localStorage.removeItem("minedm.v2"); localStorage.removeItem("minedm.theme"); window.location.reload(); }}>Reset</button></div></>}</div></div>)}
      {modal === "inbox" && <><div className="inbox-heading"><div><span className="section-kicker">NOTIFICATIONS &amp; MENTIONS</span><h2>Inbox</h2><p>Mentions, pings, and account activity — all in one place.</p></div><button type="button" className="btn small secondary" onClick={()=>void markAllNotificationsRead()} disabled={inboxUnreadTotal===0}><Icon name="inbox" size={15}/> Mark all read</button></div><div className="inbox-filter-row" role="tablist" aria-label="Inbox filters">{([{id:"all",label:"All activity"},{id:"mentions",label:"Mentions"},{id:"unread",label:"Unread"}] as const).map(filter=><button type="button" role="tab" aria-selected={notificationFilter===filter.id} className={"btn small "+(notificationFilter===filter.id?"primary":"secondary")} key={filter.id} onClick={()=>setNotificationFilter(filter.id)}>{filter.label}{filter.id==="mentions"?" ("+inboxNotifications.filter(n=>n.type==="mention").length+")":filter.id==="unread"?" ("+inboxUnreadTotal+")":""}</button>)}</div><div className="inbox-notification-list">{inboxNotifications.filter(n=>notificationFilter==="mentions"?n.type==="mention":notificationFilter==="unread"?!n.read_at:true).length?inboxNotifications.filter(n=>notificationFilter==="mentions"?n.type==="mention":notificationFilter==="unread"?!n.read_at:true).map(n=><article key={n.id} className={"inbox-notification "+(!n.read_at?"is-unread":"")}><div className={"inbox-notification-icon inbox-icon-"+(n.type==="mention"?"mention":n.type==="friend_request"||n.type==="friend_accepted"?"friend":"message")}><Icon name={n.type==="mention"?"at":n.type==="friend_request"?"user":n.type==="friend_accepted"?"user":"message"} size={18}/></div><div className="inbox-notification-content"><div className="inbox-notification-title-row"><strong>{n.title}</strong>{!n.read_at&&<span className="inbox-unread-dot" aria-label="Unread"/>}</div>{n.body&&<p>{n.body}</p>}<small>{formatDateTime(new Date(n.created_at), clockFormat)}</small><div className="inbox-notification-actions">{n.type==="mention"&&n.entity_id&&<button className="btn small primary" onClick={()=>void openMentionNotification(n)}>Jump to message</button>}{n.type==="announcement"&&n.entity_id&&<button className="btn small primary" onClick={()=>void openAnnouncementNotification(n)}>Open announcement channel</button>}{n.type==="friend_request"&&n.actor_id&&friendRequests.some(r=>r.requester_id===n.actor_id)&&<button className="btn small primary" onClick={()=>void respondToFriendRequest(friendRequests.find(r=>r.requester_id===n.actor_id)!,true)}>Accept request</button>}{!n.read_at&&<button className="btn small secondary" onClick={()=>void markNotificationRead(n.id)}>Mark read</button>}</div></div></article>):<div className="inbox-empty-state"><div className="inbox-empty-icon"><Icon name={notificationFilter==="mentions"?"at":notificationFilter==="unread"?"checkCheck":"bell"} size={24}/></div><strong>{notificationFilter==="mentions"?"No mentions yet":notificationFilter==="unread"?"You're all caught up":"Your inbox is quiet"}</strong><p>{notificationFilter==="mentions"?"When someone pings you, their mention will show up here.":notificationFilter==="unread"?"New activity will appear here when you need it.":"You'll find mentions, friend activity, and messages here."}</p></div>}</div><div className="modal-actions"><button className="btn primary" onClick={() => setModal(null)}>Done</button></div></>}    </section></div>}
    {selectedProfile && <div className="profile-popout-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedProfile(null);}}><section className="profile-popout" role="dialog" aria-modal="true" aria-label={`${selectedProfile.name} profile`}><div className="profile-popout-banner"><button className="profile-close" onClick={()=>setSelectedProfile(null)} aria-label="Close profile"><Icon name="close" size={17}/></button></div><div className="profile-popout-identity"><div className={`profile-popout-avatar avatar ${selectedProfile.color}`}>{selectedProfile.avatarUrl?<img src={selectedProfile.avatarUrl} alt=""/>:initials(selectedProfile.name)}<i className={selectedProfile.online?"online":""}/></div><div className="profile-popout-quick-actions">{selectedProfile.id!==session.user.id&&<><button className="profile-icon-action" title="Message" aria-label="Message" onClick={()=>{const person=selectedProfile;setSelectedProfile(null);void openDM(person);}}><Icon name="message" size={17}/></button><button className="profile-icon-action" title="More actions" aria-label="More actions" onClick={e=>showContextMenu(e,{kind:"person",person:selectedProfile})}><Icon name="moreHorizontal" size={17}/></button></>}</div></div><div className="profile-popout-body"><h2>{selectedProfile.name}</h2><div className="profile-popout-handle">{selectedProfile.name.replace(/\s+/g,"").toLowerCase()} <span>·</span> Voax</div><div className="profile-popout-status"><i className={selectedProfile.online?"online":""}/>{selectedProfile.status|| (selectedProfile.online?"Online":"Offline")}</div>{view==="channel"&&serverMemberIds.includes(selectedProfile.id)&&<section className="profile-server-roles"><div className="profile-server-roles-heading"><h3>ROLES</h3>{isOwnerOrAdmin&&(selectedProfile.id!==session.user.id||selectedProfile.id===currentServer?.createdBy)&& (selectedProfile.id!==currentServer?.createdBy||selectedProfile.id===session.user.id)&&<button type="button" className="profile-add-role" title="Assign a server role" aria-label="Assign a server role" aria-expanded={profileRolePickerOpen} onClick={()=>setProfileRolePickerOpen(open=>!open)}><Icon name="plus" size={15}/></button>}</div><div className="profile-server-role-list">{(()=>{const builtin=serverMemberRoles[activeServer]?.[selectedProfile.id]||"member";const isOwner=selectedProfile.id===currentServer?.createdBy;const assigned=(customRoleAssignments[activeServer]?.[selectedProfile.id]||[]).map(roleId=>customServerRoles.find(role=>role.id===roleId)).filter((role):role is ServerRole=>Boolean(role));return <>{(isOwner?[{name:"Owner",color:"#e9bd68"}]:builtin==="admin"?[{name:"Admin",color:"#ed4245"}]:[{name:"Member",color:"#8b95a7"}]).map(role=><span key={role.name} className="profile-server-role" style={{"--role-color":role.color} as React.CSSProperties}><i/>{role.name}</span>)}{assigned.map(role=><span key={role.id} className="profile-server-role" style={{"--role-color":role.color} as React.CSSProperties}><i/>{role.name}</span>)}</>;})()}</div>{profileRolePickerOpen&&isOwnerOrAdmin&&(selectedProfile.id!==session.user.id||selectedProfile.id===currentServer?.createdBy)&&(selectedProfile.id!==currentServer?.createdBy||selectedProfile.id===session.user.id)&&<div className="profile-role-picker"><div className="profile-role-picker-title">ASSIGN A ROLE</div>{customServerRoles.length?customServerRoles.map(role=><button type="button" key={role.id} className="profile-role-picker-option" onClick={()=>void assignCustomServerRole(selectedProfile.id,role.id)}><i style={{background:role.color}}/><span>{role.name}</span>{(customRoleAssignments[activeServer]?.[selectedProfile.id]||[]).includes(role.id)&&<Icon name="check" size={14}/>}</button>):<p>No custom roles yet.</p>}<button type="button" className="profile-role-picker-manage" onClick={()=>{setSelectedProfile(null);setProfileRolePickerOpen(false);setModal("manageRoles");}}>Manage roles</button></div>}</section>}<div className="profile-popout-divider"/><section className="profile-about"><h3>ABOUT ME</h3><p>{selectedProfile.bio?.trim()|| (selectedProfile.id===session.user.id?"You haven’t added a bio yet.":"This member hasn’t added a bio yet.")}</p></section><section className="profile-mutual"><h3>MUTUAL SERVERS <span className="profile-mutual-count">{servers.filter(server=>(serverMembersByServer[server.id]||[]).includes(selectedProfile.id)).length}</span></h3><div className="profile-mutual-list" aria-label="Mutual servers">{servers.filter(server=>(serverMembersByServer[server.id]||[]).includes(selectedProfile.id)).map(server=><div className="profile-mutual-server" key={server.id} title={server.name}><div className="profile-mutual-server-icon">{server.iconUrl?<img src={server.iconUrl} alt=""/>:<span aria-hidden="true">{initials(server.name)}</span>}</div></div>)}{!servers.some(server=>(serverMembersByServer[server.id]||[]).includes(selectedProfile.id))&&<p className="profile-mutual-empty">No mutual servers yet.</p>}</div></section><div className="profile-popout-actions">{selectedProfile.id!==session.user.id&&<>{selectedProfile.isFriend?<button className="btn secondary" onClick={()=>void removeFriend(selectedProfile)}>Remove Friend</button>:<button className="btn secondary" onClick={()=>{setModalInput(selectedProfile.name);setModal("friend");setSelectedProfile(null);}}>Add Friend</button>}<button className="btn primary" onClick={()=>{const person=selectedProfile;setSelectedProfile(null);void openDM(person);}}>Message</button></>}</div></div></section></div>}
    {contextMenu && <div className="context-menu-dismiss" onMouseDown={e=>{if(e.target===e.currentTarget)setContextMenu(null);}} onContextMenu={e=>{e.preventDefault();setContextMenu(null);}}><div className="context-menu" role="menu" aria-label="Context actions" style={{left:Math.max(8,Math.min(contextMenu.x,window.innerWidth-228)),top:Math.max(8,Math.min(contextMenu.y,window.innerHeight-430))}} onMouseDown={e=>e.stopPropagation()}>{contextMenu.kind==="person"&&<><div className="context-menu-label">{contextMenu.person.name}</div><button role="menuitem" onClick={()=>openProfile(contextMenu.person)}><Icon name="user" size={15}/> View Profile</button><button role="menuitem" onClick={()=>{const person=contextMenu.person;setContextMenu(null);void openDM(person);}}><Icon name="message" size={15}/> Message</button><button role="menuitem" onClick={()=>beginReport({target_type:"account",target_user_id:contextMenu.person.id,snapshot:{username:contextMenu.person.name}})}><Icon name="flag" size={15}/> Report Account</button><button role="menuitem" className={blockedUserIds.has(contextMenu.person.id)?"":"danger"} onClick={()=>void toggleAccountBlock(contextMenu.person)}><Icon name="shield" size={15}/> {blockedUserIds.has(contextMenu.person.id)?"Unblock Account":"Block Account"}</button>{contextMenu.person.isFriend&&contextMenu.person.id!==session.user.id&&<button role="menuitem" className="danger" onClick={()=>{const person=contextMenu.person;setContextMenu(null);void removeFriend(person);}}><Icon name="user" size={15}/> Remove Friend</button>}{!contextMenu.person.isFriend&&contextMenu.person.id!==session.user.id&&<button role="menuitem" onClick={()=>{setModalInput(contextMenu.person.name);setModal("friend");setContextMenu(null);}}><Icon name="user" size={15}/> Add Friend</button>}<button role="menuitem" onClick={()=>void toggleNotificationBlock(contextMenu.person)}><Icon name="bellOff" size={15}/> {blockedNotificationActors.includes(contextMenu.person.id)?"Enable alerts":"Mute alerts from this member"}</button><button role="menuitem" onClick={()=>void copyContextText(contextMenu.person.name,"Username")}><Icon name="copy" size={15}/> Copy Username</button>{contextMenu.person.hasConversation&&<><div className="context-menu-divider"/><button role="menuitem" className="danger" onClick={()=>void hideDMForPerson(contextMenu.person)}><Icon name="close" size={15}/> Close DM</button></>}</>}{contextMenu.kind==="server"&&<><div className="context-menu-label">{contextMenu.server.name}</div><button role="menuitem" onClick={()=>{switchToServer(contextMenu.server);setContextMenu(null);}}><Icon name="message" size={15}/> Open Server</button><button role="menuitem" onClick={()=>beginReport({target_type:"server",target_server_id:contextMenu.server.id,snapshot:{server_name:contextMenu.server.name,source:"server_menu"}})}><Icon name="flag" size={15}/> Report Server</button>{(contextMenu.server.role==="owner"||contextMenu.server.role==="admin")&&<><button role="menuitem" onClick={()=>{setActiveServer(contextMenu.server.id);setModalInput(contextMenu.server.name);setServerShortDescription(contextMenu.server.description||"");setServerBannerUrl(contextMenu.server.bannerUrl||null);setServerSettingsSection("overview");setModal("manageServer");setContextMenu(null);}}><Icon name="settings" size={15}/> Server Settings</button><button role="menuitem" onClick={()=>{setActiveServer(contextMenu.server.id);setModalInput("");setCategoryInput("Text Channels");setCategoryCreationMode(false);setModal("channel");setContextMenu(null);}}><Icon name="plus" size={15}/> Create Channel</button></>}{contextMenu.server.inviteCode&&<button role="menuitem" onClick={()=>void copyContextText(contextMenu.server.inviteCode!,"Invite code")}><Icon name="copy" size={15}/> Copy Invite Code</button>}</>}{contextMenu.kind==="channel"&&<><div className="context-menu-label">#{contextMenu.channel.name}</div><button role="menuitem" onClick={()=>{switchToChannel(contextMenu.channel);setContextMenu(null);}}><Icon name="message" size={15}/> Open Channel</button><button role="menuitem" onClick={()=>void copyContextText("#"+contextMenu.channel.name,"Channel name")}><Icon name="copy" size={15}/> Copy Channel Name</button><button role="menuitem" onClick={()=>{void markChannelRead(contextMenu.channel.id);setContextMenu(null);}}><Icon name="check" size={15}/> Mark As Read</button>{canManageServer&&<button role="menuitem" onClick={()=>{setActive(contextMenu.channel.id);setModalInput(contextMenu.channel.name);setCategoryInput(contextMenu.channel.category||"Text Channels");setChannelTypeInput(contextMenu.channel.channelType||"text");setModal("manageChannel");void loadChannelPermissionOverwrites(contextMenu.channel.id);setContextMenu(null);}}><Icon name="settings" size={15}/> Edit Channel</button>}</>}{contextMenu.kind==="channels"&&<><div className="context-menu-label">{currentServer?.name||"CHANNELS"}</div>{canManageServer&&<><button role="menuitem" onClick={()=>{setModalInput("");setCategoryInput("New Category");setCategoryCreationMode(true);setModal("channel");setContextMenu(null);}}><Icon name="folderPlus" size={15}/> Create Category</button><button role="menuitem" onClick={()=>{setModalInput("");setCategoryInput("Text Channels");setCategoryCreationMode(false);setModal("channel");setContextMenu(null);}}><Icon name="plus" size={15}/> Create Channel</button></>}</>}{contextMenu.kind==="message"&&<><div className="context-menu-label">MESSAGE ACTIONS</div><div className="context-quick-reactions">{["👍","❤️","😂","🎉","👀"].map(emoji=><button key={emoji} title={"React "+emoji} onClick={()=>{void toggleReaction(contextMenu.message.id,emoji);setContextMenu(null);}}><Twemoji emoji={emoji}/></button>)}</div><button role="menuitem" onClick={()=>{startReply(contextMenu.message);setContextMenu(null);}}><Icon name="reply" size={15}/> Reply</button>{contextMenu.message.own&&<button role="menuitem" onClick={()=>{const message=contextMenu.message;setContextMenu(null);startEditMessage(message);}}><Icon name="edit" size={15}/> Edit Message</button>}<button role="menuitem" onClick={()=>void copyContextText(contextMenu.message.text,"Message")}><Icon name="copy" size={15}/> Copy Message Text</button>{!contextMenu.message.own&&<button role="menuitem" onClick={()=>beginReport({target_type:"message",target_message_id:contextMenu.message.id,snapshot:{body:contextMenu.message.text,author_name:contextMenu.message.author,author_id:contextPersonForMessage(contextMenu.message)?.id||null,channel_id:view==="channel"?active:null,channel_name:activeChannel?.name||null,server_id:view==="channel"?activeServer:null,conversation_id:view==="dm"&&activePerson?conversationIds[activePerson.id]||null:null,created_at:contextMenu.message.timestamp||contextMenu.message.time,attachments:(contextMenu.message.attachments||[]).map(attachment=>({name:attachment.name,mime_type:attachment.mimeType,url:attachment.url||null}))}})}><Icon name="flag" size={15}/> Report Message</button>}{contextPersonForMessage(contextMenu.message)&&<button role="menuitem" onClick={()=>openProfile(contextPersonForMessage(contextMenu.message)!)}><Icon name="user" size={15}/> View Author Profile</button>}{(contextMenu.message.own||canManageMessages&&view==="channel")&&<><div className="context-menu-divider"/><button role="menuitem" className="danger" onClick={()=>{const message=contextMenu.message;setContextMenu(null);void deleteMessage(message);}}><Icon name="delete" size={15}/> Delete Message</button></>}</>}</div></div>}
    {reportTarget&&<div className="discovery-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!reportBusy)setReportTarget(null);}}><form className="discovery-modal" onSubmit={submitVoaxReport}><button type="button" className="discovery-modal-close" onClick={()=>setReportTarget(null)} disabled={reportBusy} aria-label="Close report">×</button><span className="discovery-eyebrow">VOAX SAFETY</span><h2>Report {reportTarget.target_type==="account"?"account":reportTarget.target_type==="message"?"message":"server"}</h2><p>Your report is private and will be reviewed by the Voax moderation team.</p><label>Reason<select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option>Harassment or bullying</option><option>Spam or advertising</option><option>Impersonation</option><option>Threats or abusive behavior</option><option>Scams or phishing</option><option>Inappropriate content</option><option>Other</option></select></label><label>Additional details (optional)<textarea value={reportDetails} onChange={e=>setReportDetails(e.target.value)} maxLength={1000} rows={4} placeholder="Add any context that could help our moderators…"/></label><div className="modal-actions"><button type="button" className="discovery-secondary" onClick={()=>setReportTarget(null)} disabled={reportBusy}>Cancel</button><button className="discovery-primary" disabled={reportBusy}>{reportBusy?"Submitting…":"Submit report"}</button></div></form></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}


function DocsPage() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("getting-started");
  const sections = [
    { id: "getting-started", label: "Getting started", icon: "sparkles" },
    { id: "friends", label: "Friends & DMs", icon: "users" },
    { id: "servers", label: "Servers & channels", icon: "message" },
    { id: "messages", label: "Messaging", icon: "send" },
    { id: "profiles", label: "Profile & presence", icon: "user" },
    { id: "settings", label: "Settings & appearance", icon: "settings" },
    { id: "moderation", label: "Server management", icon: "shield" },
    { id: "troubleshooting", label: "Troubleshooting", icon: "helpCircle" },
  ];
  const entries = [
    { id: "getting-started", title: "Welcome to Voax", intro: "Voax is a place to chat with friends and organize communities in servers. Start by creating an account or signing in, then make your profile your own.", steps: ["Open Voax and choose the sign-up or sign-in option.", "Complete the requested account details and verify your email if prompted.", "Once signed in, use the sidebar to move between your conversations, friends, servers, and channels."] },
    { id: "friends", title: "Add friends and start private chats", intro: "Friends make it easier to find people and continue conversations outside a server.", steps: ["Open the Friends area and choose the add-friend action.", "Enter the person's exact Voax username, then send the request.", "The other person can accept or reject the request from their incoming requests.", "Open a friend's profile or use the Message action to start a direct conversation."] },
    { id: "servers", title: "Servers and channels", intro: "Servers group a community together. Channels keep different topics organized so conversations are easier to follow.", steps: ["Create a server for your community, or use Join Server to join with an invite code or link.", "Select a server from the server rail to view its channels.", "Choose a channel to read and send messages in that space.", "If you have permission, open server settings to manage the server, channels, and member roles.", "Share the server's invite code with people you want to invite. Treat invite links as shareable access links."] },
    { id: "messages", title: "Send messages and share links", intro: "Use channel chat for group discussions and direct messages for one-to-one conversations.", steps: ["Select a channel or direct message, type into the message composer, and send.", "Use message actions to reply, react with an emoji, copy text, or delete a message when allowed.", "Paste a web link to show a link preview when available.", "Use the attachment button when available to attach a file. Only share files and links you are comfortable showing to that conversation."] },
    { id: "profiles", title: "Profiles and online status", intro: "Your profile helps other members recognize you and understand when you are available.", steps: ["Open your profile or account settings to update supported profile details and your avatar.", "Choose a presence status such as Online, Idle, Do not disturb, or Offline when the status control is available.", "Select another member to view their profile and use the available actions, such as Message or Add Friend."] },
    { id: "settings", title: "Settings and appearance", intro: "Tune the app to your preferences from the user settings panel.", steps: ["Open user settings from your profile or account menu.", "Use Appearance to switch between dark and light themes.", "Review account and profile options before leaving the settings panel.", "On a smaller screen, use the navigation controls to open the sidebar and move between spaces."] },
    { id: "moderation", title: "Server management and roles", intro: "Server owners and authorized moderators have additional tools to keep a community organized.", steps: ["Open the server settings from the server menu.", "Create or organize channels when you have the required permission.", "Manage member roles and their permissions carefully; grant only the access people need.", "Use member-management actions and message moderation options only when you have permission.", "If a control is missing or disabled, your current role may not have permission to use it."] },
    { id: "troubleshooting", title: "Troubleshooting", intro: "Most common issues can be resolved by checking the selected space, account, and connection.", steps: ["If you cannot find someone, check the spelling of their exact Voax username.", "If a friend request is already pending or the two of you are already friends, check your existing requests and friend list first.", "If messages or channels do not load, check your internet connection and reload Voax.", "If a server action is unavailable, ask the server owner to check your role and permissions.", "Never share your password or verification codes. If sign-in still fails, use the account recovery option shown on the sign-in screen if available."] },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = entries.filter(entry => !normalizedQuery || (entry.title + " " + entry.intro + " " + entry.steps.join(" ")).toLowerCase().includes(normalizedQuery));
  return <main className="docs-page">
    <header className="docs-topbar"><a className="docs-brand" href="/"><Logo size={34}/> <span>Voax</span><span className="docs-brand-divider">/</span><span className="docs-brand-label">Help center</span></a><div className="docs-top-actions"><a href="/">Home</a><a className="btn primary" href="/app">Open Voax <Icon name="arrowUpRight" size={15}/></a></div></header>
    <section className="docs-hero"><div className="docs-eyebrow"><span className="pulse"/> VOAX HELP CENTER</div><h1>Make yourself<br/><span>at home.</span></h1><p>Everything you need to start chatting, find your people, and build a community on Voax.</p><label className="docs-search"><Icon name="search" size={19}/><input aria-label="Search the user guide" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the guide, e.g. add a friend"/></label><div className="docs-hero-meta"><span><Icon name="bookOpen" size={14}/> User guide</span><span><Icon name="clock" size={14}/> Quick, practical answers</span></div></section>
    <div className="docs-layout"><aside className="docs-sidebar"><div className="docs-sidebar-label">ON THIS PAGE</div>{sections.map(section => <a key={section.id} className={activeSection===section.id?"active":""} href={"#"+section.id} onClick={()=>setActiveSection(section.id)}><Icon name={section.icon} size={16}/>{section.label}</a>)}<div className="docs-sidebar-tip"><Icon name="lightbulb" size={18}/><strong>Quick tip</strong><p>Use the exact Voax username when sending a friend request.</p></div></aside>
      <div className="docs-content">{normalizedQuery && <div className="docs-results-count">{filteredEntries.length} {filteredEntries.length===1?"topic":"topics"} matching “{query}”</div>}{filteredEntries.length===0 ? <div className="docs-no-results"><Icon name="search" size={26}/><h2>No matching topics</h2><p>Try a different keyword, like “server”, “theme”, or “friend”.</p><button className="btn secondary" onClick={()=>setQuery("")}>Clear search</button></div> : filteredEntries.map((entry,index) => <section className="docs-article" id={entry.id} key={entry.id}><div className="docs-article-index">{String(index+1).padStart(2,"0")}</div><div className="docs-article-main"><div className="docs-section-kicker">VOAX GUIDE / {String(index+1).padStart(2,"0")}</div><h2>{entry.title}</h2><p className="docs-intro">{entry.intro}</p><ol>{entry.steps.map((step,i)=><li key={step}><span className="docs-step-number">{i+1}</span><span>{step}</span></li>)}</ol></div></section>)}
      <section className="docs-help-card"><div className="docs-help-icon"><Icon name="message" size={22}/></div><div><h3>Still need a hand?</h3><p>Try the troubleshooting guide above or ask a server owner for help with community permissions.</p></div><a href="/app" className="btn secondary">Back to Voax <Icon name="arrowUpRight" size={14}/></a></section>
      <footer className="docs-footer"><span>© 2026 Voax</span><span>Built for your people, your space.</span><a href="/">Back to home ↑</a></footer></div></div>
  </main>;
}

function Root() {
  useEffect(() => {
    const onPop = () => window.location.pathname === "/" ? window.location.reload() : window.location.reload();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { if (data.session) rememberVoaxAccount(data.session); setSession(data.session); setAuthReady(true); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) rememberVoaxAccount(nextSession);
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  if (window.location.pathname === "/docs" || window.location.pathname === "/docs/") return <DocsPage />;
  if (window.location.pathname === "/" || window.location.pathname === "") return <Landing openApp={() => window.location.assign("/app")} />;
  if (!authReady) return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#090b10",color:"#5eead4",fontFamily:"system-ui"}}>Connecting to Voax…</main>;
  if (!session) return <AuthScreen />;
  if (window.location.pathname === "/explore" || window.location.pathname.startsWith("/explore/")) return <App session={session}/>;
  if (window.location.pathname === "/admin" || window.location.pathname === "/admin/") return <AdminPage session={session} mode="admin"/>;
  if (window.location.pathname === "/mod" || window.location.pathname === "/mod/") return <AdminPage session={session} mode="moderator"/>;
  return <App session={session}/>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
