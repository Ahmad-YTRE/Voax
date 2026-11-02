import React, { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Icon } from "./icons.filename";
import "./discovery.css";

const CATEGORIES = ["Gaming", "Minecraft", "Community", "Technology", "Art", "Music", "Education", "Other", "Programming", "Sports", "Entertainment"] as const;
type Category = typeof CATEGORIES[number];
type Listing = {
  listing_id: string; server_id: string; server_public_id: string | null; server_name: string;
  icon_url: string | null; banner_url: string | null; short_description: string; full_description: string;
  category: Category; tags: string[]; language: string; owner_id: string; created_at: string;
  member_count: number; online_count: number; is_featured: boolean;
};
type OwnedServer = { id: string; name: string; description: string; icon_url: string | null; public_id: string | null };
type DiscoveryRecord = {
  id: string; server_id: string; owner_id: string; server_name: string; icon_url: string | null;
  banner_url: string | null; short_description: string; full_description: string; category: Category;
  tags: string[]; language: string; listing_enabled: boolean; listing_status: string; rejection_reason: string | null;
};
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String((error as {message:unknown}).message) : "Please try again.";
function initials(value: string) { return value.trim().split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "V"; }
function formatCount(value: number) { return new Intl.NumberFormat().format(value || 0); }
function openServerPath(server: Pick<Listing, "server_id" | "server_public_id">, navigate?: (path:string)=>void) {
  void supabase.from("channels").select("id,public_id").eq("server_id", server.server_id).order("created_at").limit(1).maybeSingle().then(({data}) => {
    const channel = data as {id:string;public_id:string|null}|null;
    const path = channel ? "/channel/" + (server.server_public_id || server.server_id) + "/" + (channel.public_id || channel.id) : "/app";
    if (navigate) navigate(path); else window.location.assign(path);
  });
}
function PageFrame({children,active="explore",embedded=false}:{children:React.ReactNode;active?:"explore"|"admin"|"mod";embedded?:boolean}) {
  if(embedded)return <>{children}</>;
  return <div className="discovery-shell">
    <aside className="discovery-rail">
      <a className="discovery-brand" href="/app" aria-label="Back to Voax"><img src="/logo.svg" alt="Voax"/></a>
      <a className={active==="explore"?"selected":""} href="/explore" title="Explore"><Icon name="search" size={19}/></a>
      {active==="admin" && <a className="selected" href="/admin" title="Admin"><Icon name="shield-check" size={19}/></a>}{active==="mod" && <a className="selected" href="/mod" title="Moderation"><Icon name="shield" size={19}/></a>}
      <div className="discovery-rail-spacer"/>
      <a href="/app" title="Return to app"><Icon name="chevron" size={19}/></a>
    </aside>
    <main className="discovery-main">{children}</main>
  </div>;
}
function ServerAvatar({name,url}:{name:string;url:string|null}) {
  return <span className="discovery-avatar">{url?<img src={url} alt=""/>:initials(name)}</span>;
}
function ListingCard({listing,member,onOpen,onJoin}:{listing:Listing;member:boolean;onOpen:()=>void;onJoin:()=>void}) {
  return <article className="discovery-card">
    <button className="discovery-card-banner" type="button" onClick={onOpen} aria-label={"View "+listing.server_name}>
      {listing.banner_url ? <img src={listing.banner_url} alt="" loading="lazy"/> : <span className="discovery-banner-fallback"><i>{listing.category}</i></span>}
      {listing.is_featured && <span className="discovery-featured"><Icon name="star" size={12}/> Featured</span>}
    </button>
    <div className="discovery-card-body">
      <div className="discovery-card-heading"><ServerAvatar name={listing.server_name} url={listing.icon_url}/><div className="discovery-card-title"><h3>{listing.server_name}</h3><span>{listing.category} · {listing.language}</span></div></div>
      <p>{listing.short_description}</p>
      <div className="discovery-card-meta"><span><Icon name="users" size={14}/> {formatCount(listing.member_count)} members</span><span><i className="discovery-online-dot"/> {formatCount(listing.online_count)} online</span></div>
      <div className="discovery-card-actions"><button className="discovery-secondary" type="button" onClick={onOpen}>View details</button><button className="discovery-primary" type="button" onClick={member?onOpen:onJoin}>{member?"Open Server":"Join Server"} <Icon name="arrowRight" size={15}/></button></div>
    </div>
  </article>;
}
export function ExplorePage({session,embedded=false,routePath,onNavigate,onlineCounts={}}:{session:Session;embedded?:boolean;routePath?:string;onNavigate?:(path:string)=>void;onlineCounts?:Record<string,number>}) {
  const path = routePath || window.location.pathname;
  const navigate=(target:string)=>{if(onNavigate)onNavigate(target);else window.location.assign(target);};
  const isManagePath = path === "/explore/manage" || path === "/explore/manage/" || path.startsWith("/explore/manage/");
  const detailId = path.startsWith("/explore/server/") ? decodeURIComponent(path.split("/")[3]||"") : "";
  const [listings,setListings] = useState<Listing[]>([]);
  const [members,setMembers] = useState<Set<string>>(new Set());
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("All");
  const [sort,setSort] = useState<"featured"|"popular"|"new">("featured");
  const [selected,setSelected] = useState<Listing|null>(null);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState("");
  const [reportListing,setReportListing] = useState<Listing|null>(null);
  const [reportReason,setReportReason] = useState("Spam or misleading content");
  const [reportDetails,setReportDetails] = useState("");
  const [reportBusy,setReportBusy] = useState(false);
  useEffect(()=>{setListings(old=>old.map(item=>({...item,online_count:onlineCounts[item.server_id]??0})));},[onlineCounts]);
  useEffect(() => {
    let alive=true;
    if(isManagePath){setLoading(false);return;}
    (async()=>{
      setLoading(true);
      const [cards,membership] = await Promise.all([
        supabase.rpc("get_explore_server_cards"),
        supabase.from("server_members").select("server_id").eq("user_id",session.user.id)
      ]);
      if(!alive)return;
      if(cards.error){setNotice("Couldn't load Explore: "+cards.error.message);setLoading(false);return;}
      setListings(((cards.data||[]) as Listing[]).map(item=>({...item,online_count:onlineCounts[item.server_id]??0})));
      if(membership.error){setNotice("Couldn't check your server memberships.");}
      setMembers(new Set((membership.data||[]).map((row:{server_id:string})=>row.server_id)));
      setLoading(false);
    })();
    return()=>{alive=false;};
  },[session.user.id,isManagePath]);
  useEffect(()=>{if(!detailId){setSelected(null);return;}if(listings.length){setSelected(listings.find(item=>item.server_id===detailId||item.server_public_id===detailId)||null);}},[detailId,listings]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return listings.filter(item=>(category==="All"||item.category===category)&&(!needle||[item.server_name,item.short_description,item.full_description,item.category,...item.tags].join(" ").toLowerCase().includes(needle)));
  },[listings,query,category]);
  const sorted=useMemo(()=>[...filtered].sort((a,b)=>sort==="popular"?b.member_count-a.member_count:sort==="new"?new Date(b.created_at).getTime()-new Date(a.created_at).getTime():Number(b.is_featured)-Number(a.is_featured)||b.member_count-a.member_count),[filtered,sort]);
  if(isManagePath) return <DiscoveryManagePage session={session} serverId={decodeURIComponent(path.split("/")[3]||"")} embedded={embedded} onNavigate={onNavigate}/>;
  async function join(listing:Listing) {
    if(members.has(listing.server_id)){openServerPath(listing,navigate);return;}
    setNotice("");
    const {error}=await supabase.rpc("join_discovered_server",{p_server_id:listing.server_id});
    if(error){setNotice("Couldn't join this server: "+error.message);return;}
    setMembers(old=>new Set(old).add(listing.server_id));
    openServerPath(listing,navigate);
  }
  async function submitReport(event:React.FormEvent) {
    event.preventDefault();if(!reportListing)return;setReportBusy(true);
    const {error}=await supabase.from("voax_reports").insert({reporter_id:session.user.id,target_type:"server",target_server_id:reportListing.server_id,reason:reportReason,details:reportDetails.trim(),snapshot:{server_name:reportListing.server_name,listing_id:reportListing.listing_id,source:"explore"}});
    setReportBusy(false);
    if(error){setNotice("Couldn't submit report: "+error.message);return;}
    setReportListing(null);setReportDetails("");setNotice("Report submitted. Thank you for helping keep Voax safe.");
  }
  if(selected) return <PageFrame embedded={embedded}><div className="discovery-page">
    <button className="discovery-back" onClick={()=>navigate("/explore")}><Icon name="chevron" size={16}/> Back to Explore</button>
    <div className="discovery-detail-banner">{selected.banner_url?<img src={selected.banner_url} alt=""/>:<span className="discovery-banner-fallback"/>}</div>
    <div className="discovery-detail-head"><ServerAvatar name={selected.server_name} url={selected.icon_url}/><div><h1>{selected.server_name}</h1><p>{selected.category} · {selected.language} · {formatCount(selected.member_count)} members</p></div><button className="discovery-primary" onClick={()=>members.has(selected.server_id)?openServerPath(selected,navigate):void join(selected)}>{members.has(selected.server_id)?"Open Server":"Join Server"} <Icon name="arrowRight" size={15}/></button></div>
    <div className="discovery-detail-grid"><section className="discovery-detail-panel"><span className="discovery-eyebrow">ABOUT THIS SERVER</span><h2>{selected.short_description}</h2><p className="discovery-full-description">{selected.full_description||selected.short_description}</p>{selected.tags.length>0&&<div className="discovery-tags">{selected.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}</section><aside className="discovery-detail-panel discovery-stats"><span className="discovery-eyebrow">COMMUNITY</span><strong>{formatCount(selected.member_count)}</strong><span>Members</span><strong>{formatCount(selected.online_count)}</strong><span>Online now</span><button className="discovery-report-link" onClick={()=>setReportListing(selected)}><Icon name="flag" size={14}/> Report this server</button></aside></div>
    {reportListing&&<div className="discovery-modal-backdrop"><form className="discovery-modal" onSubmit={submitReport}><button type="button" className="discovery-modal-close" onClick={()=>setReportListing(null)}>×</button><h2>Report server</h2><p>Tell the moderation team what's wrong with this listing.</p><label>Reason<select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option>Spam or misleading content</option><option>Harassment or hateful content</option><option>Inappropriate content</option><option>Impersonation</option><option>Other</option></select></label><label>Details (optional)<textarea maxLength={500} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} rows={4}/></label><button className="discovery-primary" disabled={reportBusy}>{reportBusy?"Submitting…":"Submit report"}</button></form></div>}
  </div></PageFrame>;
  return <PageFrame embedded={embedded}><div className="discovery-page">
    <header className="discovery-header"><div><span className="discovery-eyebrow">VOAX COMMUNITIES</span><h1>Explore servers</h1><p>Find a community, meet people and join the conversation.</p></div><a className="discovery-manage-link" href="/explore/manage" onClick={e=>{if(embedded){e.preventDefault();navigate("/explore/manage");}}}><Icon name="settings" size={15}/> Manage my listings</a></header>
    {notice&&<div className="discovery-notice">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <div className="discovery-search"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search communities, topics and tags…"/><kbd>⌕</kbd></div>
    <div className="discovery-categories"><button className={category==="All"?"active":""} onClick={()=>setCategory("All")}>All</button>{CATEGORIES.map(item=><button key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    <div className="discovery-toolbar"><div><h2>{query||category!=="All"?"Search results":sort==="featured"?"Discover communities":sort==="popular"?"Popular servers":"New servers"}</h2><span>{formatCount(sorted.length)} communities</span></div><div className="discovery-sort"><button className={sort==="featured"?"active":""} onClick={()=>setSort("featured")}><Icon name="star" size={14}/> Featured</button><button className={sort==="popular"?"active":""} onClick={()=>setSort("popular")}>Popular</button><button className={sort==="new"?"active":""} onClick={()=>setSort("new")}>New</button></div></div>
    {loading?<div className="discovery-loading">Loading communities…</div>:sorted.length?<div className="discovery-grid">{sorted.map(item=><ListingCard key={item.listing_id} listing={item} member={members.has(item.server_id)} onOpen={()=>navigate("/explore/server/"+(item.server_public_id||item.server_id))} onJoin={()=>void join(item)}/>)}</div>:<div className="discovery-empty"><span>✦</span><h2>No communities found</h2><p>Try another search or category. New communities are always welcome.</p></div>}
    <footer className="discovery-footer">Discover something new on Voax.</footer>
  </div></PageFrame>;
}

function DiscoveryManagePage({session,serverId,embedded=false,onNavigate}:{session:Session;serverId:string;embedded?:boolean;onNavigate?:(path:string)=>void}) {
  const navigate=(target:string)=>{if(onNavigate)onNavigate(target);else window.location.assign(target);};
  const [servers,setServers]=useState<OwnedServer[]>([]);
  const [selected,setSelected]=useState(serverId);
  const [record,setRecord]=useState<DiscoveryRecord|null>(null);
  const [shortDescription,setShortDescription]=useState("");
  const [fullDescription,setFullDescription]=useState("");
  const [category,setCategory]=useState<Category>("Community");
  const [tags,setTags]=useState("");
  const [language,setLanguage]=useState("English");
  const [bannerUrl,setBannerUrl]=useState<string|null>(null);
  const [enabled,setEnabled]=useState(true);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{let alive=true;(async()=>{
    const {data:memberships,error}=await supabase.from("server_members").select("server_id").eq("user_id",session.user.id).eq("role","owner");
    if(error){if(alive){setNotice(error.message);setLoading(false);}return;}
    const ids=(memberships||[]).map(row=>row.server_id);
    const {data,error:serverError}=ids.length?await supabase.from("servers").select("id,name,description,icon_url,public_id").in("id",ids).order("created_at"): {data:[],error:null};
    if(!alive)return;if(serverError){setNotice(serverError.message);setLoading(false);return;}
    setServers((data||[]) as OwnedServer[]);
    if(!selected&&data?.[0])setSelected(data[0].id);
    setLoading(false);
  })();return()=>{alive=false;};},[session.user.id]);
  useEffect(()=>{if(!selected)return;let alive=true;(async()=>{
    const {data,error}=await supabase.from("server_discovery").select("*").eq("server_id",selected).maybeSingle();
    if(!alive)return;
    if(error){setNotice(error.message);return;}
    const row=data as DiscoveryRecord|null;setRecord(row);
    setShortDescription(row?.short_description||"");setFullDescription(row?.full_description||"");
    setCategory(row?.category||"Community");setTags((row?.tags||[]).join(", "));
    setLanguage(row?.language||"English");setBannerUrl(row?.banner_url||null);setEnabled(row?.listing_enabled??true);
  })();return()=>{alive=false;};},[selected]);
  const current=servers.find(server=>server.id===selected);
  async function uploadBanner(file:File|null) {
    if(!file||!selected)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setNotice("Use a JPG, PNG or WebP banner.");return;}
    if(file.size>5*1024*1024){setNotice("Banner images must be 5 MB or smaller.");return;}
    setUploading(true);const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const path=selected+"/"+crypto.randomUUID()+"."+extension;
    const {error}=await supabase.storage.from("server-discovery-banners").upload(path,file,{contentType:file.type,upsert:false});
    if(error){setNotice("Banner upload failed: "+error.message);setUploading(false);return;}
    const {data}=supabase.storage.from("server-discovery-banners").getPublicUrl(path);
    setBannerUrl(data.publicUrl);setUploading(false);setNotice("Banner uploaded. Save your listing to apply it.");
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!current)return;
    if(!shortDescription.trim()){setNotice("Add a short description before submitting.");return;}
    if(fullDescription.length>500){setNotice("The full description must be 500 characters or fewer.");return;}
    setSaving(true);setNotice("");
    const payload={server_id:current.id,owner_id:session.user.id,server_name:current.name,icon_url:current.icon_url,banner_url:bannerUrl,short_description:shortDescription.trim(),full_description:fullDescription.trim(),category,tags:tags.split(",").map(tag=>tag.trim()).filter(Boolean).slice(0,10),language:language.trim()||"English",listing_enabled:enabled};
    const result=record?await supabase.from("server_discovery").update(payload).eq("id",record.id).select("*").single():await supabase.from("server_discovery").insert(payload).select("*").single();
    setSaving(false);
    if(result.error){setNotice("Couldn't save listing: "+result.error.message);return;}
    const updated=result.data as DiscoveryRecord;setRecord(updated);
    setNotice(updated.listing_status==="pending"?"Submitted for admin review.":"Listing saved.");
  }
  if(loading)return <PageFrame embedded={embedded}><div className="discovery-page"><div className="discovery-loading">Loading your servers…</div></div></PageFrame>;
  return <PageFrame embedded={embedded}><div className="discovery-page discovery-manage-page">
    <button className="discovery-back" onClick={()=>navigate("/explore")}><Icon name="chevron" size={16}/> Back to Explore</button>
    <header className="discovery-header"><div><span className="discovery-eyebrow">SERVER OWNER TOOLS</span><h1>Manage Explore listing</h1><p>Choose which of your communities can be discovered on Voax.</p></div></header>
    {notice&&<div className="discovery-notice">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {!servers.length?<div className="discovery-empty"><h2>No owned servers yet</h2><p>Only server owners can submit a community to Explore.</p><a className="discovery-primary" href="/app">Go to Voax</a></div>:<div className="discovery-manage-layout">
      <aside className="discovery-manage-list"><strong>Your servers</strong>{servers.map(server=><button key={server.id} className={selected===server.id?"active":""} onClick={()=>setSelected(server.id)}><ServerAvatar name={server.name} url={server.icon_url}/><span>{server.name}</span></button>)}</aside>
      <form className="discovery-form" onSubmit={save}>
        <div className="discovery-form-heading"><div><h2>{current?.name||"Server listing"}</h2><p>Public server discovery profile</p></div>{record&&<span className={"discovery-status status-"+record.listing_status}>{record.listing_status==="pending"?"Pending review":record.listing_status==="approved"?"Approved":"Needs changes"}</span>}</div>
        <label>Explore banner <span>Optional · JPG, PNG or WebP · 5 MB max</span></label>
        <div className="discovery-banner-upload">{bannerUrl?<img src={bannerUrl} alt="Explore banner preview"/>:<div className="discovery-banner-placeholder">Your custom server banner will appear here</div>}<label className="discovery-upload-button"><Icon name="upload" size={15}/>{uploading?"Uploading…":"Upload banner"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{void uploadBanner(e.target.files?.[0]||null);e.currentTarget.value="";}}/></label></div>
        <label>Short description <span>{shortDescription.length}/120</span><input maxLength={120} value={shortDescription} onChange={e=>setShortDescription(e.target.value)} placeholder="A quick introduction to your community" required/></label>
        <label>Full description <span>{fullDescription.length}/500</span><textarea maxLength={500} rows={5} value={fullDescription} onChange={e=>setFullDescription(e.target.value)} placeholder="Tell people what your server is about…"/></label>
        <div className="discovery-form-row"><label>Category<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label><label>Language<input maxLength={40} value={language} onChange={e=>setLanguage(e.target.value)} placeholder="English"/></label></div>
        <label>Tags <span>Comma separated · up to 10</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="survival, friends, building"/></label>
        {record&&<label className="discovery-toggle"><span><strong>Show this server in Explore</strong><small>Turn this off to hide the listing without deleting it.</small></span><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/></label>}
        {record?.rejection_reason&&record.listing_status==="rejected"&&<div className="discovery-rejection"><strong>Admin feedback</strong><p>{record.rejection_reason}</p></div>}
        <div className="discovery-form-actions"><button type="button" className="discovery-secondary" onClick={()=>navigate("/explore")}>Cancel</button><button className="discovery-primary" disabled={saving||uploading}>{saving?"Saving…":record?"Save changes":"Submit for approval"}</button></div>
        <p className="discovery-form-note">No minimum member count. Significant changes are sent for review again.</p>
      </form>
    </div>}
  </div></PageFrame>;
}

type AdminSection="overview"|"approvals"|"reports"|"servers"|"users"|"bans"|"appeals"|"staff"|"audit";
type StaffRole = "owner"|"admin"|"moderator";
export function AdminPage({session,mode="admin"}:{session:Session;mode?:"admin"|"moderator"}) {
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [staffRole,setStaffRole]=useState<StaffRole|null>(null);
  const [section,setSection]=useState<AdminSection>(mode==="admin"?"overview":"reports");
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [pending,setPending]=useState<any[]>([]);
  const [reports,setReports]=useState<any[]>([]);
  const [servers,setServers]=useState<any[]>([]);
  const [allListings,setAllListings]=useState<any[]>([]);
  const [users,setUsers]=useState<any[]>([]);
  const [bans,setBans]=useState<any[]>([]);
  const [appeals,setAppeals]=useState<any[]>([]);
  const [staff,setStaff]=useState<any[]>([]);
  const [audit,setAudit]=useState<any[]>([]);
  const [stats,setStats]=useState({users:0,servers:0,listings:0,pending:0,reports:0,bans:0,appeals:0});
  async function load() {
    setLoading(true);
    const check=await supabase.from("voax_staff_roles").select("role").eq("user_id",session.user.id).maybeSingle();
    const role=(check.data?.role||null) as StaffRole|null;
    setStaffRole(role);
    const permitted=Boolean(role)&&(mode==="moderator"||role==="owner"||role==="admin");
    if(check.error||!permitted){setAllowed(false);setLoading(false);return;}
    setAllowed(true);
    if(mode==="moderator") {
      const [profiles,reportRows,banRows,appealRows]=await Promise.all([
        supabase.from("profiles").select("id,username").limit(500),
        supabase.from("voax_reports").select("id,reporter_id,target_type,target_user_id,target_message_id,target_server_id,reason,details,snapshot,status,created_at,reviewed_by,resolved_at").order("created_at",{ascending:false}).limit(200),
        supabase.from("voax_account_bans").select("id,user_id,reason,duration,expires_at,status,banned_by,created_at,revoked_at").order("created_at",{ascending:false}).limit(200),
        supabase.from("voax_ban_appeals").select("id,ban_id,user_id,message,status,response,created_at,reviewed_by,resolved_at").order("created_at",{ascending:false}).limit(200)
      ]);
      const failure=[profiles,reportRows,banRows,appealRows].find(result=>result.error);
      if(failure?.error)setNotice("Some moderation data couldn't load: "+failure.error.message);
      setUsers(profiles.data||[]);
      setReports(reportRows.data||[]);
      setBans(banRows.data||[]);
      setAppeals(appealRows.data||[]);
      setPending([]);setServers([]);setAllListings([]);setStaff([]);setAudit([]);
      setStats({
        users:0,servers:0,listings:0,pending:0,
        reports:(reportRows.data||[]).filter((item:any)=>item.status==="open").length,
        bans:(banRows.data||[]).filter((item:any)=>item.status==="active"&&(!item.expires_at||new Date(item.expires_at)>new Date())).length,
        appeals:(appealRows.data||[]).filter((item:any)=>item.status==="open").length
      });
      setLoading(false);
      return;
    }
    const [profiles,serverRows,listings,queue,reportRows,banRows,appealRows,staffRows,auditRows]=await Promise.all([
      supabase.from("profiles").select("id,username,status,created_at",{count:"exact"}).order("created_at",{ascending:false}).limit(200),
      supabase.from("servers").select("id,name,description,created_by,created_at,icon_url",{count:"exact"}).order("created_at",{ascending:false}).limit(100),
      supabase.from("server_discovery").select("id,listing_status,listing_enabled"),
      supabase.from("server_discovery").select("id,server_id,server_name,short_description,full_description,category,icon_url,banner_url,listing_status,listing_enabled,is_featured,owner_id,created_at,submitted_at,rejection_reason").eq("listing_status","pending").order("submitted_at",{ascending:true}).limit(100),
      supabase.from("voax_reports").select("id,reporter_id,target_type,target_user_id,target_message_id,target_server_id,reason,details,snapshot,status,created_at,reviewed_by,resolved_at").order("created_at",{ascending:false}).limit(200),
      supabase.from("voax_account_bans").select("id,user_id,reason,duration,expires_at,status,banned_by,created_at,revoked_at").order("created_at",{ascending:false}).limit(200),
      supabase.from("voax_ban_appeals").select("id,ban_id,user_id,message,status,response,created_at,reviewed_by,resolved_at").order("created_at",{ascending:false}).limit(200),
      supabase.from("voax_staff_roles").select("user_id,role,granted_by,created_at").order("created_at",{ascending:false}),
      supabase.from("voax_admin_audit_log").select("id,admin_id,action,target_type,target_id,details,created_at").order("created_at",{ascending:false}).limit(100)
    ]);
    const failure=[profiles,serverRows,listings,queue,reportRows,banRows,appealRows,staffRows,auditRows].find(result=>result.error);
    if(failure?.error)setNotice("Some staff data couldn't load: "+failure.error.message);
    setUsers(profiles.data||[]);setServers(serverRows.data||[]);setAllListings(listings.data||[]);setPending(queue.data||[]);
    setReports(reportRows.data||[]);setBans(banRows.data||[]);setAppeals(appealRows.data||[]);setStaff(staffRows.data||[]);setAudit(auditRows.data||[]);
    setStats({
      users:profiles.count??(profiles.data||[]).length,servers:serverRows.count??(serverRows.data||[]).length,
      listings:(listings.data||[]).filter((x:any)=>x.listing_enabled&&x.listing_status==="approved").length,
      pending:(queue.data||[]).length,reports:(reportRows.data||[]).filter((x:any)=>x.status==="open").length,
      bans:(banRows.data||[]).filter((x:any)=>x.status==="active"&&(!x.expires_at||new Date(x.expires_at)>new Date())).length,
      appeals:(appealRows.data||[]).filter((x:any)=>x.status==="open").length
    });
    setLoading(false);
  }
  useEffect(()=>{void load();},[session.user.id,mode]);
  async function log(action:string,targetType:string,targetId:string,details:Record<string,unknown>={}) {
    await supabase.from("voax_admin_audit_log").insert({admin_id:session.user.id,action,target_type:targetType,target_id:targetId,details});
  }
  async function reviewListing(item:any,status:"approved"|"rejected") {
    const reason=status==="rejected"?(window.prompt("Reason for rejection (shown to the server owner):")||"Please update this listing to meet the Explore guidelines.") : null;
    const {error}=await supabase.from("server_discovery").update({listing_status:status,reviewed_at:new Date().toISOString(),reviewed_by:session.user.id,rejection_reason:reason}).eq("id",item.id);
    if(error){setNotice("Couldn't update listing: "+error.message);return;}
    await log(status==="approved"?"approved_explore_listing":"rejected_explore_listing","server_discovery",item.id,{server_name:item.server_name});
    setNotice(item.server_name+" "+(status==="approved"?"approved":"returned for changes")+".");await load();
  }
  async function toggleFeatured(item:any) {
    const {error}=await supabase.from("server_discovery").update({is_featured:!item.is_featured}).eq("id",item.id);
    if(error){setNotice(error.message);return;}
    await log(item.is_featured?"unfeatured_server":"featured_server","server_discovery",item.id,{server_name:item.server_name});await load();
  }
  async function reviewReport(item:any,status:"reviewing"|"resolved"|"dismissed") {
    const {error}=await supabase.from("voax_reports").update({status,reviewed_by:session.user.id,resolved_at:status==="resolved"||status==="dismissed"?new Date().toISOString():null}).eq("id",item.id);
    if(error){setNotice("Couldn't update report: "+error.message);return;}
    await log("updated_report","voax_reports",item.id,{status});setNotice("Report updated.");await load();
  }
  async function moderationAction(body:Record<string,unknown>) {
    const {data,error}=await supabase.functions.invoke("voax-moderation",{body});
    if(error||data?.error){setNotice(data?.error||error?.message||"Moderation action failed.");return null;}
    return data;
  }
  async function issueBan(targetId:string) {
    const reason=window.prompt("Reason for the account ban:");
    if(!reason||reason.trim().length<3)return;
    const choices=staffRole==="owner"? "1h, 24h, 7d, 30d, permanent":staffRole==="admin"?"1h, 24h, 7d, 30d":"1h, 24h, 7d";
    const duration=(window.prompt("Choose a duration: "+choices,staffRole==="moderator"?"24h":"7d")||"").trim();
    if(!choices.split(", ").includes(duration)){setNotice("Choose one of the available ban durations: "+choices);return;}
    const result=await moderationAction({action:"ban_user",target_user_id:targetId,reason:reason.trim(),duration});
    if(result){setNotice("Account banned.");await load();}
  }
  async function revokeBan(targetId:string) {
    if(!window.confirm("Revoke the active Voax ban for this account?"))return;
    const result=await moderationAction({action:"unban_user",target_user_id:targetId});
    if(result){setNotice("Ban revoked.");await load();}
  }
  async function assignStaffRole(userId:string,role:StaffRole|null) {
    const result=await moderationAction({action:"set_staff_role",target_user_id:userId,role});
    if(result){setNotice(role?"Staff role updated.":"Staff role removed.");await load();}
  }
  async function reviewAppeal(item:any,status:"reviewing"|"accepted"|"rejected") {
    if(status==="accepted") {
      const result=await moderationAction({action:"unban_user",target_user_id:item.user_id});
      if(!result)return;
    }
    const response=status==="rejected"?(window.prompt("Optional response to the user:")||"Your appeal was reviewed and declined."):"";
    const {error}=await supabase.from("voax_ban_appeals").update({status,reviewed_by:session.user.id,response,resolved_at:status==="reviewing"?null:new Date().toISOString()}).eq("id",item.id);
    if(error){setNotice("Couldn't update appeal: "+error.message);return;}
    await log("reviewed_ban_appeal","voax_ban_appeals",item.id,{status});setNotice("Appeal updated.");await load();
  }
  if(loading)return <PageFrame active={mode==="admin"?"admin":"mod"}><div className="discovery-page"><div className="discovery-loading">Checking staff access…</div></div></PageFrame>;
  if(!allowed)return <PageFrame active={mode==="admin"?"admin":"mod"}><div className="discovery-page"><div className="admin-denied"><span><Icon name="shield" size={26}/></span><h1>Staff access required</h1><p>This account doesn't have permission to open this panel.</p><a className="discovery-primary" href="/app">Return to Voax</a></div></div></PageFrame>;
  const isAdmin=staffRole==="owner"||staffRole==="admin";
  const nav:[AdminSection,string,string][] = mode==="admin"
    ? [["overview","Overview","zap"],["approvals","Explore approvals","shield"],["reports","Reports","flag"],["bans","Account bans","lock"],["appeals","Ban appeals","inbox"],["servers","Servers","users"],["users","Users","users"],["staff","Staff & roles","shield-check"],["audit","Audit log","inbox"]]
    : [["reports","Reports","flag"],["bans","Account bans","lock"],["appeals","Ban appeals","inbox"]];
  const username=(id:string)=>users.find(user=>user.id===id)?.username||"Unknown user";
  const reportTarget=(item:any)=>item.snapshot?.username||item.snapshot?.author_name||item.snapshot?.server_name||item.target_user_id||item.target_server_id||item.target_message_id||"Unknown target";
  return <PageFrame active={mode==="admin"?"admin":"mod"}><div className="admin-layout">
    <aside className="admin-sidebar"><span className="discovery-eyebrow">VOAX CONTROL CENTER</span><h2>{mode==="admin"?"Administration":"Moderation"}</h2>{nav.map(([id,label,icon])=><button key={id} className={section===id?"active":""} onClick={()=>setSection(id as AdminSection)}><Icon name={icon} size={17}/>{label}{id==="approvals"&&pending.length>0&&<i>{pending.length}</i>}{id==="reports"&&stats.reports>0&&<i>{stats.reports}</i>}{id==="appeals"&&stats.appeals>0&&<i>{stats.appeals}</i>}</button>)}<div className="admin-sidebar-bottom"><a href="/explore"><Icon name="search" size={15}/> Explore</a><a href="/app"><Icon name="chevron" size={15}/> Back to Voax</a></div></aside>
    <main className="admin-content"><header className="admin-header"><div><span className="discovery-eyebrow">VOAX {mode==="admin"?"ADMIN":"MODERATION"} · {staffRole?.toUpperCase()}</span><h1>{nav.find(item=>item[0]===section)?.[1]||"Moderation"}</h1><p>{mode==="admin"?"Manage Voax staff, platform safety and community discovery.":"Review reports and protect the Voax community."}</p></div><button className="discovery-secondary" onClick={()=>void load()}><Icon name="refresh" size={15}/> Refresh</button></header>
      {notice&&<div className="discovery-notice">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      {section==="overview"&&mode==="admin"&&<><div className="admin-stat-grid">{[["Users",stats.users,"users"],["Servers",stats.servers,"users"],["Published listings",stats.listings,"explore"],["Pending approvals",stats.pending,"clock"],["Open reports",stats.reports,"flag"],["Active bans",stats.bans,"lock"],["Open appeals",stats.appeals,"inbox"]].map(([label,value,icon])=><article key={String(label)}><span><Icon name={String(icon)} size={17}/>{label}</span><strong>{formatCount(Number(value))}</strong></article>)}</div><div className="admin-panel"><div className="admin-panel-heading"><h2>Needs your attention</h2><span>Moderation queue</span></div>{reports.filter(item=>item.status==="open").slice(0,5).map(item=><div className="admin-queue-row" key={item.id}><div><strong>{item.target_type} report · {reportTarget(item)}</strong><small>{item.reason} · {new Date(item.created_at).toLocaleDateString()}</small></div><button className="discovery-secondary" onClick={()=>setSection("reports")}>Review</button></div>)}{!reports.some(item=>item.status==="open")&&<p className="admin-muted">No open reports.</p>}</div></>}
      {section==="approvals"&&mode==="admin"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Pending Explore listings</h2><span>{pending.length} awaiting review</span></div>{pending.map(item=><article className="admin-listing-review" key={item.id}><div className="admin-review-banner">{item.banner_url&&<img src={item.banner_url} alt=""/>}</div><div className="admin-review-content"><div className="admin-review-heading"><ServerAvatar name={item.server_name} url={item.icon_url}/><div><h3>{item.server_name}</h3><span>{item.category} · {new Date(item.submitted_at).toLocaleString()}</span></div></div><strong>{item.short_description}</strong><p>{item.full_description}</p><div className="admin-review-actions"><button className="discovery-primary" onClick={()=>void reviewListing(item,"approved")}><Icon name="shield" size={15}/> Approve</button><button className="discovery-danger" onClick={()=>void reviewListing(item,"rejected")}><Icon name="close" size={15}/> Reject</button></div></div></article>)}{!pending.length&&<p className="admin-muted">The approval queue is clear.</p>}</div>}
      {section==="reports"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Community reports</h2><span>{reports.filter(item=>item.status==="open").length} open · {reports.length} total</span></div>{reports.map(item=><article className="admin-report-row" key={item.id}><div><strong>{item.target_type.toUpperCase()} report · {reportTarget(item)}</strong><p>{item.reason}</p>{item.details&&<small>{item.details}</small>}<span>{new Date(item.created_at).toLocaleString()} · {item.status}</span>{item.snapshot?.body&&<blockquote>{String(item.snapshot.body).slice(0,500)}</blockquote>}{Array.isArray(item.snapshot?.attachments)&&item.snapshot.attachments.map((attachment:any,index:number)=><a key={index} href={attachment.url||undefined} target="_blank" rel="noreferrer">{attachment.name||"Reported attachment"}</a>)}</div><div className="admin-report-actions"><button onClick={()=>void reviewReport(item,"reviewing")}>Review</button>{(item.target_user_id||item.snapshot?.author_id)&&<button onClick={()=>void issueBan(item.target_user_id||item.snapshot.author_id)}>Ban user</button>}<button onClick={()=>void reviewReport(item,"resolved")}>Resolve</button><button onClick={()=>void reviewReport(item,"dismissed")}>Dismiss</button></div></article>)}{!reports.length&&<p className="admin-muted">No reports have been submitted.</p>}</div>}
      {section==="bans"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Account bans</h2><span>{bans.filter(item=>item.status==="active").length} active · {bans.length} total</span></div>{bans.map(item=><article className="admin-report-row" key={item.id}><div><strong>{username(item.user_id)} · {item.duration}</strong><p>{item.reason}</p><span>{item.status} · {new Date(item.created_at).toLocaleString()}{item.expires_at?" · Expires "+new Date(item.expires_at).toLocaleString():" · No expiry"}</span></div><div className="admin-report-actions">{item.status==="active"&&isAdmin&&<button onClick={()=>void revokeBan(item.user_id)}>Revoke ban</button>}</div></article>)}{!bans.length&&<p className="admin-muted">No account bans have been issued.</p>}</div>}
      {section==="appeals"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Ban appeals</h2><span>{appeals.filter(item=>item.status==="open").length} open · {appeals.length} total</span></div>{appeals.map(item=><article className="admin-report-row" key={item.id}><div><strong>{username(item.user_id)} · {item.status}</strong><p>{item.message}</p>{item.response&&<small>{item.response}</small>}<span>{new Date(item.created_at).toLocaleString()}</span></div><div className="admin-report-actions"><button onClick={()=>void reviewAppeal(item,"reviewing")}>Review</button>{isAdmin&&<><button onClick={()=>void reviewAppeal(item,"accepted")}>Accept & unban</button><button onClick={()=>void reviewAppeal(item,"rejected")}>Reject</button></>}</div></article>)}{!appeals.length&&<p className="admin-muted">No ban appeals have been submitted.</p>}</div>}
      {section==="servers"&&mode==="admin"&&<><div className="admin-panel"><div className="admin-panel-heading"><h2>Explore listings</h2><span>{allListings.length} total</span></div>{allListings.map(item=><div className="admin-queue-row" key={item.id}><div><strong>{item.server_name}</strong><small>{item.category} · {item.listing_status}{item.listing_enabled?" · visible":" · hidden"}</small></div><button className="discovery-secondary" onClick={()=>void toggleFeatured(item)}>{item.is_featured?"Remove featured":"Feature server"}</button></div>)}{!allListings.length&&<p className="admin-muted">No server listings have been submitted.</p>}</div><div className="admin-panel"><div className="admin-panel-heading"><h2>Servers</h2><span>{servers.length} recently created</span></div><div className="admin-table"><div className="admin-table-head"><span>Server</span><span>Created</span><span>Owner ID</span></div>{servers.map(item=><div className="admin-table-row" key={item.id}><strong>{item.name}</strong><span>{new Date(item.created_at).toLocaleDateString()}</span><code>{item.created_by}</code></div>)}</div></div></>}
      {section==="users"&&mode==="admin"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Users</h2><span>Latest {users.length} accounts</span></div><div className="admin-table"><div className="admin-table-head"><span>Username</span><span>Status</span><span>Joined</span><span>Action</span></div>{users.map(item=><div className="admin-table-row" key={item.id}><strong>{item.username||"Player"}</strong><span>{item.status||"Offline"}</span><span>{new Date(item.created_at).toLocaleDateString()}</span><button className="discovery-danger" onClick={()=>void issueBan(item.id)}>Ban</button></div>)}</div></div>}
      {section==="staff"&&mode==="admin"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Staff & roles</h2><span>{staff.length} staff members</span></div><p className="admin-muted">Owners have full control. Admins can manage moderators. Moderators can review reports and issue temporary bans.</p>{users.map(user=>{const current=staff.find(item=>item.user_id===user.id)?.role as StaffRole|undefined;const isProtected=current==="owner";return <div className="admin-queue-row" key={user.id}><div><strong>{user.username||"Player"}</strong><small>{current?current.toUpperCase():"Member"}</small></div><select aria-label={"Staff role for "+(user.username||"user")} value={current||"member"} disabled={user.id===session.user.id||isProtected||(staffRole==="admin"&&current&&current!=="moderator")} onChange={e=>void assignStaffRole(user.id,e.target.value==="member"?null:e.target.value as StaffRole)}><option value="member">Member</option><option value="moderator">Moderator</option>{staffRole==="owner"&&<><option value="admin">Admin</option><option value="owner">Owner</option></>}</select></div>;})}</div>}
      {section==="audit"&&mode==="admin"&&<div className="admin-panel"><div className="admin-panel-heading"><h2>Administrative activity</h2><span>Latest {audit.length} actions</span></div>{audit.map(item=><div className="admin-audit-row" key={item.id}><span><Icon name="shield" size={15}/></span><div><strong>{item.action.replaceAll("_"," ")}</strong><small>{item.target_type} · {item.target_id||"—"}</small></div><time>{new Date(item.created_at).toLocaleString()}</time></div>)}{!audit.length&&<p className="admin-muted">No administrative actions recorded yet.</p>}</div>}
    </main>
  </div></PageFrame>;
}

export function InvitePreviewCard({code,onJoin,onlineCounts={}}:{code:string;onJoin:()=>void;onlineCounts?:Record<string,number>}) {
  const [preview,setPreview]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;supabase.rpc("get_server_invite_preview",{p_invite_code:code}).then(({data,error})=>{if(!alive)return;setPreview(!error&&data?.[0]?data[0]:null);setLoading(false);});return()=>{alive=false;};},[code]);
  const liveOnlineCount=preview?.server_id?onlineCounts[preview.server_id]??0:0;
  const member=Boolean(preview?.is_member);
  const listing:Listing|undefined=preview?{listing_id:"",server_id:preview.server_id,server_public_id:preview.server_public_id,server_name:preview.server_name,icon_url:preview.icon_url,banner_url:preview.banner_url,short_description:preview.description||"A Voax community",full_description:preview.description||"",category:"Community",tags:[],language:"",owner_id:"",created_at:"",member_count:Number(preview.member_count)||0,online_count:liveOnlineCount,is_featured:false}:undefined;
  return <section className="invite-preview-card invite-preview-card-v2" aria-label="Server invite">
    <div className="invite-preview-cover">{(preview?.banner_url||preview?.server_banner_url)&&<img src={preview.banner_url||preview.server_banner_url} alt=""/>}<span>VOAX INVITE</span></div>
    <div className="invite-preview-content">
      <div className="invite-preview-heading"><ServerAvatar name={preview?.server_name||"Voax server"} url={preview?.icon_url||null}/><div><strong>{loading?"Loading invitation…":preview?.server_name||"Server invitation"}</strong><span>{preview?formatCount(Number(preview.member_count)||0)+" members · "+formatCount(liveOnlineCount)+" online":"Invite link"}</span></div></div>
      <p>{preview?.description?.trim()&&!/^(a voax server|community server|your community)$/i.test(preview.description.trim())?preview.description:"A place for this community to chat and hang out."}</p>
      <div className="invite-preview-footer"><span><Icon name="shield" size={14}/> {preview?"You're invited":"Invite link"}</span>{member&&listing?<button className="btn primary invite-join-button" type="button" onClick={()=>openServerPath(listing)}>Open Server <Icon name="arrowRight" size={14}/></button>:<button className="btn primary invite-join-button" type="button" onClick={onJoin} disabled={loading||!preview}>{loading?"Loading…":"Join Server"} <Icon name="arrowRight" size={14}/></button>}</div>
    </div>
  </section>;
}
