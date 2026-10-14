#!/usr/bin/env python3
"""Build history.js for the Replay time-lapse (read-only public APIs, daily granularity).
  python3 tools/history.py [history.js] [scan_seconds_per_token]
Per token in data.js + launchpad.js:
  l  launch day   = earliest of xrpl.to 'date' and the issuer's first ledger tx (XRPL account_tx forward)
  a  bond day     = first AMM creation among the token's pools (first tx of the AMM account); else first priced day
  m  daily market cap, XRP, encoded round(log10(mcap)*100) = daily close (xrpl.to OHLC, Data by xrpl.to) x
     circulating supply (today's gateway_balances obligations + burns made after that day)
  t  daily TVL, XRP, same encoding. ESTIMATED: sum of the token's pools alive that day, each = today's pool TVL x
     sqrt(close_day/close_today) (constant-product, constant-liquidity assumption). Days recorded nightly by this
     script (from data.js) are real and listed in tr.
  x  [from,to] day ranges where m was interpolated (no trade data that day) -> shown as approximate in the UI
  b  [[day,count],...] burns = validated Payments of the token delivered to its own issuer (XRPL account_tx)
  bp burn scan incomplete (very busy issuer; continues on following nightly runs)
  k  [[day,locked_pct],...] TVL-weighted % LP locked in blackholed wallets; from nightly snapshots. k0 = 1 means
     the first entry is today's value carried back (no older lock history exists)
Incremental: tools/history_cache.json keeps burns + scan markers + nightly real snapshots, so each nightly run
only scans new ledgers (and keeps backfilling partial issuers) and appends today's real snapshot."""
import json,sys,time,math,os,datetime,urllib.request,concurrent.futures as cf
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'history.js'); BUDGET=float(sys.argv[2]) if len(sys.argv)>2 else 90
CACHE=os.path.join(ROOT,'tools','history_cache.json')
RPC=['https://xrplcluster.com/','https://s2.ripple.com:51234/','https://s1.ripple.com:51234/']
RIPPLE_EPOCH=946684800
def rpc(m,p):
  err=None
  for u in RPC:
    for _ in range(2):
      try:
        r=json.load(urllib.request.urlopen(urllib.request.Request(u,json.dumps({'method':m,'params':[p]}).encode(),{'Content-Type':'application/json'}),timeout=40))['result']
        if r.get('status')=='error' and r.get('error') not in ('actNotFound',): err=r.get('error');time.sleep(1);continue
        return r
      except Exception as e: err=e;time.sleep(1)
  raise RuntimeError(err)
def http(u):
  try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'burn-city-history/1'}),timeout=30))
  except Exception: return {}
def jsload(p):
  s=open(p).read();return json.loads(s[s.index('{'):s.rindex('}')+1])
def day(ts): return datetime.datetime.fromtimestamp(ts,datetime.timezone.utc).strftime('%Y-%m-%d')
eco=jsload(os.path.join(ROOT,'data.js'))
try: lp=jsload(os.path.join(ROOT,'launchpad.js'))
except Exception: lp={'lots':[]}
cache=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
TODAY=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
toks=[]
for n in eco['nodes']:
  if '-' in n.get('key',''): iss,cur=n['key'].split('-',1);toks.append(dict(name=n['name'],iss=iss,cur=cur,node=n))
names={t['name'] for t in toks}
for l in lp.get('lots',[]):
  if l['ticker'] not in names and l.get('issuer'): toks.append(dict(name=l['ticker'],iss=l['issuer'],cur=None,lot=l))
def first_tx_day(acct):
  try:
    r=rpc('account_tx',{'account':acct,'limit':1,'forward':True,'ledger_index_min':-1,'ledger_index_max':-1})
    t=r.get('transactions',[])
    if t:
      tx=t[0].get('tx') or t[0].get('tx_json') or {}
      d=tx.get('date') or t[0].get('close_time_iso')
      if isinstance(d,int): return day(d+RIPPLE_EPOCH)
      if isinstance(d,str): return d[:10]
  except Exception as e: print('first_tx ERR',acct,e)
def scan_burns(t,c):
  """Incremental issuer scan: new ledgers since c['hi'], then continue backfilling from c['back'] marker."""
  iss,cur=t['iss'],t['cur'];t0=time.time();burns=c.setdefault('burns',[])
  def take(r):
    for x in r.get('transactions',[]):
      tx=x.get('tx') or x.get('tx_json');m=x.get('meta',{})
      if not tx or tx.get('TransactionType')!='Payment' or tx.get('Destination')!=iss or tx.get('Account')==iss or m.get('TransactionResult')!='tesSUCCESS':continue
      a=m.get('delivered_amount') or m.get('DeliveredAmount') or tx.get('Amount')
      if isinstance(a,dict) and a.get('issuer')==iss and (cur is None or a.get('currency')==cur):
        h=tx.get('hash') or x.get('hash')
        if h in seen: continue
        seen.add(h);burns.append([day(tx['date']+RIPPLE_EPOCH),float(a['value']),h[:12] if h else ''])
  seen={b[2] for b in burns}
  try:
    if 'hi' in c:  # new ledgers only
      mk=None
      while True:
        p={'account':iss,'limit':400,'ledger_index_min':c['hi']+1,'ledger_index_max':-1}
        if mk:p['marker']=mk
        r=rpc('account_tx',p);take(r);mk=r.get('marker');hi=r.get('ledger_index_max')
        if not mk:break
        if time.time()-t0>BUDGET: break
      if not mk and hi: c['hi']=hi
    else:
      r=rpc('account_tx',{'account':iss,'limit':400,'ledger_index_min':-1,'ledger_index_max':-1});take(r)
      c['hi']=r.get('ledger_index_max');c['back']=r.get('marker');c['done']=not r.get('marker')
    while not c.get('done') and time.time()-t0<BUDGET:
      r=rpc('account_tx',{'account':iss,'limit':400,'ledger_index_min':-1,'ledger_index_max':-1,'marker':c['back']});take(r)
      c['back']=r.get('marker');c['done']=not c['back']
  except Exception as e: print('scan ERR',t['name'],e)
def ohlc(t):
  if not t['cur']: return {}
  j=http(f"https://api.xrpl.to/v1/token/{t['iss']}-{t['cur']}");tk=j.get('token',j);md=tk.get('md5')
  t['xdate']=tk.get('date')
  if not md: return {}
  o=http(f"https://api.xrpl.to/v1/ohlc/{md}?range=ALL&interval=1d&vs_currency=XRP").get('ohlc') or []
  return {day(r[0]/1000):r[4] for r in o if len(r)>4 and r[4]}
def work(t):
  c=cache.setdefault(t['name'],{})
  if c.get('iss')!=t['iss']: c.clear();c['iss']=t['iss']
  t['close']=ohlc(t)
  if 'first' not in c: c['first']=first_tx_day(t['iss'])
  if t['name']!='RLUSD': scan_burns(t,c)   # stablecoin redemptions are not burns
  else: c['done']=True
  print(t['name'],'closes',len(t['close']),'first',c['first'],'burns',len(c.get('burns',[])),'complete',c.get('done'),flush=True)
with cf.ThreadPoolExecutor(6) as ex: list(ex.map(work,toks))
# AMM creation days (cached; immutable)
amc=cache.setdefault('_amm',{})
for p in eco['pools']:
  a=p.get('amm')
  if a and a not in amc: amc[a]=first_tx_day(a)
# nightly real snapshot (from data.js, which the refresh just rebuilt)
snap=cache.setdefault('_snap',{})
lk={}
for p in eco['pools']:
  for s in (p['a'],p['b']):
    w=lk.setdefault(s,[0,0]);w[0]+=p.get('tvl_xrp',0)*(p.get('locked_pct') or 0);w[1]+=p.get('tvl_xrp',0)
snap[TODAY]={t['name']:[round(t['node'].get('tvl') or 0,1),t['node'].get('mcap_amm') or t['node'].get('mcap_xrp'),round(lk[t['name']][0]/lk[t['name']][1],1) if lk.get(t['name'],[0,0])[1] else None] for t in toks if 'node' in t}
json.dump(cache,open(CACHE,'w'),separators=(',',':'))
# ---- assemble daily grid ----
def D(s): return datetime.date.fromisoformat(s)
launch={}
for t in toks:
  c=cache[t['name']];cs=[x for x in (c.get('first'),t.get('xdate'),min(t['close']) if t['close'] else None) if x]
  launch[t['name']]=min(cs) if cs else TODAY
start=min(launch.values());N=(D(TODAY)-D(start)).days+1
idx=lambda s:(D(s)-D(start)).days
enc=lambda v:round(math.log10(v)*100) if v and v>0 else None
out={'d0':start,'n':N,'built':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
 'src':'Prices: daily closes, Data by xrpl.to (https://xrpl.to). Launch, AMM creation, burns, supply: XRP Ledger (xrplcluster.com). Locks + real TVL: nightly Burn City snapshots. Base width before nightly snapshots is an estimate.',
 'tok':{}}
for t in toks:
  nm=t['name'];c=cache[nm];L=idx(launch[nm]);o={'l':L}
  pools=[p for p in eco['pools'] if nm in (p['a'],p['b'])]
  ad=[amc.get(p.get('amm')) for p in pools if amc.get(p.get('amm'))]
  cl=t['close'];cd=sorted(cl)
  bond=min(ad) if ad else (cd[0] if cd else None)
  if bond: o['a']=max(L,idx(bond))
  burns=sorted(c.get('burns',[]))
  bd={}
  for b in burns: bd[b[0]]=bd.get(b[0],0)+1
  o['b']=[[idx(d),k] for d,k in sorted(bd.items()) if d>=start]
  if not c.get('done'): o['bp']=1
  if 'node' in t and cd:
    n=t['node'];circ=n.get('circ') or 0;pnow=cl[cd[-1]]
    # price per day from first close, log-interpolating gaps (flag them)
    s0=idx(cd[0]);m=[];x=[];vals=[]
    burnafter=sorted(((idx(b[0]),b[1]) for b in burns),reverse=True)
    for i in range(s0,N):
      ds=(D(start)+datetime.timedelta(i)).isoformat()
      if ds in cl: vals.append((cl[ds],False))
      else:
        nx=next((cl[e] for e in cd if e>ds),None);pv=vals[-1][0] if vals else None
        if pv and nx:
          # geometric interpolation to next known close
          j=next(k for k,e in enumerate(cd) if e>ds);pd=next(k for k in range(j-1,-1,-1));gap=(D(cd[j])-D(cd[pd])).days;pos=(D(ds)-D(cd[pd])).days
          v=cl[cd[pd]]*(cl[cd[j]]/cl[cd[pd]])**(pos/gap);vals.append((v,True))
        else: vals.append((pv or pnow,True))
    ba=sum(b[1] for b in burns);bi=0;bl=sorted(((idx(b[0]),b[1]) for b in burns))
    tv=n.get('tvl') or 0;mt=[];tt=[]
    for k,(v,ap) in enumerate(vals):
      i=s0+k
      while bi<len(bl) and bl[bi][0]<=i: ba-=bl[bi][1];bi+=1
      mt.append(enc(v*(circ+ba)) if circ else None)
      alive=sum(p.get('tvl_xrp',0) for p in pools if (amc.get(p.get('amm')) or bond or start)<=(D(start)+datetime.timedelta(i)).isoformat())
      share=alive/max(1e-9,sum(p.get('tvl_xrp',0) for p in pools)) if pools else 1
      tt.append(enc(tv*share*min(3,math.sqrt(max(v,1e-30)/pnow))) if tv else None)
      if ap:
        if x and x[-1][1]==i-1: x[-1][1]=i
        else: x.append([i,i])
    o['ms']=s0;o['m']=mt;o['t']=tt
    if x: o['x']=x
  elif 'node' in t and (t['node'].get('mcap_amm') or t['node'].get('mcap_xrp')):
    # no price history anywhere (e.g. xrpl.fun graduates unknown to xrpl.to): today's values carried back, flagged approximate
    n=t['node'];s0=o.get('a',L);k=N-s0
    o['ms']=s0;o['m']=[enc(n.get('mcap_amm') or n.get('mcap_xrp'))]*k;o['t']=[enc(n.get('tvl'))]*k;o['x']=[[s0,N-1]]
  # real nightly snapshots override estimates
  rs=sorted(d for d in snap if nm in snap[d])
  if rs and 'm' in o:
    o['tr']=[]
    for d in rs:
      i=idx(d)-o['ms']
      if 0<=i<len(o['t']):
        tv,mc,lpct=snap[d][nm];o['t'][i]=enc(tv);o['tr'].append(idx(d))
        if mc: o['m'][i]=enc(mc)
  ks=[[idx(d),snap[d][nm][2]] for d in rs if snap[d][nm][2] is not None]
  if ks:
    if ks[0][0]>o.get('a',L): ks.insert(0,[o.get('a',L),ks[0][1]]);o['k0']=1
    o['k']=ks
  if 'lot' in t: o['lot']=1;o['bond']=t['lot'].get('bond_pct')
  out['tok'][nm]=o
open(OUT,'w').write('window.HISTORY='+json.dumps(out,separators=(',',':'))+';\n')
print('start',start,'days',N,'tokens',len(out['tok']),'bytes',os.path.getsize(OUT))
