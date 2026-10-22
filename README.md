# 片刻 Piece by Piece

繁體中文照片拼圖遊戲。網站本體是純 HTML、CSS、JavaScript，可直接部署到 GitHub Pages，不需要安裝套件或建置。

## 已完成的功能

- 上傳 JPG、PNG、WebP、AVIF；檔案上限 20 MB。完整保留照片，極寬或極高的照片補留白。
- 12／24／48／96 片；依照片比例自動選擇拼圖列數與欄數。
- 開始前顯示完整照片和拼圖分割線。
- 真正有凸凹邊緣的拼圖片；開始後隨機散落於中央拼圖區周圍。
- 手機版中央上方為拼圖區、下方為碎片區，支援拖曳與「先點碎片、再點格子」。
- 拼錯出現紅色提醒，拼對吸附後固定；可整理尚未完成的碎片。
- 原圖參考、計時、進度、音效開關與鍵盤操作。
- 「結束並檢查」檢查是否拼完；尚未完成會顯示剩餘片數。
- 放棄前確認；取消可繼續，確認後自動拼好並顯示「歡迎再次挑戰」。
- 全部拼完自動顯示成功畫面、播放合成掌聲及彩帶。關閉音效／減少動態效果設定會被尊重。
- 儲存到瀏覽器；儲存後顯示分享按鈕。朋友開啟連結會先看到同一張照片及相同片數的預覽。
- 標準連結、壓縮連結、複製連結與支援裝置的系統分享。
- 附可選的 Cloudflare Worker + KV 短網址服務。

## 最快的 GitHub Pages 部署方式

1. 建立 GitHub repository（例如 `photo-puzzle`）。
2. 將本資料夾的內容上傳到 repository 根目錄。根目錄應直接有 `index.html`，不要再多包一層資料夾。
3. 至 **Settings → Pages → Build and deployment**。
4. Source 選 **Deploy from a branch**，Branch 選 **main**，Folder 選 **/ (root)**，按 Save。
5. 等 GitHub 顯示網站網址後開啟，例如 `https://你的帳號.github.io/photo-puzzle/`。
6. 在這個正式網址上傳照片、設定片數、儲存，再按分享。從本機預覽產生的 `localhost`／`127.0.0.1` 連結無法給朋友使用。

不需要 npm build，圖片與程式使用相對路徑，可部署到 repository 子路徑。

官方說明：[建立 GitHub Pages 網站](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

## 壓縮連結與短網址的差別

| 選項 | 是否直接可用 | 儲存位置 | 特性 |
| --- | --- | --- | --- |
| 標準連結 | 是 | 圖片包含在連結 `#p=` 後方 | 較高畫質，連結長；無服務到期限制 |
| 壓縮連結 | 是 | 圖片包含在連結 `#p=` 後方 | 縮小圖片、降低畫質，減少字元數；仍可能有數萬字元 |
| 短網址 | 需要設定下方服務 | 你的 Cloudflare KV | 網址只保留 12 碼代號，照片保存 30 天 |

**壓縮連結不是十幾個字元的短網址。** 照片本身不能在完全無儲存服務的條件下變成任意短的代號並讓其他人還原。標準和壓縮連結會在畫面顯示實際字元數、畫質預覽與限制。複製完整連結到瀏覽器可還原圖片；通訊軟體可能截斷超長網址，因此正式分享建議啟用短網址服務。

範例圖片已放在網站資產中，所以分享範例只需帶名稱與片數，天然就是較短的連結。自訂照片才會內嵌圖片。

壓縮由瀏覽器 Canvas 完成，優先 WebP，不支援時瀏覽器會退回其他支援格式；目前目標瀏覽器為最新版 Chrome、Edge、Firefox、Safari。

任何取得分享連結的人都可以看到照片。標準／壓縮連結的照片不會被本程式上傳到伺服器，但會保留在該連結、收件人的瀏覽器歷史與你選用的通訊服務中。啟用短網址後，按下「建立短網址」會將照片與設定送到你自己設定的 Cloudflare 服務。

## 啟用真正的短網址（可選）

GitHub Pages 仍負責網站；只有短網址資料存放到 Cloudflare。若不設定，遊戲與標準／壓縮連結都能使用；短網址按鈕會顯示尚未啟用，不會偽造一個不能用的網址。

需要 Cloudflare 帳號和 Node.js。請自行確認帳號方案的 KV／Worker 配額，程式沒有寫死免費承諾。

1. 在 `optional-short-links` 資料夾開啟終端機，依序執行：

   ```sh
   npx wrangler@latest login
   npx wrangler@latest kv namespace create PUZZLES
   ```

2. 編輯 `optional-short-links/wrangler.toml`：
   - 將 KV 回傳的 ID 填入 `kv_namespaces.id`。
   - 將 `ALLOWED_ORIGIN` 改成 `https://你的帳號.github.io`，不要加 repository 路徑或結尾斜線；使用自訂網域時填該網域 origin。
   - `ratelimits.namespace_id` 選用自己 Cloudflare 帳號中未使用的正整數。

3. 在同一個資料夾執行：

   ```sh
   npx wrangler@latest deploy
   ```

4. 將部署取得的 Worker 網址填進網站的 `config.js`，例如：

   ```js
   export const SHORT_LINK_API = 'https://piece-by-piece-links.你的子網域.workers.dev';
   ```

5. 將修改後的 `config.js` 上傳回 GitHub。重新整理正式網站後即可「建立短網址」。朋友開啟 `https://你的帳號.github.io/photo-puzzle/#s=12碼代號`，會自動取回照片與設定。

程式已做來源檢查、資料格式驗證、155 KB 請求上限、72 位元隨機 ID、30 天到期和每來源 IP 約每分鐘 6 次建立限制。來源檢查不是登入驗證；這是公開分享服務，大流量使用可額外加入 Cloudflare WAF／Turnstile。IP 限速可能讓共用網路的人共用額度。KV 採最終一致性，跨地區剛建立的連結可能需稍候才讀得到。

你可以在 Cloudflare KV 刪除指定 ID，撤銷該短網址。已傳出的標準／壓縮連結內含照片，無法遠端撤銷。

參考：[KV 入門](https://developers.cloudflare.com/kv/get-started/)、[到期時間](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)、[Worker 限速](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

## 本機預覽與測試

在本資料夾執行：

```sh
python -m http.server 5198
```

開啟 `http://localhost:5198`。此原始碼版本使用 ES modules，不建議直接雙擊 `index.html`；另外提供的單檔版可直接開啟。

Node.js 22 以上可執行不需安裝依賴的測試：

```sh
npm test
```

測試包含片數與方向、相鄰凸凹邊緣、錯誤／正確／完成狀態、落點邊界、中文與 emoji 分享還原、不合法照片拒絕，以及短網址新增／讀取／到期／大小上限／限速。短網址測試使用本機模擬 KV，並不代表已在 Cloudflare 正式部署。

## 檔案

- `index.html`：頁面和對話框。
- `styles.css`：桌面／手機版排版與動畫。
- `app.js`：遊戲互動、照片處理、音效、儲存與分享。
- `core.mjs`：拼圖幾何、判定、資料編解碼。
- `config.js`：可選短網址 API 設定。
- `assets/`：範例照片和 favicon。
- `optional-short-links/`：短網址 Worker 與部署設定。
- `tests/`：不需依賴套件的 Node.js 測試。
- `.nojekyll`：直接提供靜態檔案。

## 素材

範例照片：[Giordano Rossoni / Unsplash](https://unsplash.com/photos/brown-boat-on-lake-near-snow-covered-mountain-during-daytime-nKdPa6zzCTI)，已包含在 `assets/alpine-lake.jpg`。介面字體為 Google Fonts 的 Noto Sans TC／Noto Serif TC；無法連線時使用系統字體。掌聲與放置音效皆由 Web Audio 本機合成，不需要遠端音效檔案。
