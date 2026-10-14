"""Top-holder buildings: for each token, the top N trust-line holders as SHARE BANDS + ROLES only. No addresses are written.
Bands: 0 <0.5%  1 0.5-1%  2 1-2%  3 2-5%  4 5-10%  5 10%+ of outstanding supply.
Roles: 'amm' (AMM pool account), 'blackhole' (master disabled, no usable key), 'exchange' (KNOWN_EXCHANGES), '' = regular holder.
Writes node['top']=[[band,role],...] (largest first), node['top10_pct'], node['top_n'], node['top_partial'] into data.js.
Usage: python3 tools/holders.py [data.js] [budget_seconds_per_token=25]   (read-only public XRPL RPC)."""
import json,sys,time,os,urllib.request
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'data.js');BUDGET=float(sys.argv[2]) if len(sys.argv)>2 else 25;TOPN=16
RPC=['https://xrplcluster.com/','https://s2.ripple.com:51234/','https://s1.ripple.com:51234/']
BLACKHOLE_KEYS={'rrrrrrrrrrrrrrrrrrrrrhoLvTp','rrrrrrrrrrrrrrrrrrrrBZbvji','rrrrrrrrrrrrrrrrrrrn5RM1rHd'}
KNOWN_EXCHANGES=set()   # hook: add public exchange hot-wallet addresses here (only the ROLE is published)
def rpc(m,p):
  for u in RPC:
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(u,json.dumps({'method':m,'params':[p]}).encode(),{'Content-Type':'application/json'}),timeout=40))['result']
      if r.get('status')=='success' or 'lines' in r or 'account_data' in r: return r
    except Exception: pass
  return {}
band=lambda pc:0 if pc<.5 else 1 if pc<1 else 2 if pc<2 else 3 if pc<5 else 4 if pc<10 else 5
src=open(PATH).read();pre=src[:src.index('{')];eco=json.loads(src[src.index('{'):src.rindex('}')+1])
amms={p.get('amm') for p in eco.get('pools',[]) if p.get('amm')}
for n in eco['nodes']:
  if '-' not in n.get('key','') or n['name']=='RLUSD': continue
  iss,cur=n['key'].split('-',1);t0=time.time();bal={};mk=None;partial=False
  while True:
    p={'account':iss,'limit':400,'ledger_index':'validated'}
    if mk:p['marker']=mk
    r=rpc('account_lines',p)
    if not r: partial=True;break
    for l in r.get('lines',[]):
      if l.get('currency')!=cur: continue
      v=-float(l['balance'])
      if v>0: bal[l['account']]=bal.get(l['account'],0)+v
    mk=r.get('marker')
    if not mk: break
    if time.time()-t0>BUDGET: partial=True;break
  tot=sum(bal.values())
  if not tot: continue
  top=sorted(bal.items(),key=lambda x:-x[1])[:TOPN];out=[]
  for a,v in top:
    role='amm' if a in amms else 'exchange' if a in KNOWN_EXCHANGES else ''
    if not role:
      ad=rpc('account_info',{'account':a,'ledger_index':'validated'}).get('account_data',{})
      if ad and ad.get('Flags',0)&0x00100000 and ad.get('RegularKey') in (None,*BLACKHOLE_KEYS): role='blackhole'
    out.append([band(100*v/tot),role])
  n['top']=out;n['top10_pct']=round(100*sum(v for _,v in top[:10])/tot,1);n['top_n']=len(bal);n['top_partial']=partial
  print(n['name'],'holders',len(bal),'top10',n['top10_pct'],'roles',[r for _,r in out if r],'partial',partial,flush=True)
open(PATH,'w').write(pre+json.dumps(eco)+';\n')
