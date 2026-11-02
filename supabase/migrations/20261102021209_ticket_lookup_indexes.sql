create index if not exists ticket_panels_server_id_idx on public.ticket_panels(server_id);
create index if not exists tickets_created_by_idx on public.tickets(created_by);
create index if not exists tickets_assigned_to_idx on public.tickets(assigned_to);
create index if not exists ticket_members_user_id_idx on public.ticket_members(user_id);
create index if not exists ticket_members_added_by_idx on public.ticket_members(added_by);
create index if not exists ticket_events_actor_id_idx on public.ticket_events(actor_id);
create index if not exists ticket_transcripts_created_by_idx on public.ticket_transcripts(created_by);