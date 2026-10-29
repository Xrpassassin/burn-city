'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const status=$('status'),rows=$('reviews'),details=$('details');
 const credentials=()=>({Authorization:'Bearer '+$('bearer').value.trim(),'x-admin-token':$('admin').value.trim()});
 async function request(path){
  const response=await fetch(path,{method:'GET',headers:credentials(),cache:'no-store',credentials:'omit'});
  const data=await response.json().catch(()=>({error:'invalid_response'}));
  if(!response.ok)throw new Error(data.error||'request_failed');
  return data;
 }
 function cell(tr,value){
  const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);return td;
 }
 async function openReview(id){
  details.textContent='Loading…';
  try{
   const result=await request('/api/estates/admin/reviews/detail?reservationId='+encodeURIComponent(id));
   details.textContent=JSON.stringify(result,null,2);
  }catch(e){details.textContent='Unable to load review: '+e.message;}
 }
 $('load').addEventListener('click',async()=>{
  status.textContent='Loading reviews…';rows.replaceChildren();details.textContent='Select a review to inspect its evidence.';
  try{
   const data=await request('/api/estates/admin/reviews');
   if(!Array.isArray(data.reviews))throw new Error('invalid_review_response');
   for(const review of data.reviews){
    const tr=document.createElement('tr');
    cell(tr,review.reservation_id);cell(tr,review.propertyId);
    cell(tr,Number.isSafeInteger(review.priceDrops)?(review.priceDrops/1000000)+' XRP':'—');
    cell(tr,review.buyer);
    const td=document.createElement('td'),button=document.createElement('button');
    button.textContent='Inspect';button.addEventListener('click',()=>openReview(review.reservation_id));
    td.append(button);tr.append(td);rows.append(tr);
   }
   if(!data.reviews.length){const tr=document.createElement('tr'),td=cell(tr,'No pending reviews');td.colSpan=5;rows.append(tr);}
   status.textContent=data.reviews.length+' pending review(s) loaded.';
  }catch(e){status.textContent='Unable to load reviews: '+e.message;}
 });
 $('clear').addEventListener('click',()=>{
  $('bearer').value='';$('admin').value='';rows.replaceChildren();details.textContent='Credentials cleared.';status.textContent='Credentials cleared.';
 });
})();
