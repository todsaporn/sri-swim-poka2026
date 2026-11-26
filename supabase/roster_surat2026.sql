-- งานสุราษฎร์ธานี 2569: เพิ่มชื่อนักกีฬาเข้ารายชื่อที่อนุญาตให้บันทึกรูป/ข้อมูล (รันครั้งเดียว · รันซ้ำได้ไม่เสียหาย)
do $$
declare col text; n text;
  names text[] := array[
    'กรณ์ศรันย์ จิตต์อารี',
    'กันทรากร จรรยาเลิศ',
    'คาร์ลิส สถาปนานันท์',
    'จักรภัทร ศรีสำเนียม',
    'ชญานุช มีชัย',
    'ชนนพร มีชัย',
    'ชะวโรจน์ ชัยชิตาทร',
    'ชัญญา เจี่ยกุญชร',
    'ณัฎฐ์โภคิน ชัยชิตาทร',
    'ณัฏฐหฤษฎ์ สิงห์ทอง',
    'ณัฐลัดดา พิมเสน',
    'ณิชาภัทร จึงเจริญสุข',
    'ธนภัทร มีมะแม',
    'ธนิดา ห้าวหาญ',
    'นราวิชญ์ จรรยาเลิศ',
    'นิชา วรพันธ์',
    'ปวริศา ปรีดาสุทธิ์',
    'ปุญญพัฒน์ มงกุฎทอง',
    'พชร เจี่ยกุญชร',
    'พรรธน์ชญมน รื่นรวย',
    'พาณิภัค น้อยทรง',
    'พิมพ์ลดา อินตัน',
    'พิมพ์ลภัส อินตัน',
    'ภูภูมิ จงประสิทธิ์',
    'รินรดา ธีระกุล',
    'วชิรวิชญ์ วัฒนสุภิญโญ',
    'อัญญาดา วัฒนชนม์',
    'อาภาภัทร มงกุฎทอง',
    'เกรียงไกร ขอนแก่น',
    'เอวารินทร์ ทุมชาติ'
  ];
begin
  -- รายชื่อสำหรับรูปโปรไฟล์ (private.roster) — ใช้ชื่อคอลัมน์ข้อความคอลัมน์แรกของตาราง
  select column_name into col from information_schema.columns
   where table_schema = 'private' and table_name = 'roster' and data_type = 'text' order by ordinal_position limit 1;
  if col is not null then
    foreach n in array names loop
      execute format('insert into private.roster(%I) select $1 where not exists (select 1 from private.roster where %I = $1)', col, col) using n;
    end loop;
  end if;
  -- รายชื่อสำหรับชั้นเรียน/รูปโพสต์ (private.info_roster)
  foreach n in array names loop
    insert into private.info_roster(athlete) values (n) on conflict do nothing;
  end loop;
end $$;
