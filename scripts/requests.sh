#!/bin/zsh
# Landing-page requests not yet emailed, one JSON object per line, oldest first.
#   scripts/requests.sh               list un-emailed requests (with tree name + share link)
#   scripts/requests.sh emailed <id>  mark request <id> (the "id" field, not the Bayanne ID) as emailed
# Reads PUSH_URL / PUSH_TOKEN from the app's .env.
set -e
eval "$(grep -E '^PUSH_(URL|TOKEN)=' ~/projects/wha-biggit-dee-app/.env | sed 's/^/export /')"
B="${PUSH_URL%/}/api/push"; H=(-sf -H "Authorization: Bearer $PUSH_TOKEN" -H "Accept: application/json")

if [[ "$1" == emailed ]]; then
  curl "${H[@]}" -X PATCH "$B/requests/$2/emailed"; echo; exit
fi

REQ=$(curl "${H[@]}" "$B/requests") TREES=$(curl "${H[@]}" "$B/trees") python3 - <<'PY'
import json, os, re
# Same rules as the app's form validation (TreeRequest::NAME_PATTERN / RELATIONSHIPS), re-checked here so a row
# that bypassed them (older data, a direct DB edit) never reaches the watcher's context. Its text is withheld.
ID = re.compile(r'^I\d{1,7}$')
NAME = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ '’.-])*$")  # letters (any script), then letters, space, ' ’ . -
RELS = {'mam', 'dad', 'gran', 'grandad', 'husband', 'wife', 'partner',
        'son', 'daughter', 'brother', 'sister', 'aunt', 'uncle', 'cousin', 'friend'}
EMAIL = re.compile(r'^[^@\s]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
def ok(r):
    n = r['first_name'] or ''
    return (ID.match(r['bayanne_id'] or '') and len(n) <= 50 and NAME.match(n)
            and (r.get('relationship') in RELS or not r.get('relationship')) and EMAIL.match(r['email'] or ''))
def root_living(bayanne_id):
    # Mirrors Tree::presumedLiving in the app: no death event, and the earliest dated event within 110 years.
    # A living root's name came from Bayanne, not from the requester, so it's never put in an email.
    # No local file to check → assume living.
    import datetime, pathlib
    f = pathlib.Path(os.path.expanduser(f'~/projects/fan_chart/data/ancestors_{bayanne_id}.json'))
    if not f.exists():
        return True
    root = next((p for p in json.loads(f.read_text()) if p['ahnentafel'] == 1), None)
    if not root:
        return True
    events = root.get('events') or []
    if any(e['type'] == 'died' for e in events):
        return False
    years = [int(m.group()) for e in events if (m := re.search(r'\d{4}', e.get('date') or ''))]
    return bool(years) and min(years) >= datetime.date.today().year - 110
trees = {t['tng_id']: t for t in json.loads(os.environ['TREES'])}
for r in sorted(json.loads(os.environ['REQ']), key=lambda r: r['created_at']):
    if r.get('emailed_at'):
        continue
    if not ok(r):
        print(json.dumps({'id': r['id'], 'status': 'WITHHELD', 'reason': 'fails validation; James to review in the database'}))
        continue
    t = trees.get(r['bayanne_id']) if r['fulfilled_at'] else None
    link = t['url'].replace('https://wha-biggit-dee-production-qzlr2l.laravel.cloud', 'https://jastewart.co.uk') if t else None
    living = root_living(r['bayanne_id'])
    print(json.dumps({'id': r['id'], 'bayanne_id': r['bayanne_id'], 'first_name': r['first_name'],
                      'relationship': r.get('relationship'), 'email': r['email'],
                      'status': 'fulfilled' if r['fulfilled_at'] else 'PENDING',
                      'tree': None if living else (t['name'] if t else None), 'root_living': living, 'link': link}))
PY
