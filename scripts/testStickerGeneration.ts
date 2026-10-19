import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { supportedLocales } from "../src/i18n/index.js";
import { buildStickerAssets } from "../src/services/stickerService.js";

// No config, Telegram or Supabase imports: dummy tags never reach external services.
const outputDir = await mkdtemp(path.join(os.tmpdir(), "polytag-stickers-"));
let configFile: string | undefined;
let configMtime: number | undefined;

for (const locale of supportedLocales) {
  const { png, pdf } = await buildStickerAssets({
    tagId: "PT-TEST0001",
    botUsername: "PolyTagBot",
    deepLink: "https://t.me/PolyTagBot?start=t_PT-TEST0001",
    locale,
  });
  assert(png.length > 0, `${locale}: empty PNG`);
  assert(pdf.length > 0, `${locale}: empty PDF`);

  // Import only after buildStickerAssets has configured fonts and loaded Sharp.
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1500, `${locale}: PNG width`);
  assert.equal(metadata.height, 900, `${locale}: PNG height`);

  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  const { width, height } = document.getPage(0).getSize();
  assert(Math.abs(width - 50 * 72 / 25.4) < 0.000001, `${locale}: PDF width`);
  assert(Math.abs(height - 30 * 72 / 25.4) < 0.000001, `${locale}: PDF height`);

  assert(process.env.FONTCONFIG_FILE, "Fontconfig was not initialized");
  const currentMtime = (await stat(process.env.FONTCONFIG_FILE)).mtimeMs;
  if (configFile) {
    assert.equal(process.env.FONTCONFIG_FILE, configFile, "Fontconfig path changed in a warm runtime");
    assert.equal(currentMtime, configMtime, "Fontconfig was unnecessarily rewritten");
  }
  configFile = process.env.FONTCONFIG_FILE;
  configMtime = currentMtime;

  await writeFile(path.join(outputDir, `PolyTag-${locale}.png`), png);
  await writeFile(path.join(outputDir, `PolyTag-${locale}-50x30mm.pdf`), pdf);
  console.log(`${locale}: PNG 1500 × 900; PDF 50 × 30 mm — passed`);
}

console.log(`All seven locales passed. Review files in: ${outputDir}`);
