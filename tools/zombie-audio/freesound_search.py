import re,sys,json,urllib.parse,subprocess,html
def search(q,n=12,maxdur=None):
    url='https://freesound.org/search/?q='+urllib.parse.quote_plus(q)+'&f='+urllib.parse.quote('license:"Creative Commons 0"')+'&s='+urllib.parse.quote('Downloads (most first)')
    h=subprocess.run(['curl','-s','-m','40','-A','Mozilla/5.0',url],capture_output=True,text=True).stdout
    out=[]
    for m in re.finditer(r'data-sound-id="(\d+)"\s+data-username="([^"]*)".*?data-mp3="([^"]*)".*?data-title="([^"]*)"\s+data-duration="([\d.]+)".*?data-num-downloads="(\d+)"',h,re.S):
        sid,user,mp3,title,dur,dl=m.groups(); dur=float(dur)
        if maxdur and dur>maxdur: continue
        out.append(dict(id=sid,user=user,mp3=mp3.replace('-lq.mp3','-hq.mp3'),title=html.unescape(title),dur=dur,dl=int(dl)))
    return out[:n]
if __name__=='__main__':
    for q in sys.argv[1:]:
        print('##',q)
        for r in search(q,10,60): print(f"{r['id']:>7} {r['dur']:6.1f}s {r['dl']:>6} {r['user'][:16]:16} {r['title'][:60]}")
