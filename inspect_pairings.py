import json
out = json.load(open('data/cigars_expanded_pairings.json'))
for cid in ['nub-nuance-single-roast', 'davidoff-grand-cru-no3',
            'hoyo-de-monterrey-epicure-no2', 'leaf-by-oscar-sumatran',
            'nat-sherman-timeless-prestige']:
    c = [x for x in out if x['id'] == cid][0]
    print(cid, '->')
    for p in c['pairings']:
        print('   -', p)
    print()
