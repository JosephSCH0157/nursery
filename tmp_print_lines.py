from pathlib import Path
text = Path('supabase/functions/_shared/stripe-catalog.ts').read_text().splitlines()
for i in range(120, 170):
    print(f'{i+1:04d}: {text[i]}')
