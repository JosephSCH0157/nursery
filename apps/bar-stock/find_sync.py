from pathlib import Path
lines=Path('src/App.tsx').read_text().splitlines()
for idx,line in enumerate(lines,1):
    if 'const onSyncNow' in line:
        for j in range(idx-5, idx+40):
            if 1 <= j <= len(lines):
                print(f"{j}:{lines[j-1]}")
        break
