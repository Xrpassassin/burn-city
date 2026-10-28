'use strict';
// Read-only CLI; the shared audit stays inside the runtime server package.
const {auditBurnSupply}=require('../server/burn-supply-audit');
async function rpc(method,params){
 if(!['server_info','account_info','gateway_balances','account_objects'].includes(method))throw Error('method not allowed in read-only supply audit');
 const response=await fetch('https://xrplcluster.com/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('RPC HTTP '+response.status);const r=await response.json();if(r.result?.error||!r.result)throw Error(r.result?.error||'empty RPC');return r.result;
}
if(require.main===module)auditBurnSupply({rpc}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={auditBurnSupply};
