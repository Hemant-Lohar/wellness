export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q        = url.searchParams.get("q") ?? "";
  const types    = url.searchParams.get("types") ?? "sku";
  const per_page = url.searchParams.get("per_page") ?? "50";

  const params = new URLSearchParams({ q, types, per_page });
  const upstream = `https://api.1mg.com/api/v4/search/autocomplete?${params.toString()}`;

  try {
    const response = await fetch(upstream, {
      headers: {
        "Accept":       "application/vnd.healthkartplus.v7+json",
        "hkp-platform": "HealthKartPlus-11.0.0-Android",
        "x-api-key":    "1mg_client_access_key",
        "x-access-key": "1mg_client_access_key",
        "x-city":       "Pune",
        "Origin":       "https://www.thewellnesscorner.com",
        "Referer":      "https://www.thewellnesscorner.com/",
        "User-Agent":   "Mozilla/5.0 (compatible)",
      },
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":  "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Search proxy failed", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}