import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const ua = {
  "User-Agent": "GeziTripPlanner/1.1",
  "Accept-Language": "en,ka;q=0.9"
};
const err=(m:string,s=400)=>new Response(JSON.stringify({error:m}),{status:s,headers:{...cors,"Content-Type":"application/json"}});

function privateIPv4(ip:string){
  const p=ip.split(".").map(Number);
  if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255)) return false;
  return p[0]===10 || p[0]===127 || p[0]===0 ||
    (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) ||
    (p[0]===192&&p[1]===168) || (p[0]===100&&p[1]>=64&&p[1]<=127) ||
    p[0]>=224;
}
function privateIPv6(ip:string){
  const s=ip.toLowerCase().replace(/^\[|\]$/g,"");
  return s==="::" || s==="::1" || s.startsWith("fc") || s.startsWith("fd") ||
    /^fe[89ab]/.test(s) || s.startsWith("ff") || s.startsWith("::ffff:127.") ||
    s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
}
async function assertPublicHttps(u:URL){
  if(u.protocol!=="https:") throw new Error("Only public HTTPS image URLs are allowed.");
  const h=u.hostname.toLowerCase().replace(/\.$/,"");
  if(!h || h==="localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
     h.endsWith(".internal") || h.endsWith(".home") || privateIPv4(h) || privateIPv6(h)){
    throw new Error("Private or local image hosts are not allowed.");
  }
  // Resolve DNS before each request to prevent public hostnames from targeting private networks.
  try{
    const ips:string[]=[];
    try{ips.push(...await Deno.resolveDns(h,"A"))}catch{}
    try{ips.push(...await Deno.resolveDns(h,"AAAA"))}catch{}
    if(!ips.length) throw new Error("Image host could not be resolved.");
    if(ips.some(ip=>privateIPv4(ip)||privateIPv6(ip))) throw new Error("Image host resolves to a private network.");
  }catch(e){
    if(e instanceof Error && (e.message.includes("private")||e.message.includes("resolved"))) throw e;
    throw new Error("Image host could not be resolved.");
  }
}
async function safeFetch(start:URL, accept:string){
  let u=start;
  for(let i=0;i<=MAX_REDIRECTS;i++){
    await assertPublicHttps(u);
    const r=await fetch(u,{redirect:"manual",headers:{...ua,"Accept":accept}});
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get("location");
      if(!loc) return r;
      u=new URL(loc,u);
      continue;
    }
    return r;
  }
  throw new Error("Too many redirects.");
}
async function readLimited(r:Response,max:number){
  const declared=Number(r.headers.get("content-length")||0);
  if(declared&&declared>max) throw new Error("Remote file is too large.");
  const b=new Uint8Array(await r.arrayBuffer());
  if(b.byteLength>max) throw new Error("Remote file is too large.");
  return b;
}
async function imageFetch(u:URL){
  const r=await safeFetch(u,"image/avif,image/webp,image/*,*/*;q=0.8");
  if(!r.ok) return null;
  const t=(r.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  if(!t.startsWith("image/")) return null;
  const b=await readLimited(r,MAX_IMAGE_BYTES);
  return {b,t};
}
async function imageFromPage(u:URL){
  const r=await safeFetch(u,"text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
  if(!r.ok) return null;
  const type=(r.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html")&&!type.includes("application/xhtml")) return null;
  const bytes=await readLimited(r,MAX_HTML_BYTES);
  const html=new TextDecoder().decode(bytes);
  const patterns=[
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i
  ];
  let raw="";
  for(const p of patterns){const m=html.match(p);if(m){raw=m[1];break}}
  if(!raw) return null;
  raw=raw.replace(/&amp;/g,"&");
  let iu:URL; try{iu=new URL(raw,u)}catch{return null}
  return await imageFetch(iu);
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return err("Method not allowed",405);
  try{
    const body=await req.json();
    let u:URL; try{u=new URL(String(body.url||"").trim())}catch{return err("Invalid image URL")}
    await assertPublicHttps(u);

    // First try the supplied URL as a direct image. If it is a web page,
    // fall back to its OpenGraph/Twitter preview image.
    let got=await imageFetch(u);
    if(!got) got=await imageFromPage(u);
    if(!got) return err("No usable image found for this source",502);

    return new Response(got.b,{headers:{...cors,"Content-Type":got.t,"Cache-Control":"no-store"}});
  }catch(e){
    const m=e instanceof Error?e.message:String(e);
    const status=/private|local|HTTPS/i.test(m)?403:502;
    return err(m,status);
  }
});
