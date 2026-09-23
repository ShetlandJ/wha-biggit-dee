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
import json, os
trees = {t['tng_id']: t for t in json.loads(os.environ['TREES'])}
for r in sorted(json.loads(os.environ['REQ']), key=lambda r: r['created_at']):
    if r.get('emailed_at'):
        continue
    t = trees.get(r['bayanne_id']) if r['fulfilled_at'] else None
    link = t['url'].replace('https://wha-biggit-dee-production-qzlr2l.laravel.cloud', 'https://jastewart.co.uk') if t else None
    print(json.dumps({'id': r['id'], 'bayanne_id': r['bayanne_id'], 'first_name': r['first_name'], 'email': r['email'],
                      'status': 'fulfilled' if r['fulfilled_at'] else 'PENDING', 'tree': t['name'] if t else None, 'link': link}))
PY
