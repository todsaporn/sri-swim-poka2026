# ศรีอรุโณทัย · Krabi PAO Swimming Championship #16

Auto-updated startlist + results page for Sriarunothai swimmers.

- `data/startlist_dayN.pdf` – Meet Program (HY-TEK) per day, configured in `config.json`
- `scripts/fetch_results.py` – downloads result PDFs from cnxswimming.com (`1_N.pdf`), ETag-aware
- `scripts/parse_results.py` – parses result PDFs → `data/results.json` (+ `raw/results/N.txt` dumps)
- `scripts/build.py` – merges startlist + results → `site/index.html` (single file, data inlined)
- `.github/workflows/update.yml` – runs every 10 min during the meet, deploys to GitHub Pages
