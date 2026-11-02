import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Icon } from "./icons.filename";

type TicketRole = { id: string; name: string; color: string };
type TicketMember = { id: string; name: string; avatarUrl?: string | null };
type TicketPanel = {
  channel_id: string;
  server_id: string;
  title: string;
  description: string;
  button_label: string;
  welcome_message: string;
  categories: string[];
  support_role_ids: string[];
  allow_user_close: boolean;
  allow_claim: boolean;
  save_transcripts: boolean;
};
type TicketRecord = {
  id: string;
  server_id: string;
  panel_channel_id: string;
  channel_id: string;
  ticket_number: number;
  created_by: string;
  category: string;
  status: "open" | "claimed" | "archived";
  assigned_to: string | null;
  created_at: string;
  archived_at: string | null;
};

const DEFAULT_PANEL: TicketPanel = {
  channel_id: "",
  server_id: "",
  title: "Support Center",
  description: "Need help? Create a private ticket and our team will assist you.",
  button_label: "Create Ticket",
  welcome_message: "Please describe your issue. A support team member will be with you shortly.",
  categories: ["General", "Technical Support", "Report a User"],
  support_role_ids: [],
  allow_user_close: true,
  allow_claim: true,
  save_transcripts: true
};

export function TicketPanelView({
  channelId,
  serverId,
  canManage,
  roles,
  onNotify,
  onOpenTicket
}: {
  channelId: string;
  serverId: string;
  canManage: boolean;
  roles: TicketRole[];
  onNotify: (message: string) => void;
  onOpenTicket: (channelId: string) => void | Promise<void>;
}) {
  const [panel, setPanel] = useState<TicketPanel>({ ...DEFAULT_PANEL, channel_id: channelId, server_id: serverId });
  const [categoriesText, setCategoriesText] = useState(DEFAULT_PANEL.categories.join("\n"));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("ticket_panels").select("*").eq("channel_id", channelId).maybeSingle();
      if (cancelled) return;
      if (error) {
        onNotify("Couldn't load ticket panel: " + error.message);
      } else if (data) {
        const row = data as TicketPanel;
        const normalized = { ...DEFAULT_PANEL, ...row, categories: Array.isArray(row.categories) ? row.categories : [] };
        setPanel(normalized);
        setCategoriesText(normalized.categories.join("\n"));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [channelId]);

  const categories = useMemo(() => panel.categories.filter(Boolean), [panel.categories]);

  const createTicket = async (category: string) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_ticket", {
      p_panel_channel_id: channelId,
      p_category: category || categories[0] || "General"
    });
    setBusy(false);
    if (error || !data || typeof data.channel_id !== "string") {
      onNotify("Couldn't create your ticket: " + (error?.message || "Please try again."));
      return;
    }
    onNotify("Your private ticket has been created.");
    await onOpenTicket(data.channel_id);
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextCategories = [...new Set(categoriesText.split("\n").map(value => value.trim()).filter(Boolean))].slice(0, 12);
    if (!nextCategories.length) {
      onNotify("Add at least one ticket category.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("save_ticket_panel", {
      p_channel_id: channelId,
      p_title: panel.title,
      p_description: panel.description,
      p_button_label: panel.button_label,
      p_welcome_message: panel.welcome_message,
      p_categories: nextCategories,
      p_support_role_ids: panel.support_role_ids,
      p_allow_user_close: panel.allow_user_close,
      p_allow_claim: panel.allow_claim,
      p_save_transcripts: panel.save_transcripts
    });
    setBusy(false);
    if (error) {
      onNotify("Couldn't save ticket settings: " + error.message);
      return;
    }
    setPanel(current => ({ ...current, categories: nextCategories }));
    setCategoriesText(nextCategories.join("\n"));
    onNotify("Ticket panel settings saved.");
  };

  if (loading) return <section className="ticket-panel-view"><div className="ticket-loading">Loading ticket panel…</div></section>;

  return <section className="ticket-panel-view">
    <div className="ticket-panel-card">
      <div className="ticket-panel-eyebrow"><Icon name="life-buoy" size={15}/> VOAX SUPPORT</div>
      <div className="ticket-panel-heading">
        <div className="ticket-panel-art"><Icon name="ticket" size={30}/></div>
        <div><h1>{panel.title}</h1><p>{panel.description}</p></div>
      </div>
      <button type="button" className="btn primary ticket-create-button" disabled={busy} onClick={() => void createTicket(categories[0] || "General")}>
        <Icon name="plus" size={17}/>{busy ? "Creating ticket…" : panel.button_label}
      </button>
      <div className="ticket-panel-categories">
        <div className="ticket-panel-section-title"><strong>Choose a category</strong><span>Or use the button above</span></div>
        <div className="ticket-category-grid">
          {categories.map((category, index) => <button type="button" key={category} className="ticket-category-card" disabled={busy} onClick={() => void createTicket(category)}>
            <span className="ticket-category-icon"><Icon name={index === 1 ? "wrench" : index === 2 ? "flag" : "message-circle"} size={19}/></span>
            <span><strong>{category}</strong><small>Open a private {category.toLowerCase()} ticket</small></span>
            <Icon name="chevron-right" size={16}/>
          </button>)}
        </div>
      </div>
    </div>

    {canManage && <details className="ticket-panel-settings">
      <summary><span><Icon name="settings" size={16}/> Ticket panel settings</span><Icon name="chevron-down" size={16}/></summary>
      <form onSubmit={saveSettings}>
        <label>Panel title<input value={panel.title} maxLength={100} onChange={event => setPanel(current => ({ ...current, title: event.target.value }))}/></label>
        <label>Description<textarea rows={2} maxLength={500} value={panel.description} onChange={event => setPanel(current => ({ ...current, description: event.target.value }))}/></label>
        <label>Button label<input value={panel.button_label} maxLength={40} onChange={event => setPanel(current => ({ ...current, button_label: event.target.value }))}/></label>
        <label>Welcome message<textarea rows={3} maxLength={2000} value={panel.welcome_message} onChange={event => setPanel(current => ({ ...current, welcome_message: event.target.value }))}/></label>
        <label>Ticket categories <small>One category per line, up to 12.</small><textarea rows={4} value={categoriesText} onChange={event => setCategoriesText(event.target.value)} placeholder={"General\nTechnical Support\nReport a User"}/></label>
        <div className="ticket-panel-role-settings"><strong>Support roles</strong><small>Members with these roles can see, claim, and manage tickets.</small>
          {roles.length ? roles.map(role => <label key={role.id}><input type="checkbox" checked={panel.support_role_ids.includes(role.id)} onChange={event => setPanel(current => ({ ...current, support_role_ids: event.target.checked ? [...current.support_role_ids, role.id] : current.support_role_ids.filter(id => id !== role.id) }))}/><i style={{ background: role.color }}/><span>{role.name}</span></label>) : <small>Create a custom server role first to assign ticket support access.</small>}
        </div>
        <label className="ticket-setting-toggle"><span><strong>Allow ticket creators to close tickets</strong><small>Support members can always close tickets.</small></span><input type="checkbox" checked={panel.allow_user_close} onChange={event => setPanel(current => ({ ...current, allow_user_close: event.target.checked }))}/></label>
        <label className="ticket-setting-toggle"><span><strong>Allow support members to claim tickets</strong></span><input type="checkbox" checked={panel.allow_claim} onChange={event => setPanel(current => ({ ...current, allow_claim: event.target.checked }))}/></label>
        <label className="ticket-setting-toggle"><span><strong>Save transcripts when tickets close</strong></span><input type="checkbox" checked={panel.save_transcripts} onChange={event => setPanel(current => ({ ...current, save_transcripts: event.target.checked }))}/></label>
        <div className="ticket-settings-footer"><small>Maximum one active ticket per user in this server.</small><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
      </form>
    </details>}
  </section>;
}

export function TicketChannelHeader({
  channelId,
  currentUserId,
  canManageServer,
  myRoleIds,
  members,
  onNotify,
  onChanged,
  onArchivedChange
}: {
  channelId: string;
  currentUserId: string;
  canManageServer: boolean;
  myRoleIds: string[];
  members: TicketMember[];
  onNotify: (message: string) => void;
  onChanged: () => void | Promise<void>;
  onArchivedChange: (archived: boolean) => void;
}) {
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [creatorName, setCreatorName] = useState("Member");
  const [assignedName, setAssignedName] = useState("Unclaimed");
  const [supportRoleIds, setSupportRoleIds] = useState<string[]>([]);
  const [allowUserClose, setAllowUserClose] = useState(true);
  const [allowClaim, setAllowClaim] = useState(true);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [ticketMembers, setTicketMembers] = useState<TicketMember[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [busy, setBusy] = useState(false);

  const isSupport = canManageServer || myRoleIds.some(id => supportRoleIds.includes(id));
  const canClose = Boolean(ticket && (isSupport || (allowUserClose && ticket.created_by === currentUserId)));
  const availableMembers = members.filter(member => member.id !== ticket?.created_by && !ticketMembers.some(item => item.id === member.id));

  const loadTicket = async () => {
    const { data, error } = await supabase.from("tickets")
      .select("id,server_id,panel_channel_id,channel_id,ticket_number,created_by,category,status,assigned_to,created_at,archived_at")
      .eq("channel_id", channelId).maybeSingle();
    if (error || !data) {
      onNotify("Couldn't load ticket details: " + (error?.message || "Ticket not found."));
      return;
    }
    const row = data as TicketRecord;
    setTicket(row);
    onArchivedChange(row.status === "archived");
    const [panelResult, creatorResult, assignedResult, memberResult, transcriptResult] = await Promise.all([
      supabase.from("ticket_panels").select("support_role_ids,allow_user_close,allow_claim").eq("channel_id", row.panel_channel_id).maybeSingle(),
      supabase.from("profiles").select("username").eq("id", row.created_by).maybeSingle(),
      row.assigned_to ? supabase.from("profiles").select("username").eq("id", row.assigned_to).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("ticket_members").select("user_id").eq("ticket_id", row.id),
      supabase.from("ticket_transcripts").select("id").eq("ticket_id", row.id).maybeSingle()
    ]);
    if (panelResult.data) {
      setSupportRoleIds(panelResult.data.support_role_ids || []);
      setAllowUserClose(panelResult.data.allow_user_close !== false);
      setAllowClaim(panelResult.data.allow_claim !== false);
    }
    setCreatorName(creatorResult.data?.username || "Member");
    setAssignedName(assignedResult.data?.username || (row.assigned_to ? "Support member" : "Unclaimed"));
    setHasTranscript(Boolean(transcriptResult.data));
    const ids = (memberResult.data || []).map(item => item.user_id);
    setTicketMembers(ids.map(id => members.find(member => member.id === id) || { id, name: "Server member" }));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadTicket();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [channelId, members.map(member => member.id).join("|")]);

  const runAction = async (action: string, memberId?: string) => {
    if (!ticket || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("manage_ticket", { p_ticket_id: ticket.id, p_action: action, p_member_id: memberId || null });
    setBusy(false);
    if (error) {
      onNotify("Couldn't " + action.replace("_", " ") + " ticket: " + error.message);
      return;
    }
    onNotify(action === "close" ? "Ticket archived." : action === "reopen" ? "Ticket reopened." : action === "claim" ? "Ticket claimed." : "Ticket updated.");
    await loadTicket();
    await onChanged();
  };

  const downloadTranscript = async () => {
    if (!ticket) return;
    const { data, error } = await supabase.rpc("get_ticket_transcript", { p_ticket_id: ticket.id });
    if (error || typeof data !== "string") {
      onNotify("Couldn't load the ticket transcript: " + (error?.message || "Transcript unavailable."));
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "voax-ticket-" + String(ticket.ticket_number).padStart(3, "0") + "-transcript.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!ticket) return <div className="ticket-channel-header ticket-loading">Loading ticket details…</div>;

  return <section className="ticket-channel-header">
    <div className="ticket-channel-summary">
      <div className="ticket-channel-title"><span className="ticket-channel-icon"><Icon name="ticket" size={19}/></span><div><strong>Ticket #{String(ticket.ticket_number).padStart(3, "0")}</strong><small>{ticket.category} · Created by {creatorName}</small></div></div>
      <div className={"ticket-status-pill ticket-status-" + ticket.status}>{ticket.status === "archived" ? "Archived" : ticket.status === "claimed" ? "Claimed" : "Open"}</div>
    </div>
    <div className="ticket-channel-meta"><span>Assigned to <strong>{assignedName}</strong></span><span>Opened {new Date(ticket.created_at).toLocaleDateString()}</span></div>
    <div className="ticket-channel-actions">
      {ticket.status !== "archived" && isSupport && allowClaim && ticket.status === "open" && <button type="button" className="btn small secondary" disabled={busy} onClick={() => void runAction("claim")}><Icon name="user-check" size={14}/> Claim</button>}
      {ticket.status !== "archived" && canClose && <button type="button" className="btn small secondary" disabled={busy} onClick={() => void runAction("close")}><Icon name="archive" size={14}/> Close ticket</button>}
      {ticket.status === "archived" && isSupport && <button type="button" className="btn small primary" disabled={busy} onClick={() => void runAction("reopen")}><Icon name="refresh-cw" size={14}/> Reopen</button>}
      {ticket.status === "archived" && hasTranscript && <button type="button" className="btn small secondary" onClick={() => void downloadTranscript()}><Icon name="file-text" size={14}/> Transcript</button>}
      {ticket.status !== "archived" && isSupport && <div className="ticket-add-member"><select aria-label="Choose a member to add" value={selectedMember} onChange={event => setSelectedMember(event.target.value)}><option value="">Add member…</option>{availableMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button type="button" className="btn small secondary" disabled={!selectedMember || busy} onClick={() => { const id = selectedMember; setSelectedMember(""); void runAction("add_member", id); }}>Add</button></div>}
    </div>
    {ticketMembers.length > 0 && <div className="ticket-participants"><span>Additional members</span>{ticketMembers.map(member => <span className="ticket-participant" key={member.id}>{member.name}{isSupport && ticket.status !== "archived" && <button type="button" aria-label={"Remove " + member.name} title={"Remove " + member.name} disabled={busy} onClick={() => void runAction("remove_member", member.id)}>×</button>}</span>)}</div>}
  </section>;
}
