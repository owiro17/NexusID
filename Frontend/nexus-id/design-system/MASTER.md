# NexusID Design System — Master Specification

## 1. Brand & Tone
- **Brand Name:** NexusID
- **Tagline:** Banking that knows it's you
- **Voice:** Calm, clear, human-first. Never expose raw database table names (`public.financial_ledgers`, `public.security_audit_logs`, `RLS Policy`) or intimidating ML equations on primary user workflows.
- **Currency:** Kenya Shillings (`KSh`), formatted as `KSh 10,000.00` (`en-KE`).
  - Starting Balance: `KSh 10,000.00`
  - Daily Rewards: `KSh 50` (Bronze), `KSh 150` (Silver), `KSh 500` (Gold)
  - High-Value Transfer Threshold: `KSh 100,000` (step-up triggers automatically when behavioral risk > 70%, i.e., Trust Score < 30).

## 2. Color System (Light Banking Theme + Deep Navy Sidebar)
| Role | Name | Hex | Tailwind Token | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Background** | Alabaster | `#F8FAFC` | `bg-slate-50` | App canvas & page background |
| **Surface** | Pure White | `#FFFFFF` | `bg-white` | Cards, modals, tables, inputs |
| **Sidebar** | Deep Navy | `#0B1B3F` | `bg-[#0B1B3F]` | Desktop left navigation sidebar |
| **Primary** | Royal Blue | `#2563EB` | `bg-blue-600` / `text-blue-600` | Primary CTAs, active tabs, focus rings |
| **Secondary (Contrast)** | Warm Amber | `#F59E0B` | `bg-amber-500` / `text-amber-600` | Rewards, highlights, step-up prompts |
| **Harmonious Accent** | Teal | `#0D9488` | `bg-teal-600` / `text-teal-600` | Protected status, verified badges, inflows |
| **Text Primary** | Slate 900 | `#0F172A` | `text-slate-900` | Headings, balances, primary copy |
| **Text Muted** | Slate 600 | `#475569` | `text-slate-600` | Labels, subtitles, helper text |
| **Border** | Slate 200 | `#E2E8F0` | `border-slate-200` | Card & input dividers |

## 3. Typography
- **Font Family:** `IBM Plex Sans` (`400`, `500`, `600`, `700`) across all headings, body text, and numbers.
- **Numeric Alignment:** `tabular-nums` on all `KSh` currency figures, Trust Scores, and chart axes.
- **No Terminal Monospace Clutter:** Avoid `font-mono` in customer-facing screens.

## 4. Navigation & Page Hierarchy
- **Desktop Sidebar (`#0B1B3F`):**
  1. `Overview` (`/dashboard`)
  2. `Rewards` (`/dashboard/challenges`)
  3. `Insights` (`/dashboard/insights`)
  4. `Security` (`/dashboard/security`)
- **Mobile Navigation:** Fixed bottom tab bar with the same 4 destinations.
- **Top Header:** Page title on the left; user profile pill + Sign out button on the right.
