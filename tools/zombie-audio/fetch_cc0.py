import re,json,subprocess,html,os,sys,concurrent.futures as cf
ids="58626 125405 165872 426628 196722 119515 204963 567723 274217 442564 621004 213509 435651 179345 245223 396797 221650 272375 250540 684865 245222 398908 476083 489901 423301 511194 555420 155973 395038 447941 318973 773873 449614 163458 186932 187119 432141 396331 22440".split()
def one(sid):
    h=subprocess.run(['curl','-sL','-m','40','-A','Mozilla/5.0','https://freesound.org/s/%s/'%sid],capture_output=True,text=True).stdout
    url=re.search(r'<link rel="canonical" href="([^"]+)"',h); url=url.group(1) if url else 'https://freesound.org/s/%s/'%sid
    lic=re.findall(r'creativecommons\.org/(publicdomain/zero|licenses/[a-z-]+)/[\d.]+',h)
    t=re.search(r'data-title="([^"]*)"',h); u=re.search(r'data-username="([^"]*)"',h); mp3=re.search(r'data-mp3="([^"]*)"',h)
    r=dict(id=sid,url=url,title=html.unescape(t.group(1)) if t else '',user=u.group(1) if u else '',lic=sorted(set(lic)))
    if mp3:
        hq=mp3.group(1).replace('-lq.mp3','-hq.mp3'); r['preview']=hq
        subprocess.run(['curl','-sL','-m','60','-o','raw/%s.mp3'%sid,hq])
    return r
with cf.ThreadPoolExecutor(8) as ex: res=list(ex.map(one,ids))
json.dump(res,open('meta.json','w'),indent=1)
for r in res: print(r['id'],r['lic'],r['user'],r['title'][:50],os.path.getsize('raw/%s.mp3'%r['id']) if os.path.exists('raw/%s.mp3'%r['id']) else 'NOFILE')
