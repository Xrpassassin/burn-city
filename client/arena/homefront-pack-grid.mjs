// Minecraft-style presentation for Homefront's EXISTING eight stackable supply
// categories. Server/homefront-inventory.js remains the source of truth for
// stack limits and 24-unit carried WEIGHT: these are visual cells, not new
// server inventory slots or freely moveable item stacks.
export const FIELD_PACK_CELLS = 12;
export const FIELD_ITEM_CATALOG = Object.freeze([
  Object.freeze({ id:'food', label:'Cooked ration', icon:'🥫', weight:1, maxStack:8, use:'eatInField', action:'Eat ration', category:'food' }),
  Object.freeze({ id:'rawFood', label:'Raw food', icon:'🥩', weight:1, maxStack:8, use:null, action:'Cook at safe heat source', category:'food' }),
  Object.freeze({ id:'water', label:'Clean water', icon:'💧', weight:1, maxStack:8, use:'drinkInField', action:'Drink water', category:'water' }),
  Object.freeze({ id:'dirtyWater', label:'Dirty water', icon:'🫗', weight:1, maxStack:8, use:null, action:'Purify before drinking', category:'water' }),
  Object.freeze({ id:'meds', label:'Medical supplies', icon:'🩹', weight:1, maxStack:5, use:'bandageInField', action:'Treat injury', category:'medical' }),
  Object.freeze({ id:'ammo', label:'Ammunition', icon:'🔸', weight:1, maxStack:12, use:null, action:'Used when reloading', category:'equipment' }),
  Object.freeze({ id:'scrap', label:'Scrap', icon:'⚙️', weight:2, maxStack:8, use:null, action:'Crafting material', category:'craft' }),
  Object.freeze({ id:'wood', label:'Wood', icon:'🪵', weight:2, maxStack:8, use:null, action:'Fuel and crafting material', category:'craft' })
]);

const finiteQuantity = (value,max) => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(max,Math.max(0,Math.floor(value))) : 0;

export function fieldPackModel(serverInventory) {
  // Fallback is deliberately an empty, disabled pack rather than the refuge's
  // stored resources. Never derive personal inventory from another player.
  const available = !!serverInventory && typeof serverInventory === 'object' &&
    !Array.isArray(serverInventory);
  const slots = FIELD_ITEM_CATALOG.map(item => Object.freeze({
    ...item, quantity: available ? finiteQuantity(serverInventory[item.id],item.maxStack) : 0
  }));
  const used = slots.reduce((sum,slot) => sum+slot.quantity*slot.weight,0);
  const maxWeight = available ? Math.max(1,Math.min(24,finiteQuantity(serverInventory.capacity,24)||24)) : 24;
  // All carried counts and per-item limits remain bounded. The model is
  // non-authoritative and makes no mutation requests to the server.
  const cells = [...slots, ...Array.from({length:Math.max(0,FIELD_PACK_CELLS-slots.length)},(_,i)=>
    Object.freeze({id:'empty-'+i,quantity:0,empty:true}))];
  return Object.freeze({
    available,
    cells:Object.freeze(cells),
    used,
    capacity:maxWeight,
    remaining:Math.max(0,maxWeight-used),
    full:used>=maxWeight
  });
}

export function fieldPackKey(serverInventory) {
  const model=fieldPackModel(serverInventory);
  return (model.available?'1':'0')+'|'+model.capacity+'|'+model.cells.map(s=>s.id+':'+s.quantity).join('|');
}

export function createFieldPackGrid(doc, inventory, onUse = () => {}) {
  if (!doc?.createElement) throw new TypeError('document required');
  const pack=fieldPackModel(inventory);
  const create=(tag,className,textContent)=>{const node=doc.createElement(tag);
    if(className)node.className=className;
    if(textContent!==undefined)node.textContent=String(textContent);
    return node;};
  const wrapper=create('section','hf-pack');
  wrapper.setAttribute('aria-label','Field backpack inventory');
  const header=create('div','hf-pack-title');
  const label=create('strong','', 'Field backpack · '+pack.used+'/'+pack.capacity+' weight');
  const note=create('small','',pack.available
    ? pack.remaining+' capacity left · stack limits apply'
    : 'Enter the Graveyard to view carried supplies');
  header.append(label,note);
  const meter=create('div','hf-pack-meter');
  meter.setAttribute('role','progressbar');
  meter.setAttribute('aria-label','Field backpack weight');
  meter.setAttribute('aria-valuenow',String(pack.used));
  meter.setAttribute('aria-valuemax',String(pack.capacity));
  const fill=create('div','hf-pack-fill');
  fill.style.width=Math.max(0,Math.min(100,pack.used/pack.capacity*100))+'%';
  if(pack.full)fill.classList.add('full');
  meter.append(fill);
  const grid=create('div','hf-pack-grid');
  grid.setAttribute('role','group');
  grid.setAttribute('aria-label','Supply stacks');
  const detail=create('div','hf-pack-detail','Select a supply to inspect it.');
  let selectedId=null;
  const buttons=new Map();
  function choose(slot) {
    if(!pack.available||slot.empty)return;
    selectedId=slot.id;
    for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===slot.id));
    detail.replaceChildren();
    detail.append(create('strong','',slot.icon+' '+slot.label+' ×'+slot.quantity),
      create('p','',slot.weight+' weight each · '+slot.quantity+'/'+slot.maxStack+' max per item type · '+slot.action));
    if(slot.use&&slot.quantity>0) {
      const use=create('button','hf-pack-use','Use 1 · '+slot.label);
      use.type='button';
      use.addEventListener('click',()=>onUse(slot.use));
      detail.append(use);
    }
  }
  for(const slot of pack.cells){
    const b=create('button','hf-pack-slot',slot.empty?'':slot.icon);
    b.type='button';
    b.disabled=!pack.available||!!slot.empty;
    b.setAttribute('aria-label',slot.empty?'Empty display cell':slot.label+', '+slot.quantity+' of '+slot.maxStack);
    b.setAttribute('aria-pressed','false');
    b.title=slot.empty?'Empty display cell':slot.label+' · '+slot.quantity+'/'+slot.maxStack+' · '+slot.weight+' weight each';
    if(slot.empty)b.classList.add('empty');
    else if(slot.quantity===0)b.classList.add('zero');
    if(!slot.empty) {
      const count=create('span','hf-pack-count',slot.quantity?'×'+slot.quantity:'0');
      b.append(count);
      buttons.set(slot.id,b);
      b.addEventListener('click',()=>choose(slot));
    }
    grid.append(b);
  }
  wrapper.append(header,meter,grid,detail,
    create('small','hf-pack-footnote',
      'Supplies are stored as server-controlled item-type stacks; empty cells are visual only. '+
      'Changing item positions or splitting stacks is not available yet. Use refuge controls to pack or stash supplies.'));
  return wrapper;
}
