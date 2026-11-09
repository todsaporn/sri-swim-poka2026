-- ข้อมูลโพสต์แสดงความยินดี: ชั้นเรียน + รูปเต็มตัว (แชร์ทุกเครื่อง)
-- รันครั้งเดียวใน Supabase > SQL Editor
create schema if not exists private;

create table if not exists public.athlete_info (
  athlete    text primary key,
  cls        text,
  post_img   text,
  updated_at timestamptz not null default now()
);
alter table public.athlete_info enable row level security;
drop policy if exists "read athlete_info" on public.athlete_info;
create policy "read athlete_info" on public.athlete_info for select using (true);
-- ไม่มี policy insert/update/delete: เขียนได้ผ่านฟังก์ชันด้านล่างเท่านั้น

create table if not exists private.info_roster (athlete text primary key);
insert into private.info_roster(athlete) values
  ('กรณ์ศรันย์ จิตต์อารี'),
  ('กันทรากร จรรยาเลิศ'),
  ('คาร์ลิส สถาปนานันท์'),
  ('จักรภัทร ศรีสำเนียม'),
  ('ชญานุช มีชัย'),
  ('ชนนพร มีชัย'),
  ('ชะวโรจน์ ชัยชิตาทร'),
  ('ชัญญา เจี่ยกุญชร'),
  ('ญฤิน เอมวัฒน์'),
  ('ณัฎฐ์โภคิน ชัยชิตาทร'),
  ('ณัฏฐหฤษฎ์ สิงห์ทอง'),
  ('ณัฐลัดดา พิมเสน'),
  ('ณิชาภัทร จึงเจริญสุข'),
  ('ธนิดา ห้าวหาญ'),
  ('นราวิชญ์ จรรยาเลิศ'),
  ('นิชา วรพันธ์'),
  ('ปภิณวิช กิจสวัสดิ์'),
  ('ปวริศา ปรีดาสุทธิ์'),
  ('พรรชน์ชญมน รื่นรวย'),
  ('พาณิภัค น้อยทรง'),
  ('พิมพ์นารา พฤกษ์วรุณ'),
  ('พิมพ์ลดา อินตัน'),
  ('พิมพ์ลภัส อินตัน'),
  ('วชิรวิชญ์ วัฒนสุภิญโญ'),
  ('วรพล วรพันธ์'),
  ('สุภัสสรา เวทีภิรมย์'),
  ('อัญญาดา วัฒนชนม์'),
  ('เกรียงไกร ขอนแก่น')
on conflict do nothing;

create table if not exists private.info_history (
  id bigserial primary key, athlete text, cls text, post_img text, at timestamptz default now()
);

create or replace function public.set_class(p_athlete text, p_cls text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from private.info_roster where athlete = p_athlete) then raise exception 'unknown athlete'; end if;
  if p_cls is not null and length(p_cls) > 16 then raise exception 'class too long'; end if;
  insert into private.info_history(athlete, cls, post_img) select athlete, cls, null from public.athlete_info where athlete = p_athlete;
  insert into public.athlete_info(athlete, cls, updated_at) values (p_athlete, p_cls, now())
  on conflict (athlete) do update set cls = excluded.cls, updated_at = now();
end $$;

create or replace function public.set_post_photo(p_athlete text, p_img text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from private.info_roster where athlete = p_athlete) then raise exception 'unknown athlete'; end if;
  if p_img is not null and (length(p_img) > 3000000 or p_img !~ '^data:image/(png|jpeg|webp);base64,') then raise exception 'bad image'; end if;
  insert into private.info_history(athlete, cls, post_img) select athlete, null, post_img from public.athlete_info where athlete = p_athlete and post_img is not null;
  insert into public.athlete_info(athlete, post_img, updated_at) values (p_athlete, p_img, now())
  on conflict (athlete) do update set post_img = excluded.post_img, updated_at = now();
end $$;

revoke all on function public.set_class(text, text) from public;
revoke all on function public.set_post_photo(text, text) from public;
grant execute on function public.set_class(text, text) to anon, authenticated;
grant execute on function public.set_post_photo(text, text) to anon, authenticated;
