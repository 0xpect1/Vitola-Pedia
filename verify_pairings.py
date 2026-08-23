import json
from collections import Counter

src = json.load(open('data/cigars.json'))
out = json.load(open('data/cigars_expanded_pairings.json'))
print('source count:', len(src), '| output count:', len(out))

counts = [len(c.get('pairings', [])) for c in out]
print('pairing count dist:', dict(sorted(Counter(counts).items())))
print('min/max pairings:', min(counts), max(counts))

# Independent category classifier
KW = {
    'coffee': ('espresso', 'coffee', 'cold brew', 'flat white', 'cafecito', 'black coffee'),
    'food': ('chocolate', 'manchego', 'gouda', 'cheddar', 'brisket', 'biscotti',
             'bread pudding', 'blue cheese', 'ginger', 'bbq'),
    'wine': ('port', 'sherry', 'madeira', 'banyuls', 'champagne', 'wine',
             'sauternes', 'moscato', 'prosecco', 'chardonnay'),
    'beer': ('stout', 'quadrupel', 'quad', 'barleywine', 'pilsner', 'ale',
             'lager', 'ipa', 'beer', 'porter', 'bock'),
}

def catof(s):
    low = s.lower()
    for k, kws in KW.items():
        if any(w in low for w in kws):
            return k
    return 'spirits'

bad = [c['id'] for c in out if len({catof(p) for p in c['pairings']}) < 3]
print('cigars with <3 categories:', len(bad))
if bad:
    print('  first 5:', bad[:5])

# category totals
cc = Counter()
for c in out:
    for p in c['pairings']:
        cc[catof(p)] += 1
print('category totals:', dict(cc))
print('avg pairings:', round(sum(counts)/len(counts), 3))
print('JSON valid: yes')
print('count matches source:', len(src) == len(out))
