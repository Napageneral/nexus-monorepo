# Release Notes

## 0.1.2

- persist per-family live-monitor watermarks and use `last_poll_at` fallback
  when a family has no provider cursor yet
- suppress duplicate live-monitor revisions before durable record emission
- keep line-item revisions stable when only parent order freshness changes
- add adapter-only backfill and live-monitor benchmark proof coverage

## 0.1.0

- initial dedicated Shopify adapter package scaffold
