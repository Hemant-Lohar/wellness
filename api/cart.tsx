export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-access-token, content-type",
      },
    });
  }

  const authHeader  = req.headers.get("authorization") ?? "";
  const accessToken = req.headers.get("x-access-token") ?? "";
  const body        = await req.text();

  const upstream = "https://api.thewellnesscorner.com/store/tata-1mg/cart";

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "authorization":  authHeader,
        "x-access-token": accessToken,
        "content-type":   "application/json",
        "Origin":         "https://www.thewellnesscorner.com",
        "Referer":        "https://www.thewellnesscorner.com/",
        "User-Agent":     "Mozilla/5.0 (compatible)",
      },
      body,
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":                "application/json",
        "Cache-Control":               "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Cart proxy failed", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}