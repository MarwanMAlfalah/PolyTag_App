# PolyTag v0.6.1 — Vercel/Webhook Beta

This version is prepared for Vercel serverless deployment. Temporary Telegram conversation state is persisted in Supabase so multi-step flows continue across serverless invocations.

Run `supabase/migrations/v0.6.1-vercel.sql` once before deploying. Add `WEBHOOK_SECRET_TOKEN` to both your local `.env` and Vercel environment variables.

For local polling, first run `npm run webhook:delete`. For production, deploy to Vercel and then run `npm run webhook:set -- https://YOUR-PROJECT.vercel.app/api/bot`.

---

# PolyTag v0.6 — International & Trust Edition

PolyTag v0.6 keeps the v0.5 Lost Mode and adds a sustainable multilingual UX, persistent language preferences, and a trust-first QR design for campus use.

## What is new

- Default interface language: **Russian**.
- Persistent language selection for:
  - 🇷🇺 Russian
  - 🇬🇧 English
  - 🌙 Arabic
  - 🇨🇳 Chinese
  - 🇻🇳 Vietnamese
  - 🇪🇸 Spanish
  - 🇫🇷 French
- `/language` command and `🌐 Language` button.
- A finder can change language directly from a scanned tag without navigating the full bot.
- Owner notifications are sent in the **owner's preferred language**; finder confirmations use the **finder's preferred language**.
- `🛡 QR safety` explanation in the bot.
- Redesigned 50×30 mm QR sticker with university-inspired green identity and visible safety checks:
  - QR opens only the official Telegram bot.
  - Visible `t.me/<bot username>` destination.
  - No password, login code, card data, or payment is requested.
  - Manual PolyTag ID fallback.
  - Seven supported languages shown on the tag.
- QR error-correction level increased to **Q** for better physical scan reliability.
- Finder-only scans are not forced to create a full PolyTag account record unless the finder chooses a language or uses account features.
- v0.5 Lost Mode is preserved:
  - ACTIVE → LOST → FOUND → RECOVERED
  - `lost_reports`
  - recovery confirmation
  - event logging

## Upgrade from v0.5

Do **not** rerun `schema.sql` on your existing database.

Open Supabase:

`SQL Editor → New query`

Then run:

`supabase/migrations/v0.6.sql`

This preserves existing users, items, tags, found reports, lost reports, and events.

The migration:

- adds `app_users.language_selected`
- changes the default locale to `ru`
- sets existing v0.5 users to Russian as their initial interface language
- restricts saved locales to the seven supported languages

## Run locally

Copy your existing environment file from v0.5:

```bash
cd ~/Downloads/polytag-bot-v0.6
cp ../polytag-bot-v0.5/.env .env
npm install
npm run dev
```

Expected output:

```text
Checking Supabase connection...
Supabase database is ready.
PolyTag bot is running as @PolyTagBot
```

## Recommended test

1. `/start` → interface should initially be Russian.
2. Tap `🌐 Язык` and select Arabic/Chinese/etc.
3. Restart the bot → selected language should remain saved.
4. Register an item → PNG/PDF sticker should use the new green trust-first design.
5. Scan the QR from a second Telegram account.
6. On the finder screen, use the language button to change the finder language.
7. Send a found message.
8. Verify the finder receives confirmation in their language and the owner receives the notification in the owner's language.
9. Mark an item lost and verify the scanned-tag warning is localized.
10. Tap `🛡 QR safety` and verify the anti-phishing explanation.

## Trust model

PolyTag does not claim that arbitrary QR codes are safe. The product instead gives the finder a way to verify an **official PolyTag tag**:

- the physical tag visibly prints `t.me/<bot username>`
- the QR encodes the same Telegram destination plus a random PolyTag ID
- the bot does not request Telegram passwords, login codes, payment, or bank-card information
- the visible ID can be entered manually instead of scanning

This is intentionally designed to reduce QR-phishing anxiety without adding friction to the actual return flow.
