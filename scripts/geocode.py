"""Geocode place names via Nominatim, 1.1s apart.

Usage: python3 scripts/geocode.py '{"Key": "Search query, Region", ...}'
Prints key -> (lat, lng, osm type, display name) for eyeballing; nothing is written to places.json.
"""
import json, subprocess, sys, time, urllib.parse

for key, query in json.loads(sys.argv[1]).items():
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})
    r = json.loads(subprocess.run(['curl', '-s', '-A', 'wha-biggit-dee/1.0', url], capture_output=True, text=True).stdout or '[]')
    print(key, '->', (round(float(r[0]['lat']), 4), round(float(r[0]['lon']), 4), r[0]['type'], r[0]['display_name'][:70]) if r else None)
    time.sleep(1.1)
