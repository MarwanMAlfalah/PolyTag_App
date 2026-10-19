# Bundled sticker fonts

Full, unmodified variable TrueType fonts from the official [Google Fonts repository](https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl), pinned to commit `47d54ca1ebb14fd864695f1d39dc734f39017c33`. Only local filenames were shortened. The matching SIL Open Font License is included for each family.

| Local file | Internal typographic family | Mapped Unicode codepoints | SHA-256 |
| --- | --- | ---: | --- |
| `NotoSans.ttf` | Noto Sans | 3,094 | `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d` |
| `NotoSansArabic.ttf` | Noto Sans Arabic | 1,561 | `63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e` |
| `NotoSansSC.ttf` | Noto Sans SC | 30,890 | `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da` |

Sources (relative to that commit):

- `ofl/notosans/NotoSans[wdth,wght].ttf` → `NotoSans.ttf`
- `ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf` → `NotoSansArabic.ttf`
- `ofl/notosanssc/NotoSansSC[wght].ttf` → `NotoSansSC.ttf`

FontTools inspection verified `A Я ệ ă ư ñ ¿ é ç` in Noto Sans, `ع` in Noto Sans Arabic, and `中 文` in Noto Sans SC. These replace incomplete web subsets (including a Chinese file with only 12 mapped codepoints). Do not replace them with CSS/webfont subsets.

The renderer selects these internal family names, initializes Fontconfig under the OS temporary directory before importing Sharp, and reads fonts from `process.cwd()/assets/fonts`. `vercel.json` includes this directory in API function bundles. No system font installation is needed.

Run `npm run test:stickers` from the repository root to generate all seven PNG/PDF pairs in an OS temporary directory. Review Arabic joining/alignment, Chinese glyphs, accents and print legibility at 50 × 30 mm. The utility checks raster dimensions, PDF page size and warm-runtime configuration reuse without contacting Telegram or Supabase.
