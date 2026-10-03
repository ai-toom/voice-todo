# 声のTo Do

音声で素早く追加できる、iPhone向けの毎日のTo Doリスト（PWA / オフライン対応）。

## 構成
- `index.html` 画面 / `style.css` デザイン
- `date.js` 日本時間の日付計算
- `storage.js` データ保存（localStorage。将来ここを差し替えて同期対応）
- `speech.js` 音声認識（Web Speech API, ja-JP）
- `app.js` 画面と操作
- `manifest.webmanifest` / `sw.js` / アイコンPNG ホーム画面アプリ化・オフライン

## 公開（GitHub Pages）
1. GitHubに新しいリポジトリを作り、このフォルダの中身（すべてのファイル）をアップロード
2. Settings → Pages → Branch: main / root → Save
3. 表示されたURLをiPhoneのSafariで開く → 共有 → 「ホーム画面に追加」

## 更新するとき
`sw.js` の `CACHE` の番号（voice-todo-v1）を上げると、iPhone側に新しい版が反映されます。
