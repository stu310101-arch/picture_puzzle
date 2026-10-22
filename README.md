# 片刻 Piece by Piece

繁體中文照片拼圖遊戲。網站本體是純 HTML、CSS、JavaScript，可直接部署到 GitHub Pages，不需要安裝套件或建置。

## 已完成的功能

- 上傳 JPG、PNG、WebP、AVIF；檔案上限 20 MB。完整保留照片，極寬或極高的照片補留白。
- 自訂片數：輸入 2～5000 的任意整數，例如 24、100、500、1000 片。不是固定選單。
- 保留輸入的確切數量；質數等難以均勻分格的數量會合併末列的部分格子，完整保留照片，不默默改片數。
- 拼圖桌可放大至 600%，以「移動畫布」模式拖動，提供「找碎片」「回到拼圖區」按鈕；大量碎片使用較高解析度畫布。5000 片在低記憶體裝置上可能較慢。
- 開始前顯示完整照片和拼圖分割線。
- 真正有凸凹邊緣的拼圖片；開始後隨機散落於中央拼圖區周圍。
- 手機版中央上方為拼圖區、下方為碎片區，支援拖曳與「先點碎片、再點格子」。
- 拼錯出現紅色提醒，拼對吸附後固定；可整理尚未完成的碎片。
- 原圖參考、計時、進度、音效開關與鍵盤操作。
- 「結束並檢查」檢查是否拼完；尚未完成會顯示剩餘片數。
- 放棄前確認；取消可繼續，確認後自動拼好並顯示「歡迎再次挑戰」。
- 全部拼完自動顯示成功畫面、播放合成掌聲及彩帶。關閉音效／減少動態效果設定會被尊重。
- 儲存到瀏覽器；儲存後顯示分享按鈕。朋友開啟連結會進入固定挑戰頁：只能玩分享者指定的照片與片數，重新開始亦不能改片數。
- 真正短網址：照片放在分享服務，網址只保留隨機代碼。可選標準／省流量畫質，複製短網址或使用系統分享。
- 電腦、手機、平板遊玩時固定頁面；不跟著拖曳或滑動滾動整個網頁。畫布只在明確切換模式後移動。設定頁與對話框仍可正常捲動閱讀。
- 一般文字、圖片禁止反白選取、長按選單及複製；分享網址可選取／複製，輸入框可正常編輯。這是互動限制，不是 DRM，不能阻止截圖或開發者工具讀取原始碼。
- 附可選的 Cloudflare Worker + KV 短網址服務。

## 最快的 GitHub Pages 部署方式

1. 建立 GitHub repository（例如 `photo-puzzle`）。
2. 將本資料夾的內容上傳到 repository 根目錄。根目錄應直接有 `index.html`，不要再多包一層資料夾。
3. 至 **Settings → Pages → Build and deployment**。
4. Source 選 **Deploy from a branch**，Branch 選 **main**，Folder 選 **/ (root)**，按 Save。
5. 等 GitHub 顯示網站網址後開啟，例如 `https://你的帳號.github.io/photo-puzzle/`。
6. 在正式網址上傳照片、設定片數、儲存，再按分享；會自動建立短網址。朋友開啟後返回你的 GitHub Pages 網頁，載入同一張照片與片數。

不需要 npm build，圖片與程式使用相對路徑，可部署到 repository 子路徑。

官方說明：[建立 GitHub Pages 網站](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

## 真正短網址（已接好服務）

`config.js` 已指向本次建立的分享服務：

`https://pian-ke-share-1023.lhxuan970930.chatgpt.site`

按「分享這份拼圖給朋友」時，照片與設定會送到該服務。再透過 da.gd 產生約 20 個字元的短網址，例如 `https://da.gd/xxxxxx`。不會把整張照片塞進網址；圖片大小或片數不影響網址長度。

縮網址服務的正式說明：[da.gd](https://da.gd/)、[API 操作](https://da.gd/help)。新建立的短網址可能先顯示目的地確認頁，需要點選目的網址；這是該服務的防濫用措施。

- 前端仍可直接放在 GitHub Pages；沒有 API 金鑰寫在前端。
- 照片存在 Cloudflare R2，設定與短網址對應存在 D1，由本次 Sites 專案管理。
- 分享不自動到期，朋友不需登入；持有網址即可查看照片並遊玩。網站、資料儲存與縮網址服務須持續運作，才能維持連結可用。
- 已移除舊的到期檢查及拼圖資料清除流程；仍存在的舊連結也不再受 30 天限制。新資料沒有 TTL；原有到期欄位僅為相容舊資料保留，不參與判斷。
- 服務接收 `https://*.github.io`、本站與本機預覽的請求；GitHub Pages 自訂網域需要另外在服務來源白名單加入該網域。
- 從 GitHub Pages 分享會返回該 GitHub Pages 網站；從本機預覽或單檔版分享會開啟服務所附的遊戲頁面，因此朋友也能使用。
- 網路或服務無法使用時，會明確顯示失敗並提供重試，不會顯示假的短網址。遊戲本身仍可使用。
- 標準畫質和省流量畫質都是短網址；後者只影響照片解析度。原本的 `#p=` 長連結仍可讀取，介面不再產生它。

服務含輸入驗證、155 KB 請求上限、來源檢查、隨機 ID，以及每 IP 每分鐘 15 次建立限制。限速識別是每分鐘輪替的 IP 雜湊；共用網路會共用額度。網站擁有者可透過 Sites 管理服務；服務停用會影響其短網址。縮網址失敗時保留已上傳的拼圖，重試會使用同一筆資料。da.gd 只接收拼圖網址；持有該網址者可讀取對應照片。

## 改用自己的 Cloudflare Worker（可選）

不想使用已接好的分享服務時，可改用隨附的 Worker + KV 版本。此備用版本不依賴 da.gd，產生 GitHub Pages 網址加上 `#s=12碼代號`，會比主要服務的短網址長；新紀錄不設定 TTL。已經由 KV 自動刪除的舊紀錄無法恢復，尚未刪除的舊紀錄在讀取時會取消 TTL。

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

程式已做來源檢查、資料格式驗證、155 KB 請求上限、72 位元隨機 ID、不自動到期和每來源 IP 約每分鐘 6 次建立限制。來源檢查不是登入驗證；這是公開分享服務，大流量使用可額外加入 Cloudflare WAF／Turnstile。IP 限速可能讓共用網路的人共用額度。KV 採最終一致性，跨地區剛建立的連結可能需稍候才讀得到。

你可以在 Cloudflare KV 刪除指定 ID，撤銷該短網址。切換不同服務前，既有短網址仍依賴原先的服務，請保留需要繼續使用的服務。

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

測試包含片數與方向、相鄰凸凹邊緣、錯誤／正確／完成狀態、落點邊界、中文與 emoji 分享還原、不合法照片拒絕，以及短網址新增／讀取／無到期／大小上限／限速。隨附 Worker 單元測試使用模擬 KV。主要服務另外以 SQLite／R2 模擬測試：永久保留、舊資料不過期、照片與片數一致、縮網址失敗重試不重複建立、外部短網址驗證，並透過瀏覽器驗證正式服務。

## 檔案

- `index.html`：頁面和對話框。
- `styles.css`：桌面／手機版排版與動畫。
- `app.js`：遊戲互動、照片處理、音效、儲存與分享。
- `core.mjs`：拼圖幾何、判定、資料編解碼。
- `config.js`：已設定的短網址 API。
- `assets/`：範例照片和 favicon。
- `optional-short-links/`：短網址 Worker 與部署設定。
- `share-service/`：已部署主要服務的核心 API、資料庫遷移和測試；使用 Node.js 24 執行 `npm run test:share-service`。
- `tests/`：不需依賴套件的 Node.js 測試。
- `.nojekyll`：直接提供靜態檔案。

## 素材

範例照片：[Giordano Rossoni / Unsplash](https://unsplash.com/photos/brown-boat-on-lake-near-snow-covered-mountain-during-daytime-nKdPa6zzCTI)，已包含在 `assets/alpine-lake.jpg`。介面字體為 Google Fonts 的 Noto Sans TC／Noto Serif TC；無法連線時使用系統字體。掌聲與放置音效皆由 Web Audio 本機合成，不需要遠端音效檔案。
