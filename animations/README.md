# animations/

Logo and motion work for Ant. Start with [PLAN.md](PLAN.md).

```
assets/source/anthropic-wordmark.svg   exact vector wordmark (Wikimedia, PD-Textlogo)
assets/letters/anthropic-letters.json  per-letter paths + bounding boxes
assets/ant/ant-wordmark-traced.svg     "ant" traced from docs/refs/ant-inspo.png
assets/ant/trace_ant.py                the tracing script (pillow, numpy, potracer)
font-match/match.py                    ranks open fonts against the ant logo
font-match/ranking.json, sheet.png     results
```

Python deps for the scripts: `pip install pillow numpy potracer svgpathtools fonttools brotli` (use a venv; `font-match/cache/` is downloaded on first run and not committed).
