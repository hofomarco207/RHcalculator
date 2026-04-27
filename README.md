# RH 價卡計算器

Fork 自 [iMileratecardCreator](https://github.com/hofomarcohk/iMileratecardCreator)，
針對 RH 公司客製化的物流報價工具。

## 與母專案的差別

| 項目 | iMile | RH |
|------|-------|----|
| 定價模式 | 5 種（segmented / bc_combined / bcd_combined / multi_b / multi_b_b2c） | **僅 bc_combined**（A + BC + D） |
| 供應商段 | A / B / C / D / BC / BCD | **僅 A / BC / D** |
| 定價流程 | 驗價 / 競價 / 方案搜索 三 tab | **僅競價** |
| 價卡結構 | 一國一卡（country-scoped） | **全球單卡**（仿雲途：一卡多國 brackets） |
| 公開介面 | 無 | **`/quote` 公開報價計算器**（無需登入） |
| Admin 認證 | 無（內網） | **Supabase Auth 登入** 才能進管理介面 |
| 客戶寄件數據 | 純歷史出貨 | **加上歷史成本 + 客戶歸屬** |

## 開發

```bash
npm install
cp .env.local.example .env.local  # 填入新 Supabase project 連線
npm run dev
```

詳細開發指南請看 [CLAUDE.md](CLAUDE.md)。
