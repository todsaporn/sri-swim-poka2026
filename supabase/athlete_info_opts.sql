-- เพิ่มการจำค่าที่เลือกในหน้าโพสต์ (แบบโพสต์ / รายการที่แสดง) — รันครั้งเดียวต่อจาก athlete_info.sql
alter table public.athlete_info add column if not exists opts jsonb;
alter table private.info_history add column if not exists opts jsonb;

create or replace function public.set_post_opts(p_athlete text, p_opts jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from private.info_roster where athlete = p_athlete) then raise exception 'unknown athlete'; end if;
  if p_opts is not null and (jsonb_typeof(p_opts) <> 'object' or length(p_opts::text) > 200) then raise exception 'bad opts'; end if;
  insert into private.info_history(athlete, opts) select athlete, opts from public.athlete_info where athlete = p_athlete and opts is not null;
  insert into public.athlete_info(athlete, opts, updated_at) values (p_athlete, p_opts, now())
  on conflict (athlete) do update set opts = excluded.opts, updated_at = now();
end $$;

revoke all on function public.set_post_opts(text, jsonb) from public;
grant execute on function public.set_post_opts(text, jsonb) to anon, authenticated;
