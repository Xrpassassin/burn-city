import {ESTATE_ARCHITECTURES,ESTATE_ARCHITECTURE_NOTES,ESTATE_PALETTES,estatePalettePreview,estateFreeStyle} from './estate-free-style-options.mjs';
// In-world visual-only estate style picker. Saving never launches Xaman payments.
export function mountEstateFreeStyle(container,propertyId,{
 api='',fetcher=fetch,storage=localStorage,onPreview=()=>{},onSaved=()=>{},initialStyle={}
}={}){
 if(!container?.appendChild||typeof propertyId!=='string')throw TypeError('free_style_ui_container_required');
 const section=document.createElement('section');section.dataset.estateFreeStyle=propertyId;
 section.style.cssText='padding:10px 0;margin-top:12px;border-top:1px solid #8c9e9e66';
 const title=document.createElement('h4');title.textContent='Free home customization';
 const help=document.createElement('p');help.textContent='Choose an architectural design and exterior colors. These are always free: 0 XRP, no effect on ownership, upgrades or rewards.';
 help.style.cssText='font:12px/1.5 system-ui;color:#c4d2cf';
 section.append(title,help);
 const line=document.createElement('div');line.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0';
 function picker(label,choices){
  const wrap=document.createElement('label');wrap.textContent=label+' ';
  wrap.style.cssText='font:12px system-ui;color:#f1e4cb;display:grid;gap:4px;min-width:120px;flex:1';
  const select=document.createElement('select');select.style.cssText='min-height:42px;max-width:100%;border-radius:6px;background:#1d2c38;color:#f8eada;border:1px solid #72878d';
  for(const [value,display]of choices){
   const option=document.createElement('option');option.value=value;option.textContent=display;select.appendChild(option);
  }
  wrap.appendChild(select);line.appendChild(wrap);return select;
 }
 const architecture=picker('Base architecture',Object.entries(ESTATE_ARCHITECTURES));
 const palette=picker('Exterior colors',Object.entries(ESTATE_PALETTES).map(([k,v])=>[k,v.label]));
 section.appendChild(line);
 // Give the owner a useful visual explanation before saving: the combinations
 // are designed as coordinated wall/trim/roof/door schemes, not random tint sliders.
 const summary=document.createElement('p');
 summary.style.cssText='font:12px/1.45 system-ui;color:#d4d6cc;margin:5px 0';
 const chips=document.createElement('div');
 chips.style.cssText='display:flex;gap:7px;margin:8px 0;align-items:center;flex-wrap:wrap';
 const names=['Walls','Trim','Roof','Door'];
 const swatches=names.map(name=>{
  const chip=document.createElement('span');chip.title=name;chip.setAttribute('role','img');
  chip.setAttribute('aria-label',name+' color sample');
  chip.style.cssText='display:inline-block;width:40px;height:28px;border-radius:6px;border:1px solid #9eaaa1;box-shadow:inset 0 0 0 1px #10191b44';
  chips.appendChild(chip);return chip;
 });
 const chipsLegend=document.createElement('span');chipsLegend.textContent='Wall · trim · roof · door';
 chipsLegend.style.cssText='font:11px system-ui;color:#c5d1c8';
 chips.appendChild(chipsLegend);
 const updateStyleDetails=()=>{
  const selected=estateFreeStyle({architecture:architecture.value,palette:palette.value});
  summary.textContent=ESTATE_ARCHITECTURE_NOTES[selected.architecture]+' '+ESTATE_PALETTES[selected.palette].description;
  const values=estatePalettePreview(selected.palette);
  swatches.forEach((chip,i)=>{chip.style.background='#'+values[i].toString(16).padStart(6,'0');});
 };
 section.append(summary,chips);
 const row=document.createElement('div');row.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
 const status=document.createElement('p');status.setAttribute('role','status');
 status.style.cssText='font:12px/1.4 system-ui;color:#ffce96';
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;
  b.style.cssText='min-height:42px;padding:8px 12px;border-radius:7px;color:#fff0d9;background:#334957;border:1px solid #89a4a4;font:700 12px system-ui';
  b.addEventListener('click',fn);row.appendChild(b);return b;};
 let saved=estateFreeStyle(initialStyle),owner=false,busy=false,tokenAtOpen=storage?.getItem('bcToken')||'';
 const alive=()=>section.isConnected!==false;
 const choice=()=>estateFreeStyle({architecture:architecture.value,palette:palette.value});
 const sync=style=>{architecture.value=style.architecture;palette.value=style.palette;updateStyleDetails();};
 sync(saved);
 const preview=()=>{if(alive()){updateStyleDetails();onPreview(choice());}};
 architecture.addEventListener('change',preview);palette.addEventListener('change',preview);
 button('Preview free style',preview);
 const revert=button('Cancel preview',()=>{sync(saved);onPreview(null);status.textContent='Preview cleared. No changes made.';});
 const save=button('Save free style',()=>{void persist();});
 save.disabled=true;
 section.append(row,status);container.appendChild(section);
 async function request(method='GET',payload=null){
  const token=storage?.getItem('bcToken')||'';
  if(!token||token!==tokenAtOpen)throw Error('Connect the current owner wallet to customize this estate.');
  const url=api+'/api/estates/free-style'+(method==='GET'?'?propertyId='+encodeURIComponent(propertyId):'');
  const res=await fetcher(url,{method,cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await res.json();
  if(!alive()||storage?.getItem('bcToken')!==token)throw Error('Wallet changed during customization.');
  if(!res.ok||data.ok!==true)throw Error(data.error==='property_owner_required'?
   'Only the current verified property owner can save free styles.':data.error==='invalid_free_style'?
   'Choose an approved design and color scheme.':'Free customization is temporarily unavailable.');
  return data;
 }
 async function load(){
  if(!tokenAtOpen){status.textContent='Connect the owning Xaman wallet to save. You can still preview styles for free.';return;}
  try{
   const result=await request();saved=estateFreeStyle(result.style);owner=true;
   sync(saved);save.disabled=false;status.textContent='Owner verified. Choose a style, then Save free style (0 XRP).';
  }catch(e){if(alive())status.textContent=e.message;}
 }
 async function persist(){
  if(!owner||busy||!alive())return;
  busy=true;save.disabled=true;
  try{
   const result=await request('POST',{propertyId,...choice()});
   saved=estateFreeStyle(result.style);
   sync(saved);onPreview(null);onSaved(propertyId,saved);
   status.textContent='Style saved to this property for free. It persists across reloads and transfers.';
  }catch(e){if(alive())status.textContent=e.message;}
  finally{busy=false;if(alive())save.disabled=!owner||storage?.getItem('bcToken')!==tokenAtOpen;}
 }
 void load();
 return {section,refresh:load,dispose(){onPreview(null);section.remove();}};
}
