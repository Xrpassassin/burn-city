#!/usr/bin/env python3
"""Fetch active sponsored placements from xrpburn.com and write ads.js (window.ADS). Run nightly (and more often if desired).
Source: https://xrpburn.com/api/promotions/active  -> {tiers:{HERO:{active:[...]}, SECONDARY:{active:[...]}}}
No CORS header for other origins, so this runs server-side, not in the browser. Only entries in `active` are used; never invented.
Output format (also what the dad can hand-write if needed):
  window.ADS={ts, source, active:[{ticker, name, tagline, issuer, currency, logo_url, color, tier, ends_at, url}]}
  ticker required; url defaults to https://xrpburn.com/dex/trade/<TICKER>-XRP; color optional (#rrggbb); logo_url optional (https only)."""
import json,time,urllib.request,urllib.parse,sys,re
d=json.load(urllib.request.urlopen(urllib.request.Request('https://xrpburn.com/api/promotions/active',headers={'User-Agent':'BurnCity/1.0'}),timeout=30))
out=[];now=time.time()*1000
for tier,T in (d.get('tiers') or {}).items():
  for a in T.get('active') or []:
    tk=(a.get('ticker') or '').strip()
    if not tk: continue
    end=a.get('ends_at')
    try:
      if end and float(end if not isinstance(end,str) else time.mktime(time.strptime(end[:19],'%Y-%m-%dT%H:%M:%S'))*1000)<now: continue
    except Exception: pass
    logo=a.get('logo_url') or a.get('logo') or ''
    col=a.get('color') or a.get('accent_color') or ''
    out.append({'ticker':tk,'name':a.get('name') or tk,'tagline':a.get('tagline') or '','issuer':a.get('issuer') or a.get('token_issuer'),'currency':a.get('currency') or a.get('token_currency'),
      'logo_url':logo if logo.startswith('https://') else '','color':col if re.fullmatch(r'#[0-9a-fA-F]{6}',col or '') else '','tier':T.get('label') or tier,'ends_at':end,
      'url':'https://xrpburn.com/dex/trade/'+urllib.parse.quote(tk.upper())+'-XRP'})
res={'ts':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':'xrpburn.com/api/promotions/active','active':out}
open(sys.argv[1] if len(sys.argv)>1 else 'ads.js','w').write('window.ADS='+json.dumps(res)+';\n');print(json.dumps(res))
