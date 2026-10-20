import subprocess,json,os
import sys; OUT=sys.argv[1] if len(sys.argv)>1 else 'client/arena/sfx'; os.makedirs(OUT,exist_ok=True)
R=lambda i:'raw/%s.mp3'%i
def pitch(r): return f'asetrate=44100*{r},aresample=44100'
# name: (inputs[(id,start,dur,pre-filter, gain)], post filter)
J=[]
def clip(name,parts,post='',fo=0.12,norm=-16):
    ins=[];fl=[]
    for k,(i,s,d,pf,g) in enumerate(parts):
        ins+=['-ss',str(s),'-t',str(d),'-i',R(i)]
        f=f'[{k}:a]aformat=sample_rates=44100:channel_layouts=mono'+(','+pf if pf else '')+f',volume={g}[a{k}]'; fl.append(f)
    mix=''.join(f'[a{k}]' for k in range(len(parts)))+(f'amix=inputs={len(parts)}:normalize=0:duration=longest' if len(parts)>1 else 'anull')
    chain=mix+(','+post if post else '')+f',silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I={norm}:TP=-1.5:LRA=11,areverse,afade=t=in:d={fo},areverse,afade=t=in:d=0.008[o]'
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y',*ins,'-filter_complex',';'.join(fl+[chain]),'-map','[o]','-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','96k',f'{OUT}/{name}.mp3']
    subprocess.run(cmd,check=True); J.append((name,[p[0] for p in parts]))
dist='lowpass=f=2400,aecho=0.8:0.7:120|260:0.35|0.22'
room='aecho=0.8:0.6:45|90:0.22|0.12'
# idle groans: pitched down, slight room
clip('groan1',[(58626,0.0,3.2,pitch(0.86),1)],room)
clip('groan2',[(58626,3.1,2.6,pitch(0.82),1)],room)
clip('groan3',[(58626,9.0,2.4,pitch(0.88),1)],room)
clip('groan4',[(125405,4.7,4.8,pitch(0.85),1)],room)
clip('groan5',[(426628,0.38,3.1,pitch(0.8),1)],room)
clip('groan6',[(196722,0.34,2.1,pitch(0.84),1),(125405,22.9,2.1,pitch(0.7),0.5)],room)
# close wet breathing (used up close, dry-ish)
clip('breath1',[(119515,3.9,4.2,pitch(0.88)+',lowpass=f=5000',1)],'',0.4)
clip('breath2',[(204963,1.6,3.3,pitch(0.9),1)],'',0.4)
clip('breath3',[(567723,0.7,4.4,pitch(0.85),1)],'',0.4)
# distant shrieks: low-passed + long echo
clip('shriek1',[(274217,0.0,2.6,'',1)],dist,0.6,-20)
clip('shriek2',[(274217,6.5,5.5,'',1)],dist,0.6,-20)
clip('shriek3',[(621004,0.0,4.9,pitch(0.9),1)],dist,0.6,-20)
clip('shriek4',[(442564,0.0,1.32,pitch(0.8),1)],dist,0.5,-20)
# attack screams (layered with a low growl for weight)
clip('attack1',[(213509,0.6,1.5,'',1),(398908,0.0,1.3,pitch(0.7),0.35)],'',0.15,-14)
clip('attack2',[(435651,0.0,2.2,pitch(0.92),1)],'',0.2,-14)
clip('attack3',[(179345,0.0,2.6,pitch(0.9),1)],'',0.2,-14)
clip('attack4',[(396797,0.0,1.26,pitch(0.85),1),(245223,0.0,1.2,pitch(0.75),0.4)],'',0.15,-14)
clip('attack5',[(245223,0.0,2.4,pitch(0.88),1)],'',0.2,-14)
# shamble / footsteps
clip('step1',[(221650,0.74,0.26,'',1)],'',0.05,-20)
clip('step2',[(221650,1.35,0.85,'',1)],'',0.1,-20)
clip('step3',[(221650,2.74,1.3,'',1)],'',0.15,-20)
clip('step4',[(272375,1.94,1.0,'',1)],'',0.15,-20)
# crawlers: skittering + wet creature
clip('crawl1',[(250540,0.0,2.9,'',1)],'',0.2,-18)
clip('crawl2',[(250540,8.2,2.6,'',1)],'',0.2,-18)
clip('crawl3',[(684865,0.0,1.1,pitch(0.8),1)],'',0.15,-18)
clip('crawl4',[(245222,0.52,3.6,pitch(0.85),1)],'',0.3,-18)
# special / Juggernaut roars: two octave-ish layers
clip('roar1',[(398908,1.39,3.2,pitch(0.8),1),(398908,1.39,3.2,pitch(0.6),0.55)],room,0.4,-13)
clip('roar2',[(476083,0.0,4.9,pitch(0.82),1),(476083,0.0,4.9,pitch(0.62),0.5)],room,0.5,-13)
clip('roar3',[(489901,0.0,2.52,pitch(0.78),1),(489901,0.0,2.52,pitch(0.58),0.5)],room,0.3,-13)
# bullet / fire impacts on flesh
clip('hit1',[(423301,0.0,0.6,'',1)],'',0.1,-15)
clip('hit2',[(423301,1.42,0.55,'',1)],'',0.1,-15)
clip('hit3',[(555420,0.0,0.6,'',1)],'',0.1,-15)
clip('headshot',[(511194,0.0,0.71,'',1)],'',0.1,-14)
clip('bite1',[(155973,1.87,0.4,'',1)],'',0.08,-14)
clip('bite2',[(155973,4.84,0.45,'',1)],'',0.08,-14)
clip('bite3',[(155973,10.72,0.95,'',1)],'',0.1,-14)
# weapons (heavier: low thump layer + tail)
clip('shotgun',[(318973,0.0,0.62,'',1),(773873,0.0,0.22,pitch(0.6),0.6),(163458,0.0,0.19,pitch(0.5),0.5)],'aecho=0.8:0.55:70|160|300:0.3|0.2|0.12,lowpass=f=9000',0.6,-11)
clip('pump',[(449614,0.0,0.5,'',1)],'',0.05,-17)
clip('firestorm',[(163458,0.0,0.45,pitch(0.8),1),(773873,0.0,0.22,'',0.7)],'aecho=0.8:0.5:60|150|320:0.32|0.2|0.12',0.55,-12)
clip('boom',[(186932,0.0,2.4,pitch(0.9),1)],'',0.8,-14)
clip('flame_start',[(447941,0.0,0.9,'',1)],'',0.2,-15)
clip('flame_loop',[(395038,2.45,1.5,'',1)],'',0.03,-16)
clip('flame_end',[(447941,0.9,1.0,'',1)],'',0.4,-17)
clip('beam_loop',[(187119,0.2,1.6,pitch(0.85),1)],'',0.05,-17)
clip('reload',[(432141,0.0,2.0,'',1)],'',0.1,-16)
clip('pistol_reload',[(396331,0.0,0.53,'',1)],'',0.05,-16)
clip('pistol',[(773873,0.0,0.2,pitch(1.35),1),(318973,0.0,0.2,pitch(1.5),0.4)],'aecho=0.8:0.4:50|120:0.25|0.12',0.35,-13)
clip('heartbeat',[(22440,0.0,0.7,'lowpass=f=900',1)],'',0.05,-12)
clip('horde',[(165872,0.7,20,pitch(0.85)+',lowpass=f=3500',1)],dist,1.5,-26)
json.dump(J,open('built.json','w'))
print('ok',len(J))
