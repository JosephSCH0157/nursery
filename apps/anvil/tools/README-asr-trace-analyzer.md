`analyze_asr_trace.mjs` builds an offline summary for raw ASR console logs plus exported ASR JSON traces.

Example:

```bash
node tools/analyze_asr_trace.mjs \
  --text "C:\\Users\\Iam11\\Documents\\Hybrid Logs\\ASR_log_6-1-4 ASR1.txt" \
  --json "D:\\nursery\\nursery\\tmp\\asr-log-20260601-164233\\asr-log-20260601-164233.json" \
  --out-json "D:\\nursery\\nursery\\tmp\\asr-log-20260601-164233\\summary.json" \
  --out-csv "D:\\nursery\\nursery\\tmp\\asr-log-20260601-164233\\finals.csv"
```

The raw text log is used for the `tp:speech:transcript emit summary` sequence, and the JSON trace is used for timestamps and structured ASR event metadata.
