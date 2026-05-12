"""Analysis worker package.

Reuses the math from the companion CLI at
/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/ (also at
https://github.com/vinamrajain99/do-i-beat-the-index), with two changes:

- Benchmark price cache lives in the Supabase `benchmark_price_cache` table
  instead of a parquet file on disk.
- Chart output is a Plotly figure JSON (stored in `analyses.results_json`)
  instead of a standalone HTML file.

Run an analysis end-to-end:
    python -m worker.analyze <analysis_id>
"""
