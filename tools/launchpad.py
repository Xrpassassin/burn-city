#!/usr/bin/env python3
"""Fetch unbonded (bonding-curve) launchpad tokens from xrpl.fun's public API and write launchpad.js.
Source: https://api.xrpl.fun/v1/crucible/tokens (status=="CURVE") + /v1/crucible/curve/<launchId> + /v1/crucible/pol/<launchId>/progress.
bond_pct mirrors xrpl.fun's own UI: min(curve.progressPct + pol.progressPct, 100). The API sends no CORS header for our origin,
so this runs at build time (nightly), not in the browser. Format (window.LAUNCHPAD):
  {ts, source, lots:[{ticker,name,issuer,launch_id,base_pair,bond_pct|null,mcap,liquidity,url}], graduated:[ticker,...]}"""
import json,time,urllib.request,sys
B='https://api.xrpl.fun/v1/crucible'
def get(u):
  return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'BurnCity/1.0','Accept':'application/json'}),timeout=30))
d=get(B+'/tokens');T=d if isinstance(d,list) else d.get('tokens',[])
lots=[];grad=[]
for t in T:
  if t.get('status')=='GRADUATED':grad.append(t.get('ticker'))
  if t.get('status')!='CURVE' or not t.get('ticker'):continue
  lid=t.get('launchId');bp=None
  try:
    c=get(f'{B}/curve/{lid}');p=get(f'{B}/pol/{lid}/progress');bp=min(100.0,float(c.get('progressPct') or 0)+float(p.get('progressPct') or 0))
  except Exception as e: print('progress n/a',t['ticker'],e)
  f=lambda k:float(t[k]) if t.get(k) not in (None,'') else None
  lots.append({'ticker':t['ticker'],'name':t.get('name') or t['ticker'],'issuer':t.get('issuer'),'launch_id':lid,'base_pair':t.get('basePair'),
    'bond_pct':round(bp,2) if bp is not None else None,'mcap':f('marketCap'),'liquidity':f('liquidity'),'url':'https://xrpl.fun/t/'+urllib.request.quote(t['ticker'])})
out={'ts':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':'api.xrpl.fun crucible','lots':lots[:12],'graduated':grad}
open(sys.argv[1] if len(sys.argv)>1 else 'launchpad.js','w').write('window.LAUNCHPAD='+json.dumps(out)+';\n');print(json.dumps(out,indent=1))
