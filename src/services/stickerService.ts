import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { stickerMessages, type Locale } from "../i18n/index.js";

let fontsConfigured = false;

function configureFonts() {
  if (fontsConfigured) return;
  const fontDir = path.join(process.cwd(), "assets", "fonts");
  for (const filename of ["NotoSans.ttf", "NotoSansArabic.ttf", "NotoSansSC.ttf"]) {
    const fontPath = path.join(fontDir, filename);
    if (!fs.existsSync(fontPath) || !fs.statSync(fontPath).isFile()) {
      throw new Error(`PolyTag sticker font missing: ${fontPath}. Bundle assets/fonts/** with the function.`);
    }
  }

  // Each runtime owns its writable config/cache; never write to the deployment bundle.
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "polytag-fontconfig-"));
  const cacheDir = path.join(configDir, "cache");
  fs.mkdirSync(cacheDir);

  const configFile = path.join(configDir, "fonts.conf");

  fs.writeFileSync(
    configFile,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(fontDir)}</dir>
  <cachedir>${escapeXml(cacheDir)}</cachedir>
  <config></config>
</fontconfig>`,
    "utf8",
  );

  process.env.FONTCONFIG_PATH = configDir;
  process.env.FONTCONFIG_FILE = configFile;
  process.env.PANGOCAIRO_BACKEND = "fontconfig";
  fontsConfigured = true;
}

export type StickerAssets = {
  png: Buffer;
  pdf: Buffer;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function buildStickerAssets(input: {
  tagId: string;
  deepLink: string;
  botUsername: string;
  locale: Locale;
}): Promise<StickerAssets> {
  configureFonts();
  // Fontconfig must be set before libvips/Pango is first loaded.
  const { default: sharp } = await import("sharp");
  const qrDataUrl = await QRCode.toDataURL(input.deepLink, {
    errorCorrectionLevel: "Q",
    margin: 4,
    width: 590,
    color: { dark: "#111111", light: "#FFFFFF" },
  });

  // 5:3 aspect ratio. Designed for a 50 x 30 mm print at 100% scale.
  const width = 1500;
  const height = 900;
  const safeTagId = escapeXml(input.tagId);
  const safeUsername = escapeXml(input.botUsername);
  const universityGreen = "#35B233";
  const dark = "#111111";
  const copy = stickerMessages[input.locale];
  const fontFamily = input.locale === "ar"
    ? "Noto Sans Arabic, Noto Sans"
    : input.locale === "zh" ? "Noto Sans SC, Noto Sans" : "Noto Sans";
  const rtl = input.locale === "ar";
  // SVG 'start' is the right edge for RTL text; technical values stay LTR.
  const localized = `font-family="${fontFamily}" direction="${rtl ? "rtl" : "ltr"}" unicode-bidi="embed" text-anchor="start"`;
  const textX = rtl ? 1385 : 735;
  const headingSize = Math.min(46, Math.floor(650 / (Array.from(copy.found).length * 0.75)));
  const scanLines = copy.scan.split("\n").map((line, index) =>
    `<text x="${textX}" y="${425 + index * 58}" ${localized} font-size="34" fill="#333333">${escapeXml(line)}</text>`,
  ).join("\n");

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1500" height="900" rx="72" fill="#FFFFFF"/>
    <rect x="15" y="15" width="1470" height="870" rx="60" fill="none" stroke="${universityGreen}" stroke-width="14"/>
    <rect x="15" y="15" width="1470" height="105" rx="55" fill="${universityGreen}"/>
    <rect x="15" y="75" width="1470" height="45" fill="${universityGreen}"/>

    <text x="75" y="84" font-family="Noto Sans" direction="ltr" font-size="60" font-weight="800" fill="#FFFFFF">PolyTag</text>

    <rect x="55" y="155" width="610" height="610" rx="34" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="4"/>
    <image href="${qrDataUrl}" x="65" y="165" width="590" height="590"/>

    <text x="${textX}" y="225" ${localized} font-size="${headingSize}" font-weight="800" fill="${dark}">${escapeXml(copy.found)}</text>

    <rect x="735" y="275" width="650" height="76" rx="26" fill="#EAF8EA"/>
    <text x="${rtl ? 1355 : 765}" y="326" ${localized} font-size="34" font-weight="800" fill="#218C2C">${escapeXml(copy.safe)}</text>

    ${scanLines}

    <rect x="735" y="565" width="650" height="105" rx="25" fill="#F3F6F3"/>
    <text x="1060" y="633" text-anchor="middle" font-family="Noto Sans" direction="ltr" font-size="48" font-weight="800" letter-spacing="3" fill="${dark}">${safeTagId}</text>

    <text x="1060" y="735" text-anchor="middle" font-family="Noto Sans" direction="ltr" font-size="36" font-weight="700" fill="#218C2C">@${safeUsername}</text>
    <text x="${rtl ? 1385 : 75}" y="835" ${localized} font-size="32" fill="#4B5563">${escapeXml(copy.noSecrets)}</text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  const pdfDoc = await PDFDocument.create();
  const mmToPt = (mm: number) => (mm * 72) / 25.4;
  const pageWidth = mmToPt(50);
  const pageHeight = mmToPt(30);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const embedded = await pdfDoc.embedPng(png);
  page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  const pdfBytes = await pdfDoc.save();
  return { png, pdf: Buffer.from(pdfBytes) };
}
