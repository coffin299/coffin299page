# coffin299 - Underwater Archive

`coffin299(ごみぃ)` のポートフォリオです。水没した図書館に残る、個人のデジタルアーカイブとして作品とプロフィールを置いています。

**正規URL:** <https://coffin299.net/>  
**GitHub Pages:** <https://coffin299.github.io/coffin299page/>

---

## コンセプト

深海の図書館を背景に、AIを使った開発、Discord Bot、3DCG、バーチャルワールドの記録をガラスのUIでたどります。奥の図書室と階段に座る人物は別レイヤで視差し、背景の絵が主役です。ナビゲーションとカードだけを半透明にしています。

---

## 特徴

*   **レスポンシブ**: PC とスマートフォン
*   **Liquid Glass**: ナビ、ボタン、カードは半透明のガラス
*   **水中の演出**: WebGPU のコンピュートとポストプロセス。使えない環境では WebGL。どちらも失敗した場合、または動きを減らす設定では `assets/background.png` の静止画
*   **二層の背景**: `background_parallax.png` が奥、`background_avator.png` が階段の上。ポインタとスクロールで奥が大きく動く
*   **品質切替**: ナビの Auto / Low / Still。Low は粒子数、解像度、コンピュート間隔を落とす
*   **GitHub Pages**: Actions による自動デプロイ、カスタムドメイン `coffin299.net`
*   **クリーンURL**: `/` `/pages/about/` `/pages/portfolios/` `/pages/contact/`
*   **SEO / LLM向け**: `sitemap.xml`、`robots.txt`、`llms.txt`、`llms-full.txt`、構造化データ
*   **アイコンと OGP**: タブとプロフィールは `photos/icon.png`、共有カードは `photos/OGP.png`

---

## 使用技術

*   **HTML5**
*   **CSS3**（Custom Properties、Flexbox / Grid、backdrop-filter）
*   **JavaScript (ES6+)**: 品質切替、Intersection Observer、Three.js
*   **Three.js r180**: WebGPURenderer、TSL、GPU コンピュート、描画結果のノード合成。CDN と import map から読み込む。WebGL では同じ系統のシェーダに縮退する
*   **Font Awesome**
*   **GitHub Pages**

---

## ページ

| パス | 内容 |
| --- | --- |
| `/` | ヒーロー、About、作品、連絡先を縦にたどる |
| `/pages/about/` | プロフィールとスキル |
| `/pages/portfolios/` | 作品の全文。メインは VRCast |
| `/pages/contact/` | GitHub / X / Discord / BOOTH |

BOOTH: <https://coffin299.booth.pm/>

---

## セットアップとデプロイ

### ローカル確認

```bash
git clone https://github.com/coffin299/coffin299page.git
cd coffin299page
```

ディレクトリURLのため、静的サーバーを使います。

```bash
npx serve .
```

### GitHub Pages

1. Settings → Pages → Source を **GitHub Actions** に設定
2. `main` へプッシュすると自動デプロイ
3. 公開URL: `https://coffin299.net/`

### LLM / SEO ファイル

| ファイル | 用途 |
| --- | --- |
| `llms.txt` | LLM向けサイトマップ |
| `llms-full.txt` | サイト内容の要約テキスト |
| `sitemap.xml` | 検索エンジン向け |
| `robots.txt` | クロール方針 |

---

## ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。
