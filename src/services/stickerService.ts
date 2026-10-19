import QRCode from "qrcode";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import type { Locale } from "../i18n/index.js";
import { PDFDocument } from "pdf-lib";

function configureFonts() {
  export async function buildStickerAssets(input: {
  tagId: string;
  deepLink: string;
  botUsername: string;
  locale: Locale;
}): Promise<StickerAssets> {
  configureFonts();

  const { default: sharp } = await import("sharp");

  // ...
}
  const fontDir = path.join(process.cwd(), "assets", "fonts");

  const configDir = path.join(os.tmpdir(), "polytag-fontconfig");
  const cacheDir = path.join(os.tmpdir(), "polytag-font-cache");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const configFile = path.join(configDir, "fonts.conf");

  fs.writeFileSync(
    configFile,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <config></config>
</fontconfig>`,
    "utf8",
  );

  process.env.FONTCONFIG_PATH = configDir;
  process.env.FONTCONFIG_FILE = configFile;
  process.env.PANGOCAIRO_BACKEND = "fontconfig";
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
}): Promise<StickerAssets> {
  const qrDataUrl = await QRCode.toDataURL(input.deepLink, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width: 520,
    color: { dark: "#111111", light: "#FFFFFF" },
  });

  // 5:3 aspect ratio. Designed for a 50 x 30 mm print at 100% scale.
  const width = 1500;
  const height = 900;
  const safeTagId = escapeXml(input.tagId);
  const safeUsername = escapeXml(input.botUsername);
  const universityGreen = "#35B233";
  const dark = "#111111";

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1500" height="900" rx="72" fill="#FFFFFF"/>
    <rect x="15" y="15" width="1470" height="870" rx="60" fill="none" stroke="${universityGreen}" stroke-width="14"/>
    <rect x="15" y="15" width="1470" height="105" rx="55" fill="${universityGreen}"/>
    <rect x="15" y="75" width="1470" height="45" fill="${universityGreen}"/>

    <text x="75" y="84" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="800" fill="#FFFFFF">PolyTag</text>
    <text x="1405" y="82" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">UNIVERSITY LOST &amp; FOUND</text>

    <rect x="55" y="155" width="610" height="610" rx="34" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="4"/>
    <image href="${qrDataUrl}" x="95" y="195" width="530" height="530"/>

    <text x="735" y="225" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="${dark}">НАЙДЕНО? / FOUND THIS ITEM?</text>

    <rect x="735" y="275" width="650" height="76" rx="26" fill="#EAF8EA"/>
    <text x="1060" y="326" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#218C2C">SAFE QR • БЕЗОПАСНЫЙ QR</text>

    <text x="735" y="410" font-family="Arial, Helvetica, sans-serif" font-size="37" font-weight="700" fill="${dark}">Opens only @${safeUsername}</text>
    <text x="735" y="462" font-family="Arial, Helvetica, sans-serif" font-size="31" fill="#333333">Только связь с владельцем • Owner contact only</text>
    <text x="735" y="512" font-family="Arial, Helvetica, sans-serif" font-size="31" fill="#333333">No password • No login code • No payment</text>

    <rect x="735" y="565" width="650" height="105" rx="25" fill="#F3F6F3"/>
    <text x="1060" y="633" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800" letter-spacing="3" fill="${dark}">${safeTagId}</text>

    <text x="735" y="725" font-family="Arial, Helvetica, sans-serif" font-size="27" fill="#4B5563">Check destination: t.me/${safeUsername}</text>
    <text x="735" y="765" font-family="Arial, Helvetica, sans-serif" font-size="27" fill="#4B5563">Не хотите сканировать? Откройте бот и введите ID.</text>
    <text x="735" y="810" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#218C2C">RU • EN • AR • 中文 • VI • ES • FR</text>
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
