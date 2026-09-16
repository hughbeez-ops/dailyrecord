import { DurableObject } from "cloudflare:workers";
import webpush from "web-push";

export class ReminderRoom extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.env=env; }
  async fetch(req) {
    const url=new URL(req.url);
    if(req.method==="POST" && url.pathname==="/subscribe"){
      const sub=await req.json(); await this.ctx.storage.put("sub",sub); return json({ok:true});
    }
    if(req.method==="POST" && url.pathname==="/reminder"){
      const x=await req.json(); const id=crypto.randomUUID(); const when=Date.parse(x.when);
      if(!Number.isFinite(when)||when<=Date.now()) return json({error:"Reminder must be in the future"},400);
      await this.ctx.storage.put("reminder:"+id,{...x,id}); await this.ctx.storage.setAlarm(when); return json({id});
    }
    if(req.method==="DELETE" && url.pathname.startsWith("/reminder/")){
      const id=url.pathname.split("/").pop(); await this.ctx.storage.delete("reminder:"+id); return json({ok:true});
    }
    return json({error:"not found"},404);
  }
  async alarm(){
    const list=await this.ctx.storage.list({prefix:"reminder:"}); const now=Date.now();
    const sub=await this.ctx.storage.get("sub");
    let next=null;
    for(const [key,r] of list){
      const when=Date.parse(r.when);
      if(when<=now){
        if(sub){
          try{webpush.setVapidDetails(this.env.VAPID_SUBJECT,this.env.VAPID_PUBLIC_KEY,this.env.VAPID_PRIVATE_KEY); await webpush.sendNotification(sub,JSON.stringify({title:r.title||"DailyRecord",body:r.body||"Reminder"}));}
          catch(e){}
        }
        await this.ctx.storage.delete(key);
      } else if(next===null||when<next) next=when;
    }
    if(next) await this.ctx.storage.setAlarm(next);
  }
}
function json(x,status=200){return new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json","access-control-allow-origin":"*"}})}
export default {
 async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==="/api/vapid-public-key") return new Response(env.VAPID_PUBLIC_KEY,{headers:{"access-control-allow-origin":"*"}});
  if(u.pathname.startsWith("/api/")){
    const id=env.REMINDERS.idFromName("single-user"); const stub=env.REMINDERS.get(id);
    const path=u.pathname.replace("/api","");
    return stub.fetch(new Request(u.origin+path,{method:req.method,headers:req.headers,body:req.method==="GET"||req.method==="HEAD"?undefined:req.body}));
  }
  return env.ASSETS.fetch(req);
 }
};