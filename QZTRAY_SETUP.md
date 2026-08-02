# QZ Tray Setup Guide

QZ Tray is a desktop application that bridges the web POS and physical receipt printers. It runs in the system tray on the cashier's PC and accepts print jobs from the browser via a local WebSocket connection.

---

## 1. Download & Install QZ Tray

1. Go to **https://qz.io/download/**
2. Download the installer for Windows (`.exe`)
3. Run the installer — it installs QZ Tray and registers it as a startup app
4. After installation, QZ Tray starts automatically and appears in the system tray (bottom-right taskbar)

> QZ Tray must be **running on the same PC** as the browser being used to take orders.

---

## 2. Verify QZ Tray is Running

- Look for the QZ Tray icon in the Windows system tray (bottom-right corner)
- Right-click the icon → you should see options like "About", "Preferences", "Stop"
- If it is not running, launch it from the Start Menu: **QZ Tray**

---

## 3. Allow the POS Website in QZ Tray

QZ Tray blocks connections from unknown websites by default. You need to whitelist the POS domain:

1. Right-click the QZ Tray icon → **Preferences**
2. Go to the **Site Manager** or **Allowed Sites** tab
3. Add your deployment URL (e.g. `https://my-project.vercel.app`) and `http://localhost:3000` for local dev
4. Click **Save / OK**

Alternatively, when the browser first connects, QZ Tray will show a **popup asking permission** — click **Allow** (and optionally **Always allow** to avoid repeating this).

> **Note:** QZ Tray only enables the "Remember this decision" checkbox for **signed** connection requests — for unsigned sites it's greyed out and you'll be re-prompted every time. This app signs its connection requests (self-signed cert, see below), so the checkbox should be clickable. If it's still greyed out, `QZ_PRIVATE_KEY` may be missing from the environment — see section 9.

---

## 4. Configure a Printer in the POS

This is done **once per branch** by the superadmin.

1. Log in as **Superadmin**
2. Go to **Printers** in the sidebar
3. Click **"Check Status"** — the page will connect to QZ Tray and show available printers
4. Click **"Add Printer"**
5. Fill in:
   - **Branch** — select the branch this printer belongs to
   - **Printer Name** — if QZ Tray is connected it shows a dropdown of real printer names; otherwise type the exact Windows printer name (e.g. `EPSON TM-T82`)
   - **Paper Size** — `80mm` (standard) or `58mm`
   - **Notes** — optional label (e.g. "Counter printer")
6. Click **Save**

To verify the config works, click **Test Print** on the saved printer row — a test receipt will print immediately.

---

## 5. How the Printer Name Must Match

The printer name saved in the POS must **exactly match** the printer name shown in Windows:

1. Open **Settings → Bluetooth & devices → Printers & scanners**
2. Note the exact printer name shown there (e.g. `EPSON TM-T82 Receipt`)
3. Use that exact name in the Printer Config form

If QZ Tray is connected when you open the Add Printer modal, it will automatically list all Windows printers — just pick from the dropdown.

---

## 6. Daily Use (Cashier)

- QZ Tray must be running before the cashier opens the POS
- It runs silently in the background — no action needed after startup
- When an order is placed and paid, the POS sends the receipt to QZ Tray → QZ Tray sends it to the printer
- If printing fails, a toast notification appears — check that QZ Tray is still running in the tray

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "QZ Tray not connected" error | Open QZ Tray from Start Menu; check system tray |
| Permission popup keeps appearing | Click "Always allow" when QZ Tray prompts |
| Wrong printer name | Match the exact name from Windows Printers & scanners |
| Printer prints blank / garbled | Check paper size (80mm vs 58mm) in the Printer Config |
| QZ Tray not auto-starting | Go to QZ Tray Preferences → enable "Launch at startup" |
| Test print works but orders don't | Check the branch assigned to the printer config matches the cashier's branch |

---

## 8. Where Configs Are Stored

Printer configs are saved in the **`printer_configs`** Supabase table with these fields:

| Column | Description |
|---|---|
| `branch_id` | Which branch this printer serves |
| `printer_name` | Exact Windows printer name |
| `paper_size` | `58mm` or `80mm` |
| `is_active` | Whether this config is used for printing |
| `notes` | Optional label |

The cashier orders page (`/cashier/orders`) reads the active printer config for the cashier's branch and uses it automatically when printing receipts.

---

## 9. Connection Signing (Certificate Setup)

The POS signs its QZ Tray connection requests with a self-signed certificate. This is what lets QZ Tray offer **"Remember this decision"** instead of prompting on every page load. Without it, the checkbox is greyed out and the popup reappears every time.

- **Public certificate** — committed at `src/lib/printing/qz-certificate.ts`, safe to share.
- **Private key** — never committed. Lives in the `QZ_PRIVATE_KEY` environment variable, used only server-side by `src/app/api/qz/sign/route.ts` to sign each connection request on demand.

To deploy to a new environment (e.g. Vercel):

1. In the Vercel project settings, add an environment variable named `QZ_PRIVATE_KEY`.
2. Paste the full private key (including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines) as the value.
3. Redeploy.

Since this is a self-signed certificate (not purchased from qz.io), QZ Tray will still label the connection **"unverified"** — that's expected and doesn't affect functionality. It only removes the ability to click "Always allow", which is what step 3 above solves.

To generate a new key pair (e.g. if the existing one is compromised):

```bash
openssl req -x509 -newkey rsa:2048 -keyout private-key.pem -out digital-certificate.txt -days 3650 -nodes -subj "/CN=my-project-pos"
```

Then update `QZ_CERTIFICATE` in `src/lib/printing/qz-certificate.ts` with the new certificate, and `QZ_PRIVATE_KEY` in the environment with the new private key.

---

## 10. Relevant Code Files

| File | Purpose |
|---|---|
| `src/lib/printing/qz-tray.ts` | `connect()`, `getPrinters()`, `printReceipt()` helpers; wires up connection signing |
| `src/lib/printing/qz-certificate.ts` | Public certificate used to sign connection requests |
| `src/app/api/qz/sign/route.ts` | Server-side endpoint that signs connection requests with the private key |
| `src/app/superadmin/printers/page.tsx` | Superadmin UI to manage printer configs |
| `src/app/cashier/orders/page.tsx` | Sends receipt to QZ Tray after order is placed |
| `src/qz-tray.d.ts` | TypeScript type declaration for the `qz-tray` npm package |
