#!/usr/bin/env python3
"""Nightly: add active-wallet counts to data.js (read-only xrpl.to API).  python3 tools/active.py data.js
n.active = xrpl.to uniqueTraders24h (unique wallets that traded the token in the last 24h, AMM + order book);
n.active_src = 'traders24h', or 'holders' when xrpl.to has no trader data (falls back to holder count).
xrpl.to exposes no 7-30 day unique-wallet figure, so 24h unique traders is used. Drives neighbourhood density."""
import json,sys,urllib.request
p=sys.argv[1] if len(sys.argv)>1 else 'data.js';s=open(p).read();pre=s[:s.index('{')];e=json.loads(s[s.index('{'):s.rindex('}')+1])
for n in e['nodes']:
  if '-' not in n.get('key',''): continue
  try: t=json.load(urllib.request.urlopen(urllib.request.Request('https://api.xrpl.to/v1/token/'+n['key'],headers={'User-Agent':'burn-city/1'}),timeout=20));t=t.get('token',t)
  except Exception: continue
  a=t.get('uniqueTraders24h')
  if a is not None: n['active'],n['active_src']=int(a),'traders24h'
  elif t.get('holders') is not None: n['active'],n['active_src']=int(t['holders']),'holders'
open(p,'w').write(pre+json.dumps(e)+';')
print(sorted(((n['name'],n.get('active')) for n in e['nodes']),key=lambda x:-(x[1] or 0)))
