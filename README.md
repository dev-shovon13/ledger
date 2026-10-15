# Ledger: expenses and loans

A personal tracker for daily expenses, advance payments and loans. There is no backend yet: data is saved in the browser's localStorage.

```bash
npm run dev        # http://localhost:3000
npm test           # unit tests for lib/calculations (vitest)
npm run build
```

## Deploying (Vercel)

No `vercel.json` or environment variables are needed: Vercel detects Next.js and runs `next build`. Every route is a static page, and all data stays in the user's browser.

- **Node:** pinned to `22.x` in `package.json` (`engines`). Next 16 needs Node 20.9 or newer.
- **Deploy:** push to a Git repository connected to Vercel, or run `npx vercel` from this folder.
- **Data:** each browser keeps its own data, so data on your laptop won't appear on your phone. Use Settings → Export / Import JSON to move it.

## Architecture

| Layer | Where | Notes |
| --- | --- | --- |
| Types | `lib/types.ts` | `Expense`, `Loan`, `LoanTransaction`, `AppData` |
| Selectors | `lib/calculations.ts` | Pure functions that compute every derived number (day and month totals, loan opening and closing balances, the month summary, quick-add parsing). None of these values are stored. |
| Money | `lib/money.ts` | Amounts are stored in major units, but all arithmetic runs on integer minor units, so sums don't pick up floating-point drift |
| Repositories | `lib/repositories/` | `ExpenseRepository`, `LoanRepository` and `BackupRepository` interfaces, with a localStorage implementation |
| Migrations | `lib/migrations.ts` | Versioned data shape (`DATA_VERSION`), used both for storage and for imported backups |
| State | `lib/store.ts` | A Zustand data store that calls the repositories. UI preferences (currency, sort order, added dates) use the persist middleware. |

### Moving to a backend

1. Implement `Repositories` from `lib/repositories/types.ts`, for example as an `ApiRepositories` class that uses `fetch`.
2. Return it from `getRepositories()` in `lib/repositories/index.ts`.

The UI and the store only call the interfaces, so nothing else has to change.

## Languages (English / বাংলা)

- **Where text lives:** all UI text is in `lib/i18n/messages/en.ts` and `bn.ts`. The Bangla file must match the English shape exactly (TypeScript checks this), so a missing translation fails the build.
- **Switching language:** the choice is saved with the other local preferences and never touches the URL. English is the default.
- **Formatting:** dates, months and numbers use `bn-BD` in Bangla mode, so they appear in Bangla digits (৳১,২৫০). Typed input accepts both digit styles, so `বাস ২০` works in quick add.
- **Fonts:** Bangla text uses Noto Sans Bengali, as a fallback after Geist. The PDF embeds `public/fonts/LedgerPdf-*.ttf`, which merges Noto Sans and Noto Sans Bengali into one file because jsPDF can't switch fonts mid-text. Rebuild it with `python3 scripts/build-pdf-fonts.py` (needs `pip install fonttools`).
- **PDF:** the export follows the app language. Text with Bangla vowel signs or joined letters is drawn by the browser so it renders correctly (`lib/pdf/complex-text.ts`).

## Behaviour notes

- **Advances:** an expense with `advanceForMonth` counts toward that month's total. In the month it was paid, it appears under "Advances paid for future months" and is left out of that month's total.
- **Loans:** a loan's original amount is its first `principal` transaction. Each month's opening balance is computed from the history before that month, so one month's closing balance always equals the next month's opening balance. A loan is marked settled on the date its balance reaches 0. It reopens automatically if the balance becomes positive again, and can also be reopened by hand.
- **People:** the Loans page groups loans by person (`buildPeople` in `lib/calculations.ts`). Names are matched ignoring case and spaces, and if you both borrowed from and lent to someone, the two are netted.
- **Loan repayments:** a repayment on money you borrowed can also be counted as an expense in that month's spending.
- **Categories:** categories are matched ignoring case and surrounding spaces. "By category" in the breakdown, and the chips on phones, filter the month's list. The filter clears when you change month.
- **Today card:** the current month always shows a card for today, ready for quick entry.

## Theming

Colours are OKLCH tokens in `app/globals.css`. Both themes are tuned separately, with neutrals tinted towards the brand teal. All text pairs meet WCAG AA contrast (4.5:1 or better). Cards get their depth from `--shadow-card`.
