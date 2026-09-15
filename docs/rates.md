# Yield Products

The yield tab models bank savings and flexible wallet-yield products separately
from stock DCA. Stocks use daily market prices. Yield products use dated rate
rules.

## Product Types

### Bank Savings

Bank savings snapshots live under:

```text
data/rates/banks/{BANK}/history.json
```

Each snapshot stores effective dates, channel, source URL, and term rates:

```json
{
  "effectiveFrom": "2026-09-14",
  "effectiveTo": null,
  "channel": "online",
  "terms": [
    { "months": 1, "annualRate": 3.2 },
    { "months": 6, "annualRate": 4.6 }
  ]
}
```

The frontend currently simulates bank deposits as separate monthly lots. Each
new contribution opens a new term deposit. At maturity, the lot renews using the
latest applicable rate snapshot.

Bank rates are annualized rates for a selected term. For example, a 1-month
term at `2.8%/year` earns roughly `principal * 2.8% / 12` for that month, not
`2.8%` for the whole selected simulation range.

The selected rate is locked only for that deposit lot's term. At each maturity,
the renewed lot uses the rate snapshot effective on the maturity date. If the
selected simulation period has no rate snapshot for a needed date, the frontend
must stop with a missing-data error instead of applying a future rate backward.

Historical bank data can be imported from the curated Excel workbook:

```bash
python3 collector/scripts/import-bank-rates-xlsx.py ~/Desktop/lich_su_lai_suat_10_ngan_hang_2000_2026.xlsx --repo-root .
```

The import uses the `Historical_Obs` sheet for dated rate events and keeps
`Annual_Snapshot`, `Coverage`, and `Sources` as metadata in each bank history
file. Rows with confidence other than `A` are marked `needsReview`. When the
same bank/term/date has multiple customer tiers, the app defaults to standard
or small-balance rows first; premium/private tiers remain in the data for later
tier-specific UI.

### MoMo Túi Thần Tài

MoMo lives under:

```text
data/rates/momo/tui-than-tai.json
```

MoMo has base-rate snapshots and promotion snapshots. Promotions are kept
separate because eligibility and promo windows are not the same as a public base
rate.

```json
{
  "rateType": "promotion",
  "annualRate": 8,
  "effectiveFrom": "2021-09-23",
  "effectiveTo": "2021-12-31",
  "promoDurationDays": 90,
  "eligibleFor": "new_user_or_campaign_user"
}
```

The flexible-yield simulator accrues interest daily using:

```text
interest = balance * annualRate / 365
```

When tax is enabled, it subtracts `taxRate` from the interest before compounding.

MoMo is a flexible daily-yield product, not a term deposit. Its default rule is
daily compounding because daily interest is added back to the balance.

Current local coverage starts at `2020-10-01`, using the curated MoMo/Finsight
rate periods supplied for this project. The `2020-10` launch month is approximate
and remains marked `needsReview`; high-confidence periods and the current
official `4%/year` period are not marked for review.

Special-rate campaigns such as the 2021 `8%/year` windows are stored as
promotion snapshots because they temporarily override the base rate for eligible
users. Reward multiplier campaigns such as x2 or x10 profit are kept in
`promotions` metadata instead of being converted into fake annual rates.

There is still no verified Túi Thần Tài history before `2020-10`. When the
selected yield date range falls outside covered snapshots for the chosen
product/term, the frontend normalizes the form to the available data range
instead of trying to apply a future/current rate backward. Users can still use
the manual override field to test a hypothetical fixed annual rate over any
date range.

## Commands

Validate all local rate JSON:

```bash
node collector/bin/market-data.mjs rates:validate
```

Audit manual or uncertain snapshots:

```bash
node collector/bin/market-data.mjs rates:audit
```

Update supported live providers:

```bash
node collector/bin/market-data.mjs rates:update --provider=momo
node collector/bin/market-data.mjs rates:update --provider=all
```

Only MoMo has a live provider adapter in this first version. Bank files are
imported from the curated workbook; future official bank parsers can replace or
append snapshots when each source is mapped.

## Data Safety

- Every rate file is validated before use by the collector.
- Rates outside `0% - 20%` are rejected.
- Bank terms cannot duplicate the same month term inside one snapshot.
- Snapshots marked `needsReview` remain visible in the UI and audit output.
- Live updates append a new snapshot only when the fetched rate changes.
