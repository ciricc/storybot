
/** files indexes **/
db.getCollection("files").ensureIndex({
  "_id": NumberInt(1)
},[
  
]);

/** groups indexes **/
db.getCollection("groups").ensureIndex({
  "_id": NumberInt(1)
},[
  
]);

/** users indexes **/
db.getCollection("users").ensureIndex({
  "_id": NumberInt(1)
},[
  
]);

/** viewers indexes **/
db.getCollection("viewers").ensureIndex({
  "_id": NumberInt(1)
},[
  
]);

/** files records **/

/** groups records **/

/** users records **/

/** viewers records **/
