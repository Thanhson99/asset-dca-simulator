# Data Providers

## Stock Data

Preferred first provider: SSI FastConnect Data.

Reasons:

- It has documented daily OHLC and daily stock price endpoints.
- It supports Vietnamese stock symbols such as FPT.
- It is a better starting point than scraping Google search results.

Expected fields for stock simulation:

- date
- open
- high
- low
- close
- volume

## Current Proof Of Concept

`collector/bin/market-data.mjs` currently fetches stock assets and daily data from KBS public endpoints:

```text
https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data
https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/FPT/data_day
```

This is only a proof of concept to verify the project data shape with real rows. Do not treat it as the final provider decision until terms, stability, and corporate action behavior are checked.

## Gold Data

Gold is less standardized than listed stocks. For the first version, use `manual-csv` or a small curated JSON import until a reliable provider is confirmed.

Expected fields for gold simulation:

- date
- buy
- sell

For DCA buying, use the sell price. For portfolio liquidation value, use the buy price.

## Avoid Google Scraping

Do not build the collector around Google search results. Search pages are not a stable data API, can change layout at any time, and are hard to validate.

## Google Sheet / Excel

Google Sheet is acceptable as:

- a manual input interface
- a review table
- an export target

It should not be the main database. The canonical database should remain in `data/*.json` so the frontend can load it directly from GitHub Pages.

## Provider Safety Rules

Every provider must return normalized rows before writing files.

Reject a fetch result if:

- it returns zero rows for a known active date range
- dates are outside the requested range
- rows are not sorted or contain duplicates
- stock prices are missing `close`
- gold prices are missing `buy` or `sell`
- new data would delete existing valid rows without an explicit force option
