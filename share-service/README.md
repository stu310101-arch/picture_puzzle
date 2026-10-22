# 已部署分享服務的核心原始碼

這裡保存目前線上 Sites 服務的 API、短網址處理、D1 結構、遷移與回歸測試。它不會在 GitHub Pages 上執行；Pages 只提供前端，透過根目錄 `config.js` 連接已部署的分享服務。

此資料夾的 API 與短網址處理和本次部署內容同步。

## 行為

- `POST /p` 把照片存入 R2，設定存入 D1，再用 CleanURI 取得直接轉址的短網址。
- `GET /p/:id` 取得固定照片與片數；`GET /s/:id` 導向建立者的遊戲網站。
- 拼圖不設定到期日，也不因舊的 `expires_at` 欄位而過期；只有限速資料會定期清除。
- 重試使用同一個 `requestKey`，保持同一筆照片、片數及短網址。
- 縮網址失敗時保留拼圖，回傳錯誤供前端重試。

## 測試

使用 Node.js 24 以上，在倉庫根目錄執行：

```sh
npm run test:share-service
```

測試使用 Node 內建 SQLite 和模擬 R2，不需要安裝依賴，不會上傳照片或建立真實短網址。

## 維護

`lib/puzzle-api.ts` 匯出 `puzzleApi(request, env, ctx)`，需要 Cloudflare D1 的 `DB` 與 R2 的 `BUCKET` 綁定。正式服務由 Sites 的 Worker 入口呼叫；這個資料夾是核心程式備份，並非完整 Sites 建置專案。完整 Sites 專案另有原始碼壓縮包。

已有的遷移請保留順序，不要修改已套用的 SQL。部署時必須保留現有資料庫與 R2 bucket，否則舊連結無法取回照片。

舊 da.gd 網址不再當成可轉傳的短網址回傳；以相同 requestKey 重新分享會將快取換成 CleanURI。已傳出去的 da.gd 網址本身無法由本站修改。
