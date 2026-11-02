import React from "react";

export type IconName =
  | "reply" | "forward" | "edit" | "delete" | "copy" | "pin" | "bookmark" | "share"
  | "heart" | "star" | "thumbs-up" | "emoji" | "gift" | "boost"
  | "attach" | "image" | "gif" | "sticker" | "camera" | "mic" | "headphones" | "volume-off"
  | "home" | "search" | "explore" | "menu" | "grid" | "chevron" | "plus" | "close"
  | "shield" | "flag" | "lock" | "bell" | "bell-off" | "block"
  | "settings" | "refresh" | "download" | "upload" | "link" | "filter"
  | "calendar" | "clock" | "location" | "globe" | "palette" | "user" | "users" | "hash" | "ticket" | "megaphone" | "messages-square" | "chevron-up" | "chevron-down"
  | "pickaxe" | "tree" | "flask" | "inbox" | "send" | "paperclip" | "sparkles" | "message"
  | "zap" | "micOff" | "headphonesOff" | "voice" | "arrowUpRight" | "arrowRight" | "chevronDown" | "at";

const paths: Record<string, React.ReactNode> = {
  reply: <><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v2"/></>,
  forward: <><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0-7 7v2"/></>,
  edit: <><path d="m15 5 4 4"/><path d="M4 20l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10z"/></>,
  delete: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  pin: <><path d="m16 3 5 5-4 1-4 4-1 5-3-3-5 5"/><path d="m8 8 8 8"/></>,
  bookmark: <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z"/>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>,
  "thumbs-up": <><path d="M7 10v11H3V10zM7 20h10a2 2 0 0 0 2-1.6l1.5-7A2 2 0 0 0 18.5 9H13l.8-4a2 2 0 0 0-3.5-1.5L7 10"/></>,
  emoji: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.3 3 4 3 4-3 4-3M9 9h.01M15 9h.01"/></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M2 6h20v3H2zM12 6v15M12 6H8a2 2 0 1 1 2-2zM12 6h4a2 2 0 1 0-2-2z"/></>,
  boost: <><path d="M12 22V8M6 14l6-6 6 6"/><path d="M5 3h14"/></>,
  attach: <path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  gif: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10a2 2 0 1 0 0 4h2v-2H8M14 10v4M14 10h3M14 12h2"/></>,
  sticker: <><path d="M4 3h16v11l-6 7H4z"/><path d="M14 21v-7h6M8 9h.01M12 9h.01M8 13h4"/></>,
  camera: <><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4"/></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/></>,
  headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="13" width="4" height="7" rx="2"/><rect x="17" y="13" width="4" height="7" rx="2"/></>,
  "volume-off": <><path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6"/></>,
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  explore: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  "chevron-up": <path d="m6 15 6-6 6 6"/>,
  "chevron-down": <path d="m6 9 6 6 6-6"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m18 6-12 12M6 6l12 12"/>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
  flag: <><path d="M5 21V4"/><path d="M5 4c5-4 9 4 14 0v11c-5 4-9-4-14 0"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  "bell-off": <><path d="m3 3 18 18M10 21h4M6 8c0-1 .2-2 .7-2.8M18 13c.3 2.4 2 2.8 2 4H8M12 2a6 6 0 0 1 6 6v2"/></>,
  block: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
  settings: <><path d="M9.7 2.8h4.6l.6 2.1a7.7 7.7 0 0 1 1.7 1l2.1-.7 2.3 4-1.6 1.5a7.2 7.2 0 0 1 0 2l1.6 1.5-2.3 4-2.1-.7a7.7 7.7 0 0 1-1.7 1l-.6 2.1H9.7l-.6-2.1a7.7 7.7 0 0 1-1.7-1l-2.1.7-2.3-4 1.6-1.5a7.2 7.2 0 0 1 0-2L3 9.2l2.3-4 2.1.7a7.7 7.7 0 0 1 1.7-1z" /><circle cx="12" cy="11.7" r="3.1"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 21h16"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3A5 5 0 0 0 13.5 3L12 4.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3A5 5 0 0 0 10.5 21L12 19.5"/></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.3-3.5c-1.2-1-.4-3.5 1.4-3.5H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3z"/><circle cx="7.5" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8.5" r="1"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/></>,
  hash: <path d="M4 9h16M3 15h16M10 3 8 21M16 3l-2 18"/>,
  ticket: <><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5z"/><path d="M13 6v2M13 11v2M13 16v2"/></>,
  megaphone: <><path d="m3 11 18-5v12L3 13z"/><path d="M11 15 13 21H8l-2-7M21 9l-2 1M21 16l-2-1"/></>,
  "messages-square": <><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5a7.5 7.5 0 1 1 18-4.5z"/><path d="M8 9h8M8 13h5"/></>,
  pickaxe: <><path d="M3.5 7.5 11 4l9.5 4.5-3 2.2-6.3-2.9-4.6 3z"/><path d="m10.7 8.1-5.2 12.6M13.1 12l4.6 8.5"/></>,
  tree: <><path d="m12 3-5 7h3l-4 6h12l-4-6h3z"/><path d="M12 16v5"/></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/></>,
  inbox: <><path d="M4 4.5h16v15H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  paperclip: <path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>,
  sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1z"/></>,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>,
  zap: <path d="m13 2-3 9h7l-6 11 1-9H5z"/>,
  "micOff": <><path d="m2 2 20 20"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.8-1M5 10v1a7 7 0 0 0 12 4.9M12 18v4M8 22h8"/></>,
  "headphonesOff": <><path d="m3 3 18 18"/><path d="M3 14v-3a9 9 0 0 1 15.5-6.2M21 14v-3a8.9 8.9 0 0 0-1.1-4.3"/><path d="M3 13h2v7H3zM19 13h2v7h-2z"/></>,
  voice: <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4"/>,
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10"/>,
  arrowRight: <path d="M5 12h14M12 5l7 7-7 7"/>,
  at: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M16 12v2a2 2 0 0 0 4 0v-2"/></>,
};

const aliases: Record<string, string> = {};

const animationByIcon: Record<string, string> = {
  reply: "slide-left", forward: "slide-right", edit: "wiggle", delete: "shake", copy: "pop", pin: "tilt", bookmark: "hop", share: "spin",
  heart: "beat", star: "bounce-spin", "thumbs-up": "hop", emoji: "spin", gift: "shake", boost: "launch",
  attach: "wiggle", image: "tilt", gif: "pop", sticker: "spin", camera: "pop", mic: "hop", headphones: "wiggle", "volume-off": "shake",
  home: "hop", search: "magnify", explore: "spin", menu: "slide-right", grid: "pop", chevron: "slide-right", plus: "bounce-spin", close: "spin",
  shield: "pop", flag: "wave", lock: "shake", bell: "ring", "bell-off": "shake", block: "spin",
  settings: "spin", refresh: "spin", download: "slide-down", upload: "slide-up", link: "wiggle", filter: "slide-right",
  calendar: "tilt", clock: "spin", location: "hop", globe: "spin", palette: "spin", user: "pop", users: "pop", hash: "slide-right",
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const key = aliases[name] || name;
  const filledIcon = false;
  const animation = animationByIcon[key] || "pop";
  return <svg className={`ui-icon icon-${name} icon-${key} icon-motion-${animation} ${className}`} width={size} height={size} viewBox="0 0 24 24" fill={filledIcon ? "currentColor" : "none"} stroke={filledIcon ? "none" : "currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[key] || paths.sparkles}</svg>;
}

export const iconCategories = {
  Messaging: ["reply", "forward", "edit", "delete", "copy", "pin", "bookmark", "share"],
  "Reactions & Social": ["heart", "star", "thumbs-up", "emoji", "gift", "boost"],
  "Media & Calls": ["attach", "image", "gif", "sticker", "camera", "mic", "headphones", "volume-off"],
  Navigation: ["home", "search", "explore", "menu", "grid", "chevron", "plus", "close"],
  Moderation: ["shield", "flag", "lock", "bell", "bell-off", "block"],
  System: ["settings", "refresh", "download", "upload", "link", "filter"],
  Utility: ["calendar", "clock", "location", "globe", "palette", "user", "users", "hash"],
} as const;
