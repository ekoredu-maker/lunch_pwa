# 점심 정산 앱 설치 안내

휴대폰 홈 화면에 설치해서 쓰는 점심 정산 앱입니다.
- 화면: GitHub Pages (무료)
- 데이터: Supabase (무료)
- 접속: 모임 비밀번호 하나

처음 설치는 30분 정도 걸리고, 한 번만 하면 됩니다.

---

## 폴더 구성

| 파일 | 내용 |
|---|---|
| `index.html`, `app.js`, `style.css` | 앱 화면 |
| `config.js` | **수파베이스 주소·키를 넣는 곳 (직접 수정)** |
| `manifest.webmanifest`, `sw.js`, `icons/` | 휴대폰 설치(PWA)용 |
| `supabase/schema.sql` | 수파베이스에 한 번 실행할 SQL. 표, 보안 설정, 초기 명단·식당·총무 순번, 10/1 기록이 들어 있음 |

---

## 1단계. 수파베이스 준비 (데이터 저장소)

1. https://supabase.com 에 가입한 뒤 **New project**를 만듭니다.
   - Name: `lunch` (아무 이름이나 괜찮음)
   - Database Password: 아무거나 정하고 따로 적어 두세요. 앱에서는 쓰지 않습니다.
   - Region: **Northeast Asia (Seoul)**
2. 왼쪽 메뉴 **SQL Editor**에서 **New query**를 누릅니다. `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**을 누릅니다.
   - "Success"가 나오면 끝입니다. 다시 실행해도 데이터가 중복되지 않습니다.
3. **모르는 사람의 가입을 막습니다. 꼭 해야 하는 단계예요.**
   - **Authentication → Sign In / Providers**에서 **Allow new users to sign up**을 끄고 저장합니다.
   - 메뉴 이름은 수파베이스 화면 개편에 따라 조금 다를 수 있습니다. "sign up" 허용 설정을 찾아 끄면 됩니다.
4. **모임 공용 계정을 만듭니다.**
   - **Authentication → Users → Add user → Create new user**를 누릅니다.
   - Email: 받을 수 있는 메일 주소 (예: 총무 메일)
   - Password: **모임 비밀번호.** 동료들이 앱에서 입력할 비밀번호입니다.
   - **Auto Confirm User**를 체크하고 만듭니다.
5. **주소와 키를 복사합니다.**
   - **Project Settings → API** 또는 **API Keys** 화면으로 갑니다.
   - **Project URL**과 **anon public** 키를 복사합니다. 화면에 따라 `sb_publishable_...` 로 시작하는 publishable 키로 나올 수 있는데, 그것을 써도 됩니다.
   - ⚠️ `service_role` 이나 `secret` 키는 **절대 넣지 마세요.**

## 2단계. config.js 수정

`config.js` 를 메모장으로 열어 세 줄을 바꿉니다.

```js
SUPABASE_URL: 'https://abcdefgh.supabase.co',     // 5번의 Project URL
SUPABASE_ANON_KEY: 'eyJhbGciOi...',                // 5번의 anon(publishable) 키
GROUP_EMAIL: 'chongmu@example.com',                // 4번에서 만든 계정 이메일
```

> anon 키는 공개돼도 괜찮은 키입니다. 데이터는 모임 비밀번호로 로그인해야만 읽고 쓸 수 있게 막혀 있습니다.

## 3단계. GitHub Pages에 올리기 (앱 주소 만들기)

1. https://github.com 에 가입하고 **New repository**를 누릅니다.
   - Repository name: `lunch`
   - **Public** 선택 (무료 계정은 Public이어야 Pages를 쓸 수 있습니다. 코드만 공개되고 점심 데이터는 공개되지 않습니다.)
2. 저장소 화면에서 **Add file → Upload files**를 누릅니다. 이 폴더의 **파일과 폴더를 전부** 끌어다 놓고 **Commit changes**를 누릅니다.
   - `icons` 폴더까지 함께 올라갔는지 확인하세요.
3. **Settings → Pages**에서 아래처럼 고르고 **Save**를 누릅니다.
   - Source: **Deploy from a branch**
   - Branch: **main**, 폴더 **/(root)**
4. 1~2분 뒤 `https://내아이디.github.io/lunch/` 주소가 생깁니다. 이 주소가 앱 주소입니다.

## 4단계. 휴대폰에 설치

먼저 앱 주소를 엽니다.
- **안드로이드**: 크롬으로 열고 **⋮ 메뉴 → 홈 화면에 추가** (또는 **앱 설치**)
- **아이폰**: **사파리**로 열고 **공유 버튼 → 홈 화면에 추가** (아이폰은 반드시 사파리)

처음 열 때 모임 비밀번호를 한 번 입력하면, 그 뒤로는 바로 열립니다.

단톡방에는 **앱 주소 + 모임 비밀번호**를 공지하면 됩니다.

---

## 사용법 요약

| 탭 | 하는 일 |
|---|---|
| **입력** | 식당 → 먹은 사람 → (다른 금액만 ±) → 결제자 → 저장. 공동분담(배달료 등)은 그날 먹은 사람끼리 나뉩니다. ★ 즐겨찾기는 모두가 함께 씁니다 |
| **내역** | 이번 달 기록. **수정**, **삭제** 가능 |
| **정산** | 내 이름을 누르면 "총무에게 보낼 금액"이 크게 나옵니다. **카톡으로 공유**를 누르면 공지문을 단톡방에 바로 보낼 수 있습니다 |
| **설정** | 이달 총무 변경, 명단(이름·계좌·참여 여부·총무 순번) 수정 |

- **정산 원리**: 내 몫 = 내가 먹은 식대 + (그날 공동분담 ÷ 그날 먹은 인원). 정산액 = 내 몫 − 내가 결제한 금액. 송금액은 10원 단위로 반올림합니다.
- **총무 본인**은 송금하지 않습니다. 받은 돈으로 돌려줄 돈을 보내면 본인 몫이 자동으로 맞습니다.
- **총무 순번**은 2026년 10월부터 15개월치가 미리 들어 있습니다 (이동규 → 김인식 → 오우경 → 강창원 …). 그 뒤의 달은 [설정]에서 고르면 됩니다.

---

## 관리 메모

- **수파베이스 일시정지**: 무료 프로젝트는 일주일 정도 아무도 쓰지 않으면 일시정지될 수 있습니다 (방학 등). 수파베이스 대시보드에서 **Restore**를 누르면 데이터 그대로 다시 켜집니다.
- **비밀번호 바꾸기**: 사람이 나갔을 때는 Authentication → Users에서 공용 계정의 비밀번호를 바꿉니다. 그러면 모두 새 비밀번호로 다시 로그인해야 합니다.
- **백업**: 가끔 수파베이스 **Table Editor**에서 `meals`, `meal_items` 표를 CSV로 내려받아 두면 안심입니다.
- **앱을 고쳐서 다시 올릴 때**: GitHub에서 파일을 바꾼 뒤 `sw.js` 맨 위 `VERSION = 'v1'`을 `'v2'`처럼 올려 주세요. 그래야 휴대폰에 설치된 앱도 새 버전으로 바뀝니다.

---

## v2 업데이트: 점심 신청 + 아침 9시 알림

### 바뀐 점
- **입력** 탭 맨 위에 **오늘 점심 신청 카드**가 생겼습니다. [🍚 신청] / [미신청]을 누르면 모두에게 신청 현황이 보입니다.
- **신청한 사람으로 오늘 기록 시작**을 누르면 신청자가 먹은 사람으로 미리 선택됩니다.
- **설정** 탭에서 **이 휴대폰에서 알림 받기**를 켜면, 평일 아침 9시에 알림이 옵니다. 주말과 `holidays` 표의 공휴일은 건너뜁니다.
  - 안드로이드: 알림에 [🍚 신청] [미신청] 버튼이 나옵니다.
  - 아이폰: 홈 화면에 추가한 앱에서만 알림을 받을 수 있고, 알림을 누르면 앱이 열립니다.

### 설치 순서
1. **SQL**: SQL Editor에서 `supabase/update_v2_rsvp.sql`을 실행합니다.
2. **Edge Function 만들기**
   - Edge Functions → **Deploy a new function → Via Editor**
   - 이름은 `lunch-push`
   - `supabase/functions/lunch-push/index.ts` 내용을 붙여넣고 **Deploy**
3. **JWT 검증 끄기**: 함수의 Details(또는 Settings)에서 **Verify JWT / Enforce JWT verification**을 끕니다. 예약 작업은 대신 비밀값(CRON_SECRET)으로 확인합니다.
4. **Secrets 넣기**: Edge Functions → **Secrets**에 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` 세 개를 추가합니다. 값은 따로 받은 `알림_비밀값.txt`에 있습니다.
5. **예약 만들기**: SQL Editor에서 `알림예약_cron.sql`을 실행합니다. 이 파일은 비밀값이 들어 있어 깃허브에 올리지 않습니다.
6. **앱 파일 올리기**: 깃허브에 `index.html`, `app.js`, `style.css`, `sw.js`, `config.js`를 덮어써서 올립니다.
7. **휴대폰에서 켜기**: 앱 → 설정 → **이 휴대폰에서 알림 받기**
8. **테스트**: SQL Editor에서 `알림테스트.sql`의 첫 줄을 실행하고, 알림이 오는지 확인합니다.

### 관리
- **알림 시간 바꾸기**: `알림예약_cron.sql`의 `'0 0 * * 1-5'`를 바꿉니다. 시간은 UTC 기준이라 한국 시간에서 9시간을 빼야 합니다 (예: 8:30 → `'30 23 * * 0-4'`).
- **10:30 재알림**: 아직 신청/미신청을 고르지 않은 사람에게만 한 번 더 보내려면, cron 파일 아래쪽 주석을 풀고 실행합니다.
- **휴무일 추가**: Table Editor → `holidays` 표에 날짜를 추가합니다.
