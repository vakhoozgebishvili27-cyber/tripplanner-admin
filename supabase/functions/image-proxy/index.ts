import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "storage.georgia.travel",
  "cdn.georgiantravelguide.com"
]);

function reply(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: corsHeaders });
}

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return reply("Method not allowed.", 405);
    if (!(req.headers.get("authorization") || "").toLowerCase().startsWith("bearer ")) {
      return reply("Authentication required.", 401);
    }

    try {
      const { url: raw } = await req.json();
      let url: URL;
      try { url = new URL(String(raw || "").trim()); }
      catch { return reply("Invalid image URL."); }

      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
        return reply("Image host is not approved for bulk import.", 403);
      }

      const upstream = await fetch(url, {
        redirect: "follow",
        headers: { "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" }
      });
      if (!upstream.ok) return reply(`Image source returned HTTP ${upstream.status}.`, 502);

      const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!type.startsWith("image/")) return reply("URL did not return an image.", 415);

      const declared = Number(upstream.headers.get("content-length") || 0);
      if (declared && declared > MAX_BYTES) return reply("Image is larger than 8 MB.", 413);
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) return reply("Image is larger than 8 MB.", 413);

      return new Response(bytes, {
        headers: { ...corsHeaders, "Content-Type": type, "Cache-Control": "no-store" }
      });
    } catch (e) {
      return reply(e instanceof Error ? e.message : String(e), 500);
    }
  }
};
