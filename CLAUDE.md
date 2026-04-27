@AGENTS.md

# RH 價卡計算器 — 開發指南

## 專案定位

RH 公司專用的物流報價工具，**從 [iMileratecardCreator](https://github.com/hofomarcohk/iMileratecardCreator) fork 而來**（commit `722a4ba`），但有三項根本差異：

1. **全球單卡**：一張價卡涵蓋全球各國（仿雲途格式：一卡多國 brackets），不再一國一卡
2. **公開報價介面**：`/quote` 公開頁面，未登入訪客可直接輸入「目的國 + 重量」拿到對外報價（看不到成本/毛利/vendor）
3. **管理員登入**：所有現有管理介面（方案/供應商/競對價卡/設定）放到 `/admin/*` 之下，需 Supabase Auth 登入

---

## Tech Stack（沿用 iMile）

| 層次 | 套件 | 版本 |
|------|------|------|
| Framework | Next.js (App Router) | 16.2.1 |
| Runtime | React | 19.2.4 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS v4 | — |
| UI 元件 | shadcn/ui (Radix UI 底層) | — |
| 資料庫 | Supabase (`@supabase/ssr`) | — |
| Auth | Supabase Auth | — |
| Toast | sonner | — |

---

## 與母專案的差別總覽

| 項目 | iMile | RH |
|------|-------|----|
| pricing_mode | segmented / bc_combined / bcd_combined / multi_b / multi_b_b2c | **僅 bc_combined** |
| Vendor segments | A / B / C / D / BC / BCD | **僅 A / BC / D** |
| 定價分析 tabs | 驗價 / 競價 / 方案搜索 | **僅競價** |
| 價卡 schema | `rate_cards` country-scoped + brackets[] | **`rate_cards` 全球 + `rate_card_country_brackets` 子表** |
| Scenario | country_code 必填 | 全球（無 country_code） |
| Auth | 無 | Admin 登入 + 公開 `/quote` |
| 客戶/成本 | `historical_shipments` 只有 zip + weight | 加 `actual_cost_hkd` + `customer_id` + `customers` 表 |

---

## 從 iMile 直接搬來的東西（**保留**）

不要動這些，邏輯完全沿用：

- **TabContext + Sidebar + TabBar + TabContent**（多 tab 架構）
- **i18n**（`lib/i18n/*` — 中英對照）
- **shadcn/ui 元件**（`components/ui/*`）
- **Supabase clients**（`lib/supabase/*`）
- **Exchange rate widget**（`lib/context/exchange-rate-context.tsx` + `components/layout/ExchangeRateWidget.tsx`）
- **競對價卡完整功能**（`competitor_rate_cards` 表 + 版本化 + A/C 價 + import dialog + compare dialog）
  - 包含 `lib/excel/competitor-importer.ts`（雲途 + ECMS parser）
  - 包含 `components/settings/CompetitorImportDialog.tsx`（A/C 價 tier toggle）
  - 包含設定頁的競對價卡 tab（外層摺疊 + inline rename）
- **A 段加法式邏輯**（per_kg + per_piece + bubble_ratio）
- **BC 段邏輯**（rate_per_kg × weight + handling_fee + bc_bubble_ratio）
- **`computeScenarioCostBCCombined()` 計算函式**（lib/calculations/scenario.ts 內的這一條）
- **Pricing Pipeline 的競價步驟**（CompeteStep1-5）
- **Excel exporter / compete-exporter**
- **Weight break 模組**

---

## Phase 0：專案啟動（先做）

### 0.1 環境設定
1. 建立新 Supabase project（不要共用 iMile 的）
2. 複製 `.env.local.example` → `.env.local`，填入新 project 連線
3. `npm install`
4. 確認 `npm run build` 通過（會是 iMile 的完整 build，phase 1 會精簡）

### 0.2 Supabase Auth 設定
1. Supabase dashboard → Authentication → Providers，啟用 Email + Password
2. 手動建立第一個 admin user（Supabase dashboard → Authentication → Users → Add user）
3. 暫時不啟用 sign-up，避免任意人註冊（後台只給內部用）

### 0.3 整合 migrations
- `supabase/migrations/` 從 iMile 搬來 016-040 共多個 migration 檔
- 在新 Supabase 上**不要**逐個跑（很多是針對舊 schema 的增量改動）
- 改寫一個乾淨的 `001_initial_schema.sql` 整合**只 RH 需要的表**：
  - `vendors`（segments: A / BC / D 三種）
  - `vendor_a_rates`（含 bubble_ratio）
  - `vendor_bc_rates`
  - `vendor_d_rates` / `vendor_d_tiered_rates` / `vendor_d_lookup_rates` / `vendor_d_lookup_area_countries`（看 D 段選哪種模型）
  - `exchange_rates`（含 jpy_hkd）
  - `scenarios`（去掉 country_code、B 段、B2 段相關欄位）
  - `competitor_rate_cards`（完整保留版本化欄位）
  - `rate_cards` + `rate_card_country_brackets`（**新 schema，見 Phase 2**）
  - `customers`（**新表，見 Phase 3**）
  - `historical_shipments`（加 actual_cost_hkd + customer_id 欄位）
  - `weight_break_datasets` + `weight_break_entries`
- 跑完之後刪掉 016-040 那一坨

---

## Phase 1：清理（**新 session 第一件事**）

照下面清單刪檔，然後改 type 錯誤直到 `tsc --noEmit` + `next build` 過。

### 刪除清單

#### app/api/
- [ ] `app/api/scenarios/[id]/optimize/route.ts` — US zone-based optimizer
- [ ] `app/api/zone-mappings/` — 整個資料夾
- [ ] `app/api/evaluate/` — Tab1 驗價
- [ ] `app/api/scout/` — Tab3 方案搜索
- [ ] `app/api/vendors/[id]/b-rates/` — B 段
- [ ] `app/api/vendors/[id]/c-rates/` — C 段（注意：BC 段保留）
- [ ] `app/api/countries/` — 國家管理（國家用 hardcoded seed 即可）
- [ ] `app/api/gateways/` — 口岸（不需要）
- [ ] `app/api/carriers/` — 承運商（不需要）

#### lib/
- [ ] `lib/calculations/optimizer.ts`
- [ ] `lib/calculations/evaluate.ts`
- [ ] `lib/calculations/scout.ts`
- [ ] `lib/excel/last-mile-parser.ts` — US zone parser

#### lib/calculations/scenario.ts（保留檔案，刪函式）
- [ ] 刪 `computeScenarioCost`（segmented）
- [ ] 刪 `computeScenarioCostBCDCombined`
- [ ] 刪 `computeScenarioCostMultiB`
- [ ] 刪 `computeScenarioCostMultiBB2C`
- [ ] 路由 switch 只剩 `bc_combined`
- [ ] **保留** `computeScenarioCostBCCombined`

#### components/
- [ ] `components/pricing-analysis/EvaluateTab.tsx`
- [ ] `components/pricing-analysis/ScoutTab.tsx`
- [ ] `components/pricing-analysis/PricingAnalysisPage.tsx` 改成只有 PricingPipeline tab
- [ ] `components/scenarios/SegmentBConfig.tsx`
- [ ] `components/scenarios/SegmentCConfig.tsx`
- [ ] `components/vendors/BRatePanel.tsx`
- [ ] `components/vendors/BRateSimplePanel.tsx`
- [ ] `components/vendors/CRatePanel.tsx`
- [ ] `components/vendors/CRateSimplePanel.tsx`
- [ ] `components/vendors/BRateCompareDialog.tsx`
- [ ] `components/vendors/BSurchargeEditor.tsx`
- [ ] `components/settings/ZoneMappingsTab.tsx`
- [ ] `app/data/last-mile/` — US zone-based 上傳頁
- [ ] `app/data/air-freight/` — 視情況（如果不用了）

#### types/
- [ ] `types/vendor.ts` — 移除 `VendorBRate`、`VendorCRate`、`VendorBCDRate`、`BSurcharge`
- [ ] `types/scenario.ts` — 移除 B2 相關欄位、multi_b/multi_b_b2c pricing_mode、country_code

#### 設定頁
- [ ] 移除「國家」「口岸」「承運商」三個 tab
- [ ] **保留**「競對價卡」「分區管理」（暫保留，Phase 2 看是否需要）「匯率」

### 刪完後預期
- `tsc --noEmit` 通過
- `next build` 通過
- 介面只剩 5 個主要功能：方案 / 供應商（A/BC/D）/ 競對價卡 / 定價流程（只有競價）/ 價卡 / 出貨數據 / 設定

---

## Phase 2：全球化價卡 schema（核心改動）

仿雲途格式：一張卡多國 brackets。

### DB schema

```sql
-- 主檔：一個 product（如「RH 全球小包」）
CREATE TABLE rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,             -- 內部代碼，如 'RH-GLOBAL-A'
  product_name text NOT NULL,             -- 顯示名稱，如 'RH 全球小包'
  scenario_id uuid REFERENCES scenarios(id),  -- 來源方案
  source text NOT NULL DEFAULT 'scenario', -- 'scenario' | 'manual'
  currency text NOT NULL DEFAULT 'HKD',
  fuel_surcharge_pct numeric NOT NULL DEFAULT 0,
  weight_step numeric NOT NULL DEFAULT 0,  -- 0 = 線性，0.5 = 0.5kg 階梯
  -- 版本化（沿用 iMile migration 040 那套）
  version int NOT NULL DEFAULT 1,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  is_current boolean NOT NULL DEFAULT true,
  -- soft delete
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_cards_version_key UNIQUE (product_code, version)
);

-- 子檔：每國一筆，存該國的所有 brackets
CREATE TABLE rate_card_country_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid NOT NULL REFERENCES rate_cards(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  country_name_en text NOT NULL,
  country_name_zh text,
  brackets jsonb NOT NULL,                 -- [{weight_min, weight_max, rate_per_kg, reg_fee, cost_hkd}, ...]
  -- cost_hkd 是 admin 才看得到的成本，public API 不返回
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_country_unique UNIQUE (rate_card_id, country_code)
);

-- Trigger：新版本插入時自動把舊版 valid_to=today + is_current=false（沿用 iMile 040 那個 trigger）
```

### Scenario 改動
- `scenarios` 表去掉 `country_code` 欄位
- 計算流程：
  1. 用戶建一個全球 scenario（A vendor + BC vendor + D vendor 全選好）
  2. 計算引擎跑「全球國家清單 × 6 個 representative weights」 → 產出每國成本表
  3. 進 Pricing Pipeline 套毛利 → 產出每國的 brackets
  4. 一鍵存成 `rate_cards`（一筆主檔 + N 筆 country_brackets）

### 計算引擎改寫重點
- `lib/api-helpers/scenario-data-loader.ts` 不再依賴 `country_code` 載入 vendor，要改成接收國家清單
- `computeScenarioCostBCCombined` 要能對 N 個國家分別跑
- D 段的 country lookup 邏輯（依 D 段模型決定）：
  - **lookup_table（D-6）**：`vendor_d_lookup_area_countries` 把國家映射到 area，每 area × weight 一個價
  - **tiered_per_kg（D-5）**：每國 × 重量段一筆
  - **first_additional**：每國一個首重續重表
  - **per_piece**：固定費

### Pricing Pipeline 改動
- Step 1：選 scenario（已是全球）→ 拿到全球 cost map
- Step 2：選對標雲途/ECMS 價卡（同樣是全球結構，可逐國比）
- Step 3-4：套毛利（可全球統一 % 或按國家覆寫）
- Step 5：存 rate_cards（一鍵全球 commit）

---

## Phase 3：客戶 + 歷史成本

### DB schema

```sql
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE historical_shipments
  ADD COLUMN actual_cost_hkd numeric,        -- 該票實際成本（HKD）
  ADD COLUMN customer_id uuid REFERENCES customers(id),
  ADD COLUMN ship_date date;
```

### UI
- 設定頁加「客戶」tab：CRUD
- `app/data/shipments/` 上傳介面加：選客戶、加成本欄位

---

## Phase 4：Auth + 公開介面

### Admin 認證
1. 路由結構搬遷：所有現有 page 從 `/scenarios`、`/vendors`… 改放到 `/admin/scenarios`、`/admin/vendors`…
2. `app/admin/layout.tsx` 加 middleware：Supabase Auth check，未登入 redirect `/admin/login`
3. `app/admin/login/page.tsx` — 簡單 email/password 表單

### Public 報價介面
1. `app/quote/page.tsx` — 主介面：
   - 國家下拉（hardcoded country list 或從 `rate_card_country_brackets` 拉現有國家）
   - 重量輸入
   - 顯示：`rate_per_kg × weight + reg_fee = total`，幣別切換
   - 燃油附加費可選顯示
2. `app/api/public/quote/route.ts` — read-only API：
   - `GET /api/public/quote?country=US&weight=0.5`
   - 內部：查 `rate_cards` 拿 `is_current=true` 的最新版 + 該國 `rate_card_country_brackets`
   - **絕對不返回**：`cost_hkd`、`vendor_*`、`scenario_*`、`product_code`
   - **可返回**：`rate_per_kg`、`reg_fee`、`total_price`、`currency`、`fuel_surcharge_pct`
3. RLS policy（Supabase 設定）：
   ```sql
   -- anon role 只能 SELECT 必要欄位
   CREATE POLICY public_read_brackets ON rate_card_country_brackets
     FOR SELECT TO anon
     USING (
       EXISTS (SELECT 1 FROM rate_cards WHERE rate_cards.id = rate_card_country_brackets.rate_card_id
               AND rate_cards.is_current = true AND rate_cards.deleted_at IS NULL)
     );
   ```
   並用 view 或 RPC 限制只暴露安全欄位（不暴露 `cost_hkd`）。

### 路由總覽

| 路由 | 認證 | 用途 |
|------|------|------|
| `/quote` | 公開 | 客戶報價計算器 |
| `/admin/login` | 公開 | 管理員登入 |
| `/admin/scenarios` | 需登入 | 方案分析 |
| `/admin/vendors` | 需登入 | 供應商（A/BC/D） |
| `/admin/competitor` | 需登入 | 定價分析（競價） |
| `/admin/rate-cards` | 需登入 | 價卡列表 + 編輯 |
| `/admin/customers` | 需登入 | 客戶管理 |
| `/admin/data/shipments` | 需登入 | 歷史出貨 |
| `/admin/settings` | 需登入 | 系統設定（競對價卡、匯率） |

---

## 還沒決定的事

### D 段定價模型
RH 用的尾程供應商目前**還沒拿到報價單**。先決定資料結構方向：
- **lookup_table（推薦）**：area × weight 查表（最像雲途，未來新增國家容易）
- **tiered_per_kg**：每國 × 重量段一筆（粒度細，但表會很大）
- **first_additional**：每國首重續重（適合區域型尾程）
- **per_piece**：固定費（如墨西哥）

**建議**：先建 lookup_table 通用結構（Phase 2 schema 用 D-6），拿到報價後再 1-2 小時補資料。

### 公開介面要不要做 i18n
RH 客戶可能是國際的 → 公開介面預設英文 + 中文切換。Admin 介面維持中文為主。

### 公開介面要不要 rate limit
匿名 access 可能被爬 → 加個簡單 rate limit（IP-based，每分鐘 30 次）。
建議用 Vercel KV / Upstash Redis（不要花錢就用 in-memory map，重啟會清）。

---

## 與 iMile 同步策略

iMile 的競對價卡功能會持續演化（雲途報價有新格式、新功能）。建議：
- **不做 monorepo**（差異太大）
- **手動 cherry-pick**：iMile 改了 `competitor_rate_cards` 相關檔案時，到這邊手動拉過來：
  - `lib/excel/competitor-importer.ts`
  - `components/settings/CompetitorImportDialog.tsx`
  - `app/api/competitor-rate-cards/`
  - 設定頁的 CompetitorTab 區塊
- 計算引擎、scenarios、vendor 管理 → 各自演化，不同步

---

## 環境變數

`.env.local`（gitignored）必須有：
```
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 開發起手式（給新 session 的 Claude）

第一次進這個 repo，依序做：
1. 讀完這份 CLAUDE.md
2. `npm install` + 確認 `npm run build` 通過（建議 build 過了再開始砍）
3. 進 Phase 0.3：寫 `001_initial_schema.sql`
4. 進 Phase 1：照刪除清單砍，`tsc --noEmit` 通過為止
5. 進 Phase 2：寫新 rate_cards schema + scenarios 全球化
6. Phase 3 / 4 / 5 依需要

每完成一個 phase 跑 `npm run build` 確保沒破。

---

## 母專案參考

**iMile CLAUDE.md** 在 `/Volumes/External/iMile/AI工具相關/iMileratecardCreator/CLAUDE.md`，
記錄了所有 migration 細節、計算引擎架構、UI 慣例 — 遇到不確定的歷史脈絡先去那邊查。
