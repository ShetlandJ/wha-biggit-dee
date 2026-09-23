"""Parse Bayanne text-pedigree HTML pages into data/ancestors_{ID}.json.

Usage: python3 scripts/parse_pedigree.py path/to/pedigree_I12345.html [...]
"""
import re, json, sys, html, math, os

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
TYPES = {'B': 'born', 'M': 'married', 'D': 'died'}
PERSON = re.compile(r'&nbsp;(\d+)\. <a href="getperson\.php\?personID=(I\d+)&amp;tree=ID1">(.*?)</a>')
EVENT = re.compile(r'&nbsp;(B|M|D|P):(?:&nbsp;)?</span></td>\s*<td[^>]*><span[^>]*>(.*?)</span>', re.S)


def clean(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ').strip()


def parse(path):
    h = open(path).read()
    ms = list(PERSON.finditer(h))
    out = []
    for i, m in enumerate(ms):
        seg = h[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(h)]
        events, cur = [], None
        for t, v in EVENT.findall(seg):
            v = clean(v)
            if t in TYPES:
                cur = {'type': TYPES[t], 'date': v, 'place': ''}
                events.append(cur)
            elif cur is not None:
                # P: is the place of the preceding B/M/D event
                cur['place'] = v
                cur = None
        events = [e for e in events if e['date'] or e['place']]
        n = int(m.group(1))
        out.append({'ahnentafel': n, 'name': clean(m.group(3)), 'pID': m.group(2), 'events': events, 'generation': int(math.log2(n)) + 1})
    return out


if __name__ == '__main__':
    for p in sys.argv[1:]:
        d = parse(p)
        rid = re.search(r'(I\d+)', os.path.basename(p)).group(1)
        assert d and d[0]['ahnentafel'] == 1 and d[0]['pID'] == rid, f'{p}: root is not {rid}'
        assert len({x['ahnentafel'] for x in d}) == len(d), f'{p}: duplicate ahnentafel numbers'
        json.dump(d, open(os.path.join(DATA, f'ancestors_{rid}.json'), 'w'), indent=2, ensure_ascii=False)
        living = [x['ahnentafel'] for x in d if x['name'].lower().startswith('living')]
        print(f"{rid} | {d[0]['name']} | {len(d)} people | gens {max(x['generation'] for x in d)} | living rows {living}")
