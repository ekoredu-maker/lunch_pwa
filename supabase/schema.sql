-- =========================================================
-- 점심 정산 PWA — 수파베이스 스키마 + 초기 데이터
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 [Run] 한 번.
-- (다시 실행해도 안전하도록 IF NOT EXISTS / ON CONFLICT 사용)
-- =========================================================

-- 1) 테이블 ------------------------------------------------
create table if not exists public.members (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  bank        text,
  account     text,
  active      boolean not null default true,   -- 꺼두면 입력 화면에서 숨김 (기록은 유지)
  sort        int not null default 0,          -- 화면 표시 순서
  boss_order  int                              -- 총무 순번 (비우면 총무 제외)
);

create table if not exists public.shops (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  favorite   boolean not null default false,   -- ★ 모임 공용 즐겨찾기
  created_at timestamptz not null default now()
);

create table if not exists public.meals (
  id         bigint generated always as identity primary key,
  date       date not null,
  shop       text not null,
  shared     int  not null default 0 check (shared >= 0),   -- 공동분담(배달료 등): 먹은 사람끼리 나눔
  payer_id   bigint not null references public.members(id),
  memo       text,
  created_at timestamptz not null default now()
);
create index if not exists meals_date_idx on public.meals(date);

create table if not exists public.meal_items (
  meal_id   bigint not null references public.meals(id) on delete cascade,
  member_id bigint not null references public.members(id),
  amount    int not null check (amount >= 0),
  primary key (meal_id, member_id)
);

create table if not exists public.bosses (            -- 월별 총무
  ym        text primary key check (ym ~ '^\d{4}-\d{2}$'), -- 예: 2026-10
  member_id bigint not null references public.members(id)
);

-- 2) 보안: 로그인한 사람(모임 공용 계정)만 읽고 쓰기 -------------
alter table public.members    enable row level security;
alter table public.shops      enable row level security;
alter table public.meals      enable row level security;
alter table public.meal_items enable row level security;
alter table public.bosses     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','shops','meals','meal_items','bosses'] loop
    execute format('drop policy if exists "group_all" on public.%I', t);
    execute format('create policy "group_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

revoke all on public.members, public.shops, public.meals, public.meal_items, public.bosses from anon;
grant select, insert, update, delete on public.members, public.shops, public.meals, public.meal_items, public.bosses to authenticated;

-- 3) 점심 한 끼 저장/수정을 한 번에 처리하는 함수 -----------------
--    p_items 예: [{"member_id":4,"amount":9000},{"member_id":5,"amount":9000}]
create or replace function public.save_meal(
  p_id bigint, p_date date, p_shop text, p_shared int,
  p_payer bigint, p_memo text, p_items jsonb
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare mid bigint;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception '먹은 사람이 없습니다';
  end if;
  if p_id is null then
    insert into meals(date, shop, shared, payer_id, memo)
    values (p_date, trim(p_shop), coalesce(p_shared,0), p_payer, nullif(trim(p_memo),''))
    returning id into mid;
  else
    update meals set date=p_date, shop=trim(p_shop), shared=coalesce(p_shared,0),
                     payer_id=p_payer, memo=nullif(trim(p_memo),'')
     where id=p_id returning id into mid;
    if mid is null then raise exception '기록을 찾을 수 없습니다'; end if;
    delete from meal_items where meal_id = mid;
  end if;
  insert into meal_items(meal_id, member_id, amount)
  select mid, (e->>'member_id')::bigint, (e->>'amount')::int
    from jsonb_array_elements(p_items) e
   where (e->>'amount')::int > 0;
  insert into shops(name) values (trim(p_shop)) on conflict (name) do nothing;
  return mid;
end $$;

revoke all on function public.save_meal(bigint,date,text,int,bigint,text,jsonb) from public, anon;
grant execute on function public.save_meal(bigint,date,text,int,bigint,text,jsonb) to authenticated;

-- 4) 초기 데이터 ---------------------------------------------
-- 명단 (엑셀 2026년 10월 시트 기준). 총무 순번은 교육장님·과장님·센터장님 제외.
insert into public.members(name, sort, boss_order, bank, account) values
  ('교육장님', 1,  null, null, null),
  ('과장님',   2,  null, null, null),
  ('센터장님', 3,  null, null, null),
  ('강창원',   4,  4,    null, null),
  ('송원호',   5,  5,    null, null),
  ('강호산',   6,  6,    null, null),
  ('한영화',   7,  7,    null, null),
  ('김연희',   8,  8,    null, null),
  ('서현원',   9,  9,    null, null),
  ('백기현',   10, 10,   null, null),
  ('이동규',   11, 1,    '농협', '312-0023-0937-11 (카톡송금 lskylsay)'),
  ('김인식',   12, 2,    null, null),
  ('오우경',   13, 3,    null, null)
on conflict (name) do nothing;

-- 식당 (엑셀 '점심식당' 시트). favorite=true 는 처음 즐겨찾기 — 앱에서 ★로 바꿀 수 있음
insert into public.shops(name, favorite) values
  ('청주본가',true),('손안에칼국수',true),('도야짬뽕',true),('두꺼비부대찌개',true),
  ('양지말 해장국',true),('의림만두국',true),
  ('황호식당',false),('김이가반점',false),('경북집',false),('새터손두부마을',false),
  ('맹이네촌가',false),('만수네콩밭',false),('부성식당',false),('이모네집',false),
  ('고향맛집',false),('장대감',false),('대복이네밥집',false),('인사동밥집',false),
  ('대장금',false),('맘모스부대찌개',false),('의정부부대찌개',false),
  ('아리랑전통칼국수',false),('자매해물칼국수',false),('춘양옥',false),('국수무라',false),
  ('서울집',false),('장원순대',false),('황금옥찹쌀순대 하소본점',false),
  ('남원가마솥추어탕',false),('산우리',false),('대림숯불갈비',false),
  ('향화성',false),('청해짬뽕',false),('용천막국수',false),('상동막국수',false),
  ('서민막국수',false),('의림지막국수',false),('꿀참나무',false),('왕손쭈꾸미',false),
  ('바다양푼이동태탕',false),('새터오리촌',false)
on conflict (name) do nothing;

-- 총무 순번: 2026-10 부터 15개월, boss_order 순서대로 돌아가며
insert into public.bosses(ym, member_id)
select to_char(date '2026-10-01' + (i || ' month')::interval, 'YYYY-MM'),
       (select id from public.members
         where boss_order is not null
         order by boss_order
         offset (i % (select count(*) from public.members where boss_order is not null)) limit 1)
  from generate_series(0, 14) as i
on conflict (ym) do nothing;

-- 10월 1일 기록 (엑셀 원본 그대로: 김인식 18,000 = 박제민 손님 포함, 결제 강창원)
do $$
declare mid bigint;
begin
  if not exists (select 1 from public.meals where date = '2026-10-01') then
    insert into public.meals(date, shop, shared, payer_id, memo)
    values ('2026-10-01', '(식당 미기재)', 0, (select id from public.members where name='강창원'), '김인식 18,000 (박제민 포함)')
    returning id into mid;
    insert into public.meal_items(meal_id, member_id, amount)
    select mid, m.id, v.amount
      from (values ('강창원',9000),('송원호',9000),('한영화',9000),('김연희',9000),
                   ('서현원',9000),('이동규',9000),('김인식',18000),('오우경',9000)) as v(name, amount)
      join public.members m on m.name = v.name;
  end if;
end $$;
