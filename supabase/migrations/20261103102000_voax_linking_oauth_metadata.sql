alter table public.discord_oauth_states
 add column if not exists discord_user_id text,
 add column if not exists discord_username text,
 add column if not exists discord_avatar_url text,
 add column if not exists guilds jsonb not null default '[]'::jsonb;
