'use strict';
// Rebuild only a known CHECK constraint; preserve every column, row and index.
// These internal journals have no incoming foreign keys. Fail closed otherwise.
function extendCheck(db,table,oldCheck,newCheck){
 const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql;
 if(!sql||!sql.includes(oldCheck))return;
 for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()){
  if(db.prepare(`PRAGMA foreign_key_list("${name.replaceAll('"','""')}")`).all().some(r=>r.table===table))throw Error('estate_schema_dependency_review_required');
 }
 const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table);
 const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(r=>'"'+r.name+'"').join(',');
 const temporary=table+'_policy_upgrade';
 db.exec('SAVEPOINT estate_policy_upgrade');
 try{
  db.exec(sql.replace(table,temporary).replace(oldCheck,newCheck));
  db.exec(`INSERT INTO ${temporary}(${columns}) SELECT ${columns} FROM ${table}`);
  db.exec(`DROP TABLE ${table}; ALTER TABLE ${temporary} RENAME TO ${table}`);
  for(const r of indexes)db.exec(r.sql);
  db.exec('RELEASE estate_policy_upgrade');
 }catch(e){db.exec('ROLLBACK TO estate_policy_upgrade');db.exec('RELEASE estate_policy_upgrade');throw e;}
}
module.exports={extendCheck};
