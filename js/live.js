// Live XRPL feed (read-only). Subscribes to issuer / AMM / blackhole accounts and emits normalized events.
// No keys, no signing: only `subscribe`, `amm_info`, `account_lines` public requests.
const ENDPOINTS=['wss://xrplcluster.com','wss://s1.ripple.com','wss://s2.ripple.com'];
const BLACKHOLES=['rrrrrrrrrrrrrrrrrrrrrhoLvTp','rrrrrrrrrrrrrrrrrrrrBZbvji'];
const hexCur=c=>c&&c.length===40&&!/^03/.test(c)?c.replace(/(00)+$/,'').match(/../g).map(h=>String.fromCharCode(parseInt(h,16))).join('').replace(/\0/g,''):c;

export class LiveFeed{
  constructor(eco,{onEvent,onStatus,burnTokens=['BURN','IMM','IMG','XRPyro'],recheckMin=15}={}){
    this.onEvent=onEvent||(()=>{});this.onStatus=onStatus||(()=>{});this.recheckMin=recheckMin;
    this.tok={};eco.nodes.forEach(n=>{if(n.key&&n.key.includes('-')){const [iss,cur]=n.key.split('-');this.tok[n.name]={name:n.name,iss,cur,code:hexCur(cur),price:n.price_xrp}}});
    this.burn=burnTokens.map(t=>this.tok[t]).filter(Boolean);
    this.pools=eco.pools.filter(p=>p.amm);this.byAmm={};this.pools.forEach(p=>this.byAmm[p.amm]=p);
    this.bh=new Set(BLACKHOLES);eco.pools.forEach(p=>(p.top_lp||[]).forEach(t=>{if(t.tag==='BH')this.bh.add(t.acct)}));
    this.seen=new Set();this.seenQ=[];this.ep=0;this.retry=0;this.reqId=1;this.pending={};this.closed=false;this.ledger=null;this.lastMsg=0;
  }
  start(){this.connect();this.hb=setInterval(()=>{if(this.ws&&this.ws.readyState===1&&Date.now()-this.lastMsg>25000)this.ws.close()},5000);
    this.rc=setInterval(()=>this.recheckLocks(),this.recheckMin*60000);return this}
  stop(){this.closed=true;clearInterval(this.hb);clearInterval(this.rc);clearTimeout(this.rt);this.ws&&this.ws.close()}
  status(s,extra){this.state=s;this.onStatus(s,{endpoint:ENDPOINTS[this.ep],ledger:this.ledger,...extra})}
  connect(){if(this.closed)return;const url=ENDPOINTS[this.ep];this.status('connecting');let ws;
    try{ws=new WebSocket(url)}catch(e){return this.backoff()}
    this.ws=ws;ws.onopen=()=>{this.retry=0;this.lastMsg=Date.now();
      const accounts=[...new Set([...this.burn.map(t=>t.iss),...this.pools.map(p=>p.amm),...this.bh])];
      this.send({command:'subscribe',streams:['ledger'],accounts}).then(r=>{this.ledger=r&&r.ledger_index;this.status('live')}).catch(()=>{})};
    ws.onmessage=m=>{this.lastMsg=Date.now();let d;try{d=JSON.parse(m.data)}catch{return}
      if(d.id&&this.pending[d.id]){const p=this.pending[d.id];delete this.pending[d.id];d.status==='success'?p.res(d.result):p.rej(d.error);return}
      if(d.type==='ledgerClosed'){this.ledger=d.ledger_index;if(this.state!=='live')this.status('live');else this.onStatus('live',{endpoint:url,ledger:this.ledger,tick:true});return}
      if(d.type==='transaction'&&d.validated){try{this.handle(d)}catch(e){/* malformed tx: ignore */}}};
    ws.onerror=()=>{};ws.onclose=()=>{Object.values(this.pending).forEach(p=>p.rej('closed'));this.pending={};if(!this.closed)this.backoff()}}
  backoff(){this.ep=(this.ep+1)%ENDPOINTS.length;const d=Math.min(30000,1000*2**Math.min(this.retry++,5))*(.8+Math.random()*.4);
    this.status('reconnecting',{inMs:d});clearTimeout(this.rt);this.rt=setTimeout(()=>this.connect(),d)}
  send(o){return new Promise((res,rej)=>{if(!this.ws||this.ws.readyState!==1)return rej('nc');const id=this.reqId++;this.pending[id]={res,rej};this.ws.send(JSON.stringify({...o,id}));setTimeout(()=>{if(this.pending[id]){delete this.pending[id];rej('timeout')}},15000)})}
  dedupe(h){if(!h||this.seen.has(h))return false;this.seen.add(h);this.seenQ.push(h);if(this.seenQ.length>800)this.seen.delete(this.seenQ.shift());return true}
  handle(d){const tx=d.transaction||d.tx_json||d.tx,meta=d.meta,hash=d.hash||tx.hash;if(!tx||!meta||meta.TransactionResult!=='tesSUCCESS'||!this.dedupe(hash))return;
    const when=d.close_time_iso?new Date(d.close_time_iso):new Date();const base={hash,ledger:d.ledger_index,when,account:tx.Account};
    const amt=meta.delivered_amount||meta.DeliveredAmount||tx.Amount;
    if(tx.TransactionType==='Payment'&&amt&&typeof amt==='object'){
      const t=this.burn.find(t=>t.iss===tx.Destination&&amt.issuer===t.iss&&amt.currency===t.cur);
      if(t){this.onEvent({...base,type:'burn',token:t.name,amount:+amt.value});return}
      const lp=this.byAmm[amt.issuer];if(lp&&this.bh.has(tx.Destination)){this.onEvent({...base,type:'lock',pool:lp,amount:+amt.value,lpc:amt.currency});return}}
    if(tx.TransactionType!=='Payment'&&tx.TransactionType!=='OfferCreate')return;
    const nodes=(meta.AffectedNodes||[]).map(n=>n.ModifiedNode||n.CreatedNode||n.DeletedNode).filter(Boolean);
    const touched=new Map();
    nodes.forEach(n=>{const f=n.FinalFields||n.NewFields||{},pf=n.PreviousFields||{};
      if(n.LedgerEntryType==='AccountRoot'&&this.byAmm[f.Account]&&pf.Balance!=null){const p=this.byAmm[f.Account];const x=Math.abs(f.Balance-pf.Balance)/1e6;const o=touched.get(p)||{xrp:0,tok:0};o.xrp=Math.max(o.xrp,x);touched.set(p,o)}
      if(n.LedgerEntryType==='RippleState'&&pf.Balance){const hi=f.HighLimit&&f.HighLimit.issuer,lo=f.LowLimit&&f.LowLimit.issuer;const amm=this.byAmm[hi]?hi:this.byAmm[lo]?lo:null;if(!amm)return;
        const p=this.byAmm[amm],cur=f.Balance.currency,dv=Math.abs(+f.Balance.value-(+pf.Balance.value));const tk=Object.values(this.tok).find(t=>(t.cur===cur||t.code===cur)&&(t.name===p.a||t.name===p.b));
        if(tk&&tk.price){const o=touched.get(p)||{xrp:0,tok:0};o.tok=Math.max(o.tok,dv*tk.price);touched.set(p,o)}}});
    touched.forEach((o,p)=>{const xrp=o.xrp||o.tok;if(xrp>0)this.onEvent({...base,type:'trade',pool:p,xrp,estimate:!o.xrp,kind:tx.TransactionType})})}
  // periodic recheck of locked % (catches locks done via AMMDeposit straight from a blackholed path, or missed while offline)
  async recheckLocks(pools){const list=pools||this.pools.filter(p=>p.locked_pct<99.5&&p.tvl_xrp>=100);
    for(const p of list){try{const ai=await this.send({command:'amm_info',amm_account:p.amm,ledger_index:'validated'});const lp=ai.amm.lp_token,tot=+lp.value;if(!tot)continue;
      const al=await this.send({command:'account_lines',account:p.amm,ledger_index:'validated',limit:400});
      const locked=al.lines.filter(l=>l.currency===lp.currency&&this.bh.has(l.account)).reduce((s,l)=>s+Math.abs(+l.balance),0);const pct=100*locked/tot;
      if(pct>p.locked_pct+.5)this.onEvent({type:'lock',pool:p,pct,hash:'recheck-'+p.amm+'-'+pct.toFixed(1),when:new Date(),source:'recheck'});
      }catch(e){}await new Promise(r=>setTimeout(r,1500))}}
}
