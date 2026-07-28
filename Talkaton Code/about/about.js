import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
"https://cxulgeojkjnskdyoktkj.supabase.co",
"sb_publishable_GgxtfIaIamzZFY_jMU4_Cw_V8NKm475"
);

const visitorCount=document.getElementById("visitorCount");

updateVisitorCounter();

async function updateVisitorCounter(){
try{
const {data,error}=await supabase.rpc("record_unique_visit",{
p_visitor_id:getVisitorId()
});

if(error)throw error;

const count=Number(data);
if(!Number.isFinite(count))throw new Error("Invalid visitor count");

visitorCount.textContent=count.toLocaleString();
}catch(error){
console.warn("Visitor counter unavailable:",error.message||error);
visitorCount.textContent="—";
visitorCount.closest(".aboutVisitorCounter")?.setAttribute(
"title",
"Visitor counter is temporarily unavailable"
);
}
}

function getVisitorId(){
const storageKey="talkatonVisitorId";
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let visitorId=localStorage.getItem(storageKey);

if(!uuidPattern.test(visitorId||"")){
visitorId=createUuid();
localStorage.setItem(storageKey,visitorId);
}

return visitorId;
}

function createUuid(){
if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();

const bytes=new Uint8Array(16);
globalThis.crypto.getRandomValues(bytes);
bytes[6]=(bytes[6]&0x0f)|0x40;
bytes[8]=(bytes[8]&0x3f)|0x80;
const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,"0"));

return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10).join("")}`;
}
