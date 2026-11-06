alter table public.discord_channel_links
 add column if not exists discord_welcome_message_template text not null default 'Welcome {user} to {server}!',
 add column if not exists voax_welcome_message_template text not null default 'Welcome {user} to {server}!';