#!/usr/bin/env python3
"""Enrich data.js with ledger-derived fields (read-only public XRPL RPC). Run after build_data, e.g. nightly:
  python3 tools/enrich.py data.js [seconds_per_token_scan]
Adds per node: circ (outstanding supply = issued minus issuer, via gateway_balances), price_amm (from AMM reserves),
price_src ('amm-xrp' | 'amm-via-<TOKEN>'), price_thin (XRP-side depth < 1000 XRP), mcap_amm = circ*price_amm,
burn_txs / burn_vol (validated Payments of the token delivered to its own issuer), burn_complete (full history scanned),
burned_pct (only when burn_complete). Burn counts never go down: a partial rescan keeps the previous larger count."""
import json,sys,time,urllib.request
RPC=['https://xrplcluster.com/','https://s2.ripple.com:51234/','https://s1.ripple.com:51234/']
def rpc(m,p):
  err=None
  for u in RPC:
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(u,json.dumps({'method':m,'params':[p]}).encode(),{'Content-Type':'application/json'}),timeout=40))['result']
      if r.get('status')=='error' and r.get('error') not in ('actNotFound',): err=r.get('error');continue
      return r
    except Exception as e: err=e
  raise RuntimeError(err)
PRICES_ONLY='--prices-only' in sys.argv;sys.argv=[a for a in sys.argv if a!='--prices-only'];path=sys.argv[1];BUDGET=float(sys.argv[2]) if len(sys.argv)>2 else 90
src=open(path).read();pre=src[:src.index('{')];eco=json.loads(src[src.index('{'):src.rindex('}')+1])
N={n['name']:n for n in eco['nodes']}
def ref(n): iss,cur=n['key'].split('-',1);return {'currency':cur,'issuer':iss}
# reserves per pool
res={}
for p in eco['pools']:
  if not p.get('amm'):continue
  try:
    a=rpc('amm_info',{'amm_account':p['amm'],'ledger_index':'validated'})['amm']
    def side(x): return ('XRP',int(x)/1e6) if isinstance(x,str) else (x['currency'],x['issuer'],float(x['value']))
    res[p['amm']]=(side(a['amount']),side(a['amount2']))
  except Exception as e: print('amm ERR',p['a'],p['b'],e)
def tokname(s):
  if s[0]=='XRP':return 'XRP'
  for n in eco['nodes']:
    if n.get('key')==f"{s[1]}-{s[0]}":return n['name']
# price each token from its deepest AMM pool against an already-priced asset (XRP first, then 2 hops max)
price={'XRP':(1.0,'xrp',1e18)}
for hop in range(3):
  cand={}
  for amm,(s1,s2) in res.items():
    a,b=tokname(s1),tokname(s2)
    for x,sx,y,sy in ((a,s1,b,s2),(b,s2,a,s1)):
      if not x or x in price or y not in price or sx[-1]<=0: continue
      depth=sy[-1]*price[y][0]  # XRP value of the priced side
      if x not in cand or depth>cand[x][2]: cand[x]=(sy[-1]*price[y][0]/sx[-1],'amm-xrp' if y=='XRP' else 'amm-via-'+y,depth)
  price.update(cand)
for n in eco['nodes']:
  if '-' not in n.get('key',''):continue
  iss,cur=n['key'].split('-',1);t0=time.time()
  try:
    ob=float(rpc('gateway_balances',{'account':iss,'ledger_index':'validated'}).get('obligations',{}).get(cur,0));n['circ']=ob
    if n['name'] in price:
      pr,srcp,depth=price[n['name']];n['price_amm']=pr;n['price_src']=srcp;n['price_depth']=round(depth,2);n['price_thin']=depth<1000
      n['mcap_amm']=ob*pr if depth>=100 else None  # <100 XRP of depth: price is noise, show n/a rather than a fake number
    else: n['mcap_amm']=None
    if PRICES_ONLY: continue
    if n['name']=='RLUSD':continue  # stablecoin: issuer history is enormous and redemptions are not "burns"
    cnt=vol=0;marker=None
    while True:
      p={'account':iss,'limit':400,'ledger_index_min':-1,'ledger_index_max':-1}
      if marker:p['marker']=marker
      r=rpc('account_tx',p)
      for t in r.get('transactions',[]):
        tx=t.get('tx') or t.get('tx_json');m=t.get('meta',{})
        if not tx or tx.get('TransactionType')!='Payment' or tx.get('Destination')!=iss or tx.get('Account')==iss or m.get('TransactionResult')!='tesSUCCESS':continue
        a=m.get('delivered_amount') or tx.get('Amount')
        if isinstance(a,dict) and a.get('currency')==cur and a.get('issuer')==iss: cnt+=1;vol+=float(a['value'])
      marker=r.get('marker')
      if not marker or time.time()-t0>BUDGET:break
    complete=not marker
    if complete or cnt>=n.get('burn_txs',0): n['burn_txs']=cnt;n['burn_vol']=vol;n['burn_complete']=complete
    n['burned_pct']=round(100*n['burn_vol']/(n['burn_vol']+ob),3) if n.get('burn_complete') and n['burn_vol']+ob>0 else None
  except Exception as e: print('ERR',n['name'],e)
  print(n['name'],{k:n.get(k) for k in ('circ','price_amm','price_src','price_thin','mcap_amm','burn_txs','burn_complete','burned_pct')},flush=True)
eco['enriched_ts']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
open(path,'w').write(pre+json.dumps(eco)+';\n' if not src.rstrip().endswith(';') else pre+json.dumps(eco)+';\n')
