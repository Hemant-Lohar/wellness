import { useState, useEffect, useRef, useCallback } from "react";

const TOKEN_KEY = "wc_token";
const PAGE_SIZE = 20;

/* ── API ── */
async function apiSearch(q) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&types=sku&per_page=50`, {
    headers: {
      "Accept": "application/vnd.healthkartplus.v7+json",
      "hkp-platform": "HealthKartPlus-11.0.0-Android",
      "x-api-key": "1mg_client_access_key",
      "x-access-key": "1mg_client_access_key",
      "x-city": "Pune",
    },
  });
  if (!res.ok) throw new Error("Search failed");
  const json = await res.json();
  return (json?.data?.search_results ?? [])
    .filter(i => ["otc","product","sku"].includes(i.type) || !i.type)
    .map(i => ({
      sku: String(i.id ?? ""),
      name: (i.name ?? "").replace(/<[^>]*>/g, ""),
      image: (i.image ?? "").replace("https://onemg.gumlet.io", "/img"),
      price: Number(i.price ?? 0),
      manufacturer: i.manufacturer_name ?? "",
      pack: i.pack_form ?? "",
    }))
    .filter(p => p.sku && p.name);
}

async function apiAddToCart(token, sku, qty) {
  const res = await fetch("/api/cart", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "x-access-token": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ skuId: sku, quantity: qty }),
  });
  if (!res.ok) throw new Error("Cart failed");
}

/* ── Hooks ── */
function usePersistentToken() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const save  = useCallback(v => { setToken(v); localStorage.setItem(TOKEN_KEY, v); }, []);
  const clear = useCallback(() => { setToken(""); localStorage.removeItem(TOKEN_KEY); }, []);
  return [token, save, clear];
}

function useDebounce(value, delay) {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return dv;
}

function useCart() {
  const [items, setItems] = useState({});
  const add    = useCallback((sku, qty = 1) => setItems(c => ({ ...c, [sku]: (c[sku] ?? 0) + qty })), []);
  const remove = useCallback(sku => setItems(c => { const n = { ...c }; delete n[sku]; return n; }), []);
  const update = useCallback((sku, qty) => qty <= 0 ? remove(sku) : setItems(c => ({ ...c, [sku]: qty })), [remove]);
  const clear  = useCallback(() => setItems({}), []);
  const count  = Object.values(items).reduce((a, b) => a + b, 0);
  return { items, add, remove, update, clear, count };
}

/* ── Components ── */
function ProductImg({ src, name }) {
  const [err, setErr] = useState(false);
  const clean = src ? src.replace(/\/l_watermark[^/]*\/[^/]*\//, "/") : "";
  if (!clean || err) return (
    <div style={{ width:80, height:80, borderRadius:12, background:"#E0F2F1", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontSize:26, fontWeight:700, color:"#00897B" }}>{(name??"?").charAt(0).toUpperCase()}</span>
    </div>
  );
  return (
    <div style={{ width:80, height:80, borderRadius:12, overflow:"hidden", flexShrink:0, background:"#F5F9F8", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <img src={clean} alt={name} onError={() => setErr(true)} style={{ width:"100%", height:"100%", objectFit:"contain", padding:4 }} />
    </div>
  );
}

function RippleBtn({ children, onClick, variant="primary", disabled, full, sm }) {
  const [rips, setRips] = useState([]);
  const fire = e => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect(), id = Date.now();
    setRips(rs => [...rs, { id, x: e.clientX-r.left, y: e.clientY-r.top }]);
    setTimeout(() => setRips(rs => rs.filter(rr => rr.id !== id)), 600);
    onClick?.(e);
  };
  const V = { primary:{background:"#00897B",color:"#fff"}, tonal:{background:"#E0F2F1",color:"#00695C"}, ghost:{background:"transparent",color:"#00897B",border:"1.5px solid #00897B"} };
  return (
    <button onClick={fire} disabled={disabled} style={{ position:"relative", overflow:"hidden", border:"none", cursor:disabled?"not-allowed":"pointer", borderRadius:999, padding:sm?"7px 16px":"10px 22px", fontFamily:"inherit", fontWeight:600, fontSize:sm?13:14, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, width:full?"100%":undefined, opacity:disabled?.45:1, flexShrink:0, ...V[variant] }}>
      <span style={{ position:"relative", zIndex:1 }}>{children}</span>
      {rips.map(rp => <span key={rp.id} style={{ position:"absolute", left:rp.x, top:rp.y, width:8, height:8, borderRadius:"50%", transform:"translate(-50%,-50%) scale(0)", background:variant==="primary"?"rgba(255,255,255,.45)":"rgba(0,137,123,.3)", animation:"rpl .6s ease-out forwards", pointerEvents:"none" }} />)}
    </button>
  );
}

function QtyControl({ qty, onChange, sm }) {
  const p = sm ? "5px 10px" : "7px 13px", f = sm ? 13 : 15;
  return (
    <div style={{ display:"flex", alignItems:"center", border:"1.5px solid #DDE8E6", borderRadius:999, overflow:"hidden", flexShrink:0 }}>
      <button onClick={() => onChange(qty-1)} style={{ border:"none", background:"none", padding:p, cursor:"pointer", fontSize:f, color:"#333", lineHeight:1 }}>−</button>
      <span style={{ fontSize:f-1, fontWeight:600, minWidth:sm?20:26, textAlign:"center", color:"#1A2422" }}>{qty}</span>
      <button onClick={() => onChange(qty+1)} style={{ border:"none", background:"none", padding:p, cursor:"pointer", fontSize:f, color:"#333", lineHeight:1 }}>+</button>
    </div>
  );
}

function ProductCard({ p, onAdd }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const handleAdd = () => { onAdd(p.sku, qty); setAdded(true); setTimeout(() => setAdded(false), 1200); };
  return (
    <div style={{ background:"#fff", border:`1.5px solid ${added?"#00897B":"#EAF0EF"}`, borderRadius:16, padding:16, display:"flex", flexDirection:"column", gap:14, transition:"border-color .2s, box-shadow .2s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        <ProductImg src={p.image} name={p.name} />
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:14, fontWeight:600, lineHeight:1.45, color:"#1A2422", marginBottom:3 }}>{p.name}</p>
          {p.manufacturer && <p style={{ fontSize:11, color:"#B0BEC5", marginBottom:2 }}>{p.manufacturer}</p>}
          {p.pack && <p style={{ fontSize:11, color:"#90A4A0", marginBottom:4 }}>{p.pack}</p>}
          {p.price > 0 ? <p style={{ fontSize:17, fontWeight:700, color:"#00897B" }}>₹{p.price}</p> : <p style={{ fontSize:11, color:"#B0BEC5" }}>SKU {p.sku}</p>}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <QtyControl qty={qty} onChange={q => setQty(Math.max(1,q))} />
        <RippleBtn onClick={handleAdd} variant={added?"tonal":"primary"}>{added?"✓ Added":"Add to cart"}</RippleBtn>
      </div>
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, Math.min(page-2, totalPages-4));
  const end   = Math.min(totalPages, Math.max(page+2, 5));
  for (let i = start; i <= end; i++) pages.push(i);
  const Btn = ({ label, target, disabled: dis }) => (
    <button key={label} onClick={() => !dis && onChange(target)} disabled={dis} style={{ border:"1.5px solid", borderRadius:10, borderColor:target===page?"#00897B":"#DDE8E6", background:target===page?"#00897B":"#fff", color:target===page?"#fff":dis?"#CCC":"#1A2422", fontFamily:"inherit", fontWeight:600, fontSize:14, padding:"8px 14px", cursor:dis?"not-allowed":"pointer", minWidth:40, transition:"all .15s" }}>{label}</button>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:32, flexWrap:"wrap" }}>
      <Btn label="←" target={page-1} disabled={page===1} />
      {start > 1 && <><Btn label={1} target={1} />{start > 2 && <span style={{ color:"#B0BEC5", padding:"0 4px" }}>…</span>}</>}
      {pages.map(p => <Btn key={p} label={p} target={p} />)}
      {end < totalPages && <>{end < totalPages-1 && <span style={{ color:"#B0BEC5", padding:"0 4px" }}>…</span>}<Btn label={totalPages} target={totalPages} /></>}
      <Btn label="→" target={page+1} disabled={page===totalPages} />
    </div>
  );
}

function CartDrawer({ open, onClose, cart, products, onCheckout, checkingOut }) {
  const entries = Object.entries(cart.items);
  const total   = entries.reduce((s,[sku,qty]) => s+((products[sku]?.price??0)*qty), 0);
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:200, background:open?"rgba(0,0,0,.32)":"transparent", pointerEvents:open?"all":"none", transition:"background .3s" }} />
      <aside style={{ position:"fixed", top:0, right:0, bottom:0, zIndex:201, width:"min(420px,100vw)", background:"#fff", display:"flex", flexDirection:"column", transform:open?"translateX(0)":"translateX(100%)", transition:"transform .32s cubic-bezier(.4,0,.2,1)", boxShadow:open?"-6px 0 36px rgba(0,0,0,.12)":"none" }}>
        <div style={{ display:"flex", alignItems:"center", padding:"18px 20px 14px", borderBottom:"1px solid #EEF2F1" }}>
          <h2 style={{ flex:1, fontSize:19, fontWeight:700, fontFamily:"'Bricolage Grotesque',sans-serif", color:"#1A2422" }}>Your cart</h2>
          {cart.count > 0 && <span style={{ fontSize:12, background:"#F0FAF8", color:"#7A9490", borderRadius:999, padding:"3px 10px", marginRight:10 }}>{cart.count} item{cart.count!==1?"s":""}</span>}
          <button onClick={onClose} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#B0BEC5", lineHeight:1, padding:4 }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px" }}>
          {entries.length === 0
            ? <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:280, gap:10, color:"#B0BEC5" }}><span style={{ fontSize:48, opacity:.3 }}>🛍️</span><p style={{ fontSize:15, fontWeight:500 }}>Your cart is empty</p><p style={{ fontSize:13 }}>Search and add products</p></div>
            : entries.map(([sku,qty]) => {
                const p = products[sku]; if (!p) return null;
                return (
                  <div key={sku} style={{ display:"flex", gap:12, padding:"14px 0", borderBottom:"1px solid #F0F4F3", alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:600, lineHeight:1.4, color:"#1A2422", marginBottom:2 }}>{p.name}</p>
                      {p.price > 0 && <p style={{ fontSize:12, color:"#7A9490" }}>₹{p.price} × {qty} = <strong style={{ color:"#00897B" }}>₹{p.price*qty}</strong></p>}
                    </div>
                    <QtyControl qty={qty} onChange={q => cart.update(sku,q)} sm />
                    <button onClick={() => cart.remove(sku)} style={{ border:"none", background:"none", cursor:"pointer", color:"#CCC", fontSize:18, lineHeight:1, padding:"2px 4px", borderRadius:4, transition:"color .15s" }} onMouseEnter={e=>e.currentTarget.style.color="#EF5350"} onMouseLeave={e=>e.currentTarget.style.color="#CCC"}>✕</button>
                  </div>
                );
              })
          }
        </div>
        {entries.length > 0 && (
          <div style={{ padding:"16px 20px 28px", borderTop:"1px solid #EEF2F1" }}>
            {total > 0 && <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}><span style={{ fontSize:14, color:"#7A9490" }}>Order total</span><span style={{ fontSize:28, fontWeight:700, color:"#1A2422" }}>₹{total}</span></div>}
            <RippleBtn onClick={onCheckout} full disabled={checkingOut}>{checkingOut?"Placing order…":"Proceed to checkout →"}</RippleBtn>
          </div>
        )}
      </aside>
    </>
  );
}

/* ── Token Panel with auto-detect ── */
function TokenPanel({ token, onSave, onClear, onClose }) {
  const [val, setVal]         = useState(token);
  const [show, setShow]       = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");

  useEffect(() => setVal(token), [token]);

  const autoDetect = () => {
    setDetecting(true);
    setDetectMsg("");

    // Common keys wellness corner / 1mg apps use
    const keys = [
      "access_token", "token", "authToken", "auth_token",
      "wc_token", "jwt", "userToken", "accessToken",
      "tata1mg_token", "wellness_token",
    ];

    // Check localStorage
    for (const key of keys) {
      try {
        const val = localStorage.getItem(key);
        if (val && val.startsWith("ey") && val.length > 50) {
          setVal(val);
          setDetectMsg("✓ Token found in localStorage — click Save to use it");
          setDetecting(false);
          return;
        }
      } catch {}
    }

    // Check sessionStorage
    for (const key of keys) {
      try {
        const val = sessionStorage.getItem(key);
        if (val && val.startsWith("ey") && val.length > 50) {
          setVal(val);
          setDetectMsg("✓ Token found in sessionStorage — click Save to use it");
          setDetecting(false);
          return;
        }
      } catch {}
    }

    // Check cookies
    try {
      const cookies = document.cookie.split(";").map(c => c.trim());
      for (const cookie of cookies) {
        const [, v] = cookie.split("=");
        if (v && v.startsWith("ey") && v.length > 50) {
          setVal(decodeURIComponent(v));
          setDetectMsg("✓ Token found in cookies — click Save to use it");
          setDetecting(false);
          return;
        }
      }
    } catch {}

    setDetectMsg("✗ Not found automatically — open thewellnesscorner.com, copy from Network tab → authorization header");
    setDetecting(false);
  };

  const isValid = val && val.startsWith("ey") && val.length > 50;

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #EEF2F1", animation: "slideDown .2s ease" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <p style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#7A9490", textTransform: "uppercase", letterSpacing: .5 }}>
            Access Token
          </p>
          <p style={{ fontSize: 12, color: "#B0BEC5", marginRight: 12 }}>Used for cart checkout</p>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#B0BEC5", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Method 1 — Auto detect */}
        <div style={{ background: "#F2F7F5", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1A2422" }}>⚡ Auto-detect</span>
            <span style={{ fontSize: 11, background: "#E0F2F1", color: "#00695C", borderRadius: 999, padding: "2px 8px", fontWeight: 500 }}>Recommended</span>
          </div>
          <p style={{ fontSize: 12, color: "#7A9490", marginBottom: 10, lineHeight: 1.6 }}>
            Open <strong>thewellnesscorner.com</strong> in this browser and log in first, then click detect.
            Works if the site stores your token in localStorage or cookies.
          </p>
          <button
            onClick={autoDetect}
            disabled={detecting}
            style={{
              border: "1.5px solid #00897B", background: detecting ? "#E0F2F1" : "transparent",
              color: "#00897B", borderRadius: 999, padding: "8px 20px",
              fontSize: 13, fontWeight: 600, cursor: detecting ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all .15s", display: "flex", alignItems: "center", gap: 8,
            }}>
            {detecting
              ? <><span style={{ width: 13, height: 13, border: "2px solid #C8DFDB", borderTopColor: "#00897B", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} /> Detecting…</>
              : "🔍 Detect token automatically"
            }
          </button>

          {detectMsg && (
            <p style={{
              marginTop: 10, fontSize: 12, lineHeight: 1.6,
              color: detectMsg.startsWith("✓") ? "#2E7D32" : "#C62828",
              background: detectMsg.startsWith("✓") ? "#F1F8E9" : "#FFF3F3",
              padding: "8px 12px", borderRadius: 8,
            }}>
              {detectMsg}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: "#EEF2F1" }} />
          <span style={{ fontSize: 12, color: "#B0BEC5", fontWeight: 500 }}>or paste manually</span>
          <div style={{ flex: 1, height: 1, background: "#EEF2F1" }} />
        </div>

        {/* Method 2 — Manual */}
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 12, color: "#7A9490", marginBottom: 8, lineHeight: 1.6 }}>
            Go to <strong>thewellnesscorner.com</strong> → DevTools (F12) → Network tab → any request →
            Headers → copy value after <code style={{ fontFamily: "monospace", background: "#F0F4F3", padding: "1px 4px", borderRadius: 4 }}>Bearer </code>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", border: `1.5px solid ${isValid ? "#00897B" : "#C8DFDB"}`, borderRadius: 10, overflow: "hidden", minWidth: 0, transition: "border-color .2s" }}>
              <input
                type={show ? "text" : "password"}
                value={val}
                onChange={e => { setVal(e.target.value); setDetectMsg(""); }}
                onKeyDown={e => e.key === "Enter" && isValid && onSave(val)}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
                style={{ flex: 1, border: "none", padding: "10px 14px", fontFamily: "monospace", fontSize: 12, background: "#FAFCFC", outline: "none", color: "#1A2422", minWidth: 0 }}
              />
              <button onClick={() => setShow(s => !s)}
                style={{ border: "none", background: "#F0FAF8", padding: "0 14px", cursor: "pointer", borderLeft: "1px solid #C8DFDB", fontSize: 15, flexShrink: 0 }}>
                {show ? "🙈" : "👁️"}
              </button>
            </div>
            <button
              onClick={() => isValid && onSave(val)}
              disabled={!isValid}
              style={{
                border: "none", borderRadius: 999, padding: "0 20px",
                background: isValid ? "#00897B" : "#E0E0E0",
                color: isValid ? "#fff" : "#AAA",
                fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                cursor: isValid ? "pointer" : "not-allowed",
                flexShrink: 0, transition: "all .2s",
              }}>
              Save
            </button>
            {token && (
              <button onClick={() => { onClear(); setVal(""); setDetectMsg(""); }}
                style={{ border: "1.5px solid #DDE8E6", borderRadius: 999, padding: "0 16px", background: "transparent", color: "#7A9490", fontFamily: "inherit", fontWeight: 600, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                Clear
              </button>
            )}
          </div>

          {/* Token status */}
          {val && (
            <p style={{ marginTop: 8, fontSize: 12, color: isValid ? "#2E7D32" : "#C62828" }}>
              {isValid ? `✓ Valid JWT token (${val.length} chars)` : "✗ Doesn't look like a valid token — should start with 'ey'"}
            </p>
          )}
        </div>

        <p style={{ fontSize: 11, color: "#B0BEC5", marginTop: 6 }}>
          Stored only in your browser's localStorage. Never sent anywhere except The Wellness Corner API.
        </p>
      </div>
    </div>
  );
}

function Toast({ msg, ok, onDone }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", zIndex:999, background:ok?"#2E7D32":"#C62828", color:"#fff", padding:"13px 22px", borderRadius:12, fontSize:14, fontWeight:500, display:"flex", alignItems:"center", gap:16, minWidth:260, maxWidth:"calc(100vw - 32px)", boxShadow:"0 8px 28px rgba(0,0,0,.2)", animation:"toastIn .25s ease" }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onDone} style={{ border:"none", background:"none", color:"rgba(255,255,255,.7)", cursor:"pointer", fontSize:14 }}>✕</button>
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const [query, setQuery]           = useState("");
  const [allResults, setAllResults] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [loading, setLoading]       = useState(false);
  const [searchErr, setSearchErr]   = useState(false);
  const [page, setPage]             = useState(1);
  const [cartOpen, setCartOpen]     = useState(false);
  const [tokenOpen, setTokenOpen]   = useState(false);
  const [checkingOut, setCheckout]  = useState(false);
  const [toast, setToast]           = useState({ msg:"", ok:false });
  const [token, saveToken, clearToken] = usePersistentToken();
  const cart    = useCart();
  const dq      = useDebounce(query, 300);
  const inputRef = useRef(null);
  const topRef   = useRef(null);

  const paged = allResults.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  useEffect(() => {
    if (dq.length < 3) { setAllResults([]); setSearchErr(false); setPage(1); return; }
    setLoading(true); setSearchErr(false); setPage(1);
    apiSearch(dq)
      .then(data => {
        setAllResults(data);
        setProductMap(pm => { const n={...pm}; data.forEach(p=>{n[p.sku]=p;}); return n; });
      })
      .catch(() => { setSearchErr(true); setAllResults([]); })
      .finally(() => setLoading(false));
  }, [dq]);

  const handlePage = p => { setPage(p); topRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }); };

  const checkout = async () => {
    if (!token) { setTokenOpen(true); setToast({ msg:"Add your access token first", ok:false }); return; }
    setCheckout(true);
    try {
      await Promise.all(Object.entries(cart.items).map(([sku,qty]) => apiAddToCart(token,sku,qty)));
      cart.clear(); setCartOpen(false); setToast({ msg:"🎉 Order placed!", ok:true });
    } catch { setToast({ msg:"Checkout failed — check your token", ok:false }); }
    finally { setCheckout(false); }
  };

  const CHIPS = ["Vitamin C","Omega-3","Ashwagandha","Probiotics","Biotin","Zinc"];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Bricolage+Grotesque:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{background:#F2F7F5}
        body{font-family:'DM Sans',sans-serif;background:#F2F7F5;color:#1A2422;-webkit-font-smoothing:antialiased;min-height:100vh}
        #root{    width: 100%;
; min-height:100vh;background:#F2F7F5}
        input,button{font-family:inherit}
        input:focus,button:focus{outline:none}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#C5D5D2;border-radius:99px}
        @keyframes rpl{to{transform:translate(-50%,-50%) scale(30);opacity:0}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.09);opacity:1}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        .appbar{position:sticky;top:0;z-index:100;width:100%;background:#fff;border-bottom:1px solid #E5EDEB;box-shadow:0 1px 8px rgba(0,0,0,.05);display:flex;align-items:center;gap:16px;padding:0 28px;height:64px}
        .searchbar{flex:1;display:flex;align-items:center;gap:10px;background:#EAF6F4;border-radius:999px;padding:0 18px;height:44px;border:1.5px solid transparent;transition:border-color .2s,background .2s}
        .searchbar:focus-within{border-color:#00897B;background:#fff}
        .search-input{flex:1;border:none;background:transparent;font-size:15px;color:#1A2422;min-width:0}
        .main{width:100%;padding:32px 28px 120px}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
        .hero{text-align:center;padding:64px 20px 48px;animation:fadeUp .4s ease}
        .hero h1{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(28px,5vw,44px);font-weight:700;letter-spacing:-.6px;line-height:1.15;margin-bottom:14px}
        .hero p{font-size:16px;color:#7A9490;line-height:1.65;max-width:420px;margin:0 auto 28px}
        .chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
        .chip{padding:9px 22px;border-radius:999px;font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:all .18s;border:1.5px solid #00897B;background:transparent;color:#00897B}
        .chip:hover{background:#00897B;color:#fff}
        .fab{position:fixed;bottom:28px;right:28px;z-index:150;width:60px;height:60px;border-radius:18px;background:#00897B;color:#fff;border:none;cursor:pointer;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,137,123,.4);transition:transform .15s}
        .fab:hover{transform:scale(1.06)}
        .fab-badge{position:absolute;top:-5px;right:-5px;min-width:22px;height:22px;border-radius:999px;background:#E53935;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2.5px solid #F2F7F5}
        @media(max-width:900px){.appbar{padding:0 16px;gap:12px}.main{padding:24px 16px 100px}.grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}}
        @media(max-width:600px){.appbar{flex-wrap:wrap;height:auto;padding:10px 14px;gap:8px}.searchbar{order:10;flex-basis:100%}.appbar-actions{margin-left:auto}.main{padding:18px 12px 90px}.grid{grid-template-columns:1fr}.hero{padding:44px 12px 36px}.fab{bottom:16px;right:14px;width:54px;height:54px;border-radius:16px;font-size:22px}}
        @media(min-width:1400px){.grid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}}
      `}</style>

      <header className="appbar">
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <span style={{ fontSize:24 }}>💊</span>
          <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:21, fontWeight:700, color:"#00897B", letterSpacing:-.5 }}>Wellness</span>
        </div>
        <div className="searchbar">
          <span style={{ fontSize:16, opacity:.35, flexShrink:0 }}>🔍</span>
          <input ref={inputRef} className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search supplements, vitamins, OTC products…" />
          {loading && <span style={{ width:17, height:17, border:"2px solid #C8DFDB", borderTopColor:"#00897B", borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }} />}
          {query && !loading && <button onClick={()=>{setQuery("");inputRef.current?.focus();}} style={{ border:"none", background:"none", cursor:"pointer", color:"#B0BEC5", fontSize:15, flexShrink:0 }}>✕</button>}
        </div>
        <div className="appbar-actions" style={{ display:"flex", gap:4, flexShrink:0 }}>
          <button onClick={()=>setTokenOpen(v=>!v)} title="Access Token" style={{ border:"none", background:tokenOpen?"#E0F2F1":"none", borderRadius:"50%", width:40, height:40, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", transition:"background .15s" }}>🔑</button>
          <button onClick={()=>setCartOpen(true)} style={{ position:"relative", border:"none", background:"none", borderRadius:"50%", width:40, height:40, cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
            🛒
            {cart.count > 0 && <span style={{ position:"absolute", top:2, right:2, minWidth:18, height:18, borderRadius:999, background:"#E53935", color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", border:"2px solid #fff" }}>{cart.count>99?"99+":cart.count}</span>}
          </button>
        </div>
      </header>

      {tokenOpen && <TokenPanel token={token} onSave={v=>{saveToken(v);setToast({msg:"Token saved ✓",ok:true});setTokenOpen(false);}} onClear={clearToken} onClose={()=>setTokenOpen(false)} />}

      <main className="main" ref={topRef}>
        {query.length < 3 && (
          <div className="hero">
            <div style={{ position:"relative", width:130, height:130, margin:"0 auto 32px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {[130,95,62].map((s,i) => <div key={s} style={{ position:"absolute", width:s, height:s, borderRadius:"50%", background:`rgba(0,137,123,${.08+i*.07})`, animation:`pulse 3.2s ease-in-out ${i*.45}s infinite` }} />)}
              <span style={{ fontSize:44, position:"relative", zIndex:1 }}>🌿</span>
            </div>
            <h1>Your wellness journey<br />starts here</h1>
            <p>Search thousands of vitamins, supplements &amp; OTC products from 1mg.</p>
            {query.length > 0 && query.length < 3 && <p style={{ fontSize:13, color:"#B0BEC5", marginBottom:20 }}>{3-query.length} more character{query.length<2?"s":""} to search…</p>}
            <div className="chips">{CHIPS.map(c => <button key={c} className="chip" onClick={()=>setQuery(c)}>{c}</button>)}</div>
          </div>
        )}

        {searchErr && (
          <div style={{ textAlign:"center", padding:"70px 20px", animation:"fadeUp .3s ease" }}>
            <div style={{ fontSize:52, opacity:.25, marginBottom:16 }}>⚠️</div>
            <p style={{ fontSize:16, color:"#7A9490", marginBottom:8 }}>Search failed</p>
            <p style={{ fontSize:13, color:"#B0BEC5" }}>Check your connection or Vite proxy config.</p>
          </div>
        )}

        {!searchErr && allResults.length > 0 && (
          <section style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:8 }}>
              <p style={{ fontSize:13, color:"#B0BEC5" }}>
                <strong style={{ color:"#1A2422" }}>{allResults.length}</strong> result{allResults.length!==1?"s":""} for <strong style={{ color:"#1A2422" }}>"{query}"</strong>
              </p>
              {Math.ceil(allResults.length/PAGE_SIZE) > 1 && (
                <p style={{ fontSize:13, color:"#B0BEC5" }}>
                  Page <strong style={{ color:"#1A2422" }}>{page}</strong> of <strong style={{ color:"#1A2422" }}>{Math.ceil(allResults.length/PAGE_SIZE)}</strong>
                  {" "}· {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, allResults.length)} of {allResults.length}
                </p>
              )}
            </div>
            <div className="grid">
              {paged.map(p => <ProductCard key={p.sku} p={p} onAdd={(sku,qty)=>{cart.add(sku,qty);setToast({msg:"Added to cart",ok:true});}} />)}
            </div>
            <Pagination page={page} total={allResults.length} pageSize={PAGE_SIZE} onChange={handlePage} />
          </section>
        )}

        {!loading && !searchErr && query.length >= 3 && allResults.length === 0 && (
          <div style={{ textAlign:"center", padding:"70px 20px", animation:"fadeUp .3s ease" }}>
            <div style={{ fontSize:52, opacity:.2, marginBottom:16 }}>🔍</div>
            <p style={{ fontSize:16, color:"#7A9490" }}>No products found for "<strong style={{ color:"#1A2422" }}>{query}</strong>"</p>
            <p style={{ fontSize:13, color:"#B0BEC5", marginTop:6 }}>Try a different search term</p>
          </div>
        )}
      </main>

      {cart.count > 0 && !cartOpen && (
        <button className="fab" onClick={()=>setCartOpen(true)}>🛒<span className="fab-badge">{cart.count}</span></button>
      )}

      <CartDrawer open={cartOpen} onClose={()=>setCartOpen(false)} cart={cart} products={productMap} onCheckout={checkout} checkingOut={checkingOut} />
      <Toast msg={toast.msg} ok={toast.ok} onDone={()=>setToast({msg:"",ok:false})} />
    </>
  );
}