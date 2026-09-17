#!/usr/bin/env python3
"""
Task 64 - Remove the em dash (U+2014) and en dash (U+2013) characters from the
entire app source. Plain character replacement: surrounding spaces are
preserved, so " — " naturally becomes " - ".

Covers every file the app ships or renders from:
  - src/**/*.ts, src/**/*.tsx  (UI strings, toasts, tooltips, legal text, seed data)
  - public/manifest.webmanifest (app name shown in install prompts)
  - public/sw.js               (shipped asset)
  - capacitor.config.ts / next.config.ts (app config)

Docs (README/DEPLOY/ANDROID-APP.md) and dev-only scripts/ are intentionally
left alone: they never render inside the app.
"""
import pathlib
import sys

ROOT = pathlib.Path('/home/z/circub')

targets: list[pathlib.Path] = []
targets += sorted((ROOT / 'src').rglob('*.ts'))
targets += sorted((ROOT / 'src').rglob('*.tsx'))
targets += [ROOT / 'public' / 'manifest.webmanifest', ROOT / 'public' / 'sw.js',
            ROOT / 'capacitor.config.ts', ROOT / 'next.config.ts']

CHANGES = {'\u2014': '-', '\u2013': '-'}  # em dash, en dash

total_files = 0
total_hits = 0
for path in targets:
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError):
        continue
    hits = sum(text.count(ch) for ch in CHANGES)
    if not hits:
        continue
    for ch, rep in CHANGES.items():
        text = text.replace(ch, rep)
    path.write_text(text, encoding='utf-8')
    rel = path.relative_to(ROOT)
    print(f'{hits:4d}  {rel}')
    total_files += 1
    total_hits += hits

print(f'\n{total_hits} dashes replaced across {total_files} files')

# hard guarantee: nothing left behind
left = 0
for path in targets:
    try:
        left += sum(path.read_text(encoding='utf-8').count(ch) for ch in CHANGES)
    except (UnicodeDecodeError, OSError):
        pass
print(f'remaining em/en dashes: {left}')
sys.exit(0 if left == 0 else 1)
