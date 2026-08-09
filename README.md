# My Portfolio - coffin299

これは、`coffin299(ごみぃ)`のスキルと制作物を紹介するための個人ポートフォリオサイトです。

**正規URL:** <https://coffin299.net/>  
**GitHub Pages:** <https://coffin299.github.io/coffin299page/>

---

## コンセプト

AIコーダーおよび3DCGアーティストとしてのスキルセットと制作プロジェクトを、フラットで読みやすいUIで紹介します。ブランド `coffin299` を第一ビューの中心に据え、システム準拠のライト/ダーク切替に対応しています。

---

## 特徴

*   **レスポンシブデザイン**: PC / タブレット / スマートフォンに対応
*   **システム準拠テーマ**: OSの `prefers-color-scheme` に追従。トグルで手動切替・保持も可能
*   **単色フラットUI**: ページ背景はフラット。グラデーションはカード内アクセントのみ
*   **GitHub Pages対応**: Actions による自動デプロイ、カスタムドメイン `coffin299.net`
*   **SEO / LLM向け**: `sitemap.xml`、`robots.txt`、`llms.txt`、`llms-full.txt`、構造化データ

---

## 使用技術

*   **HTML5**
*   **CSS3**（Custom Properties、Flexbox / Grid、サンセリフのみ: Space Grotesk + DM Sans）
*   **JavaScript (ES6+)**: テーマ切替、Intersection Observer、ナビ同期
*   **Font Awesome**
*   **GitHub Pages**

---

## セットアップとデプロイ

### ローカル確認

```bash
git clone https://github.com/coffin299/coffin299page.git
cd coffin299page
```

`index.html` をブラウザで開きます。

### GitHub Pages

1. Settings → Pages → Source を **GitHub Actions** に設定
2. `main` へプッシュすると自動デプロイ
3. 公開URL: `https://coffin299.net/`（または `https://coffin299.github.io/coffin299page/`）

### LLM / SEO ファイル

| ファイル | 用途 |
| --- | --- |
| `llms.txt` | LLM向けサイトマップ（[llmstxt.org](https://llmstxt.org/)） |
| `llms-full.txt` | サイト内容の要約テキスト |
| `sitemap.xml` | 検索エンジン向け |
| `robots.txt` | クロール方針 |

---

## 今後の展望

*   各プロジェクトの詳細ページ
*   3DCGギャラリーの拡充
*   コンタクトフォームのバックエンド連携

---

## ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。
