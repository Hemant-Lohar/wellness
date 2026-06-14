import { useState, useEffect, useRef, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════ */
interface Product {
  sku: string; name: string; manufacturer: string
  price: number; mrp: number; discount: string
  image: string; pack: string
  ratings: { average: number; total: number } | null
  tag: { text: string; bg: string } | null
  rx: boolean; ptype: string; avail: boolean; purl: string
}
interface CartItem extends Product { qty: number }
interface ACSuggestion {
  id: string; type: string; name: string
  label: string | null; image: string | null; term: string
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
const SEARCH_API = '/pwa-dweb-api/api/v4'
const CART_API   = '/api/cart'

const SEARCH_HDR: Record<string, string> = {
  accept: 'application/vnd.healthkartplus.v4+json',
  'hkp-platform': 'Healthkartplus-0.0.1-desktopweb',
  locale: 'en',
  'x-access-key': '1mg_client_access_key',
  'x-platform': 'desktop-0.0.1',
}

const CHIPS = ['Paracetamol','Vitamin D','Dolo 650','Crocin','Azithromycin','Cetirizine','Amoxicillin','Multivitamin','Pantoprazole','Metformin']
const CITIES = ['Pune','New Delhi','Mumbai','Bangalore','Hyderabad','Chennai','Kolkata','Ahmedabad','Jaipur','Lucknow']

const TOKEN_KEYS = [
  'access_token','token','authToken','auth_token','wc_token',
  'jwt','userToken','accessToken','tata1mg_token','wellness_token',
]
const WC_STORAGE_KEY = 'wc_token'

// Cross-browser token grabber. Runs ON thewellnesscorner.com (same-origin),
// scans that page's storage + cookies for a JWT and copies it to the clipboard.
// This is the reliable path: a page on this app's origin can NEVER read
// thewellnesscorner.com's storage, so the token must be grabbed over there.
const TOKEN_BOOKMARKLET =
  "javascript:(function(){" +
  "var j=function(v){return typeof v==='string'&&v.indexOf('ey')===0&&v.length>50;};" +
  "var f=[];" +
  "var s=function(st){try{for(var i=0;i<st.length;i++){var v=st.getItem(st.key(i));if(j(v)&&f.indexOf(v)<0)f.push(v);}}catch(e){}};" +
  "s(window.localStorage);s(window.sessionStorage);" +
  "document.cookie.split(';').forEach(function(c){var v=c.split('=').slice(1).join('=').trim();if(j(v)&&f.indexOf(v)<0)f.push(v);});" +
  "if(!f.length){alert('No token found on this page. Make sure you are logged in to thewellnesscorner.com, then click again.');return;}" +
  "var t=f[0];" +
  "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){alert('\\u2705 Token copied! Paste it into your Wellness app token panel.');},function(){window.prompt('Copy this token:',t);});}" +
  "else{window.prompt('Copy this token:',t);}" +
  "})();"

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const strip = (h: string) => h.replace(/<[^>]*>/g, '')
const parsePrice = (s: string | undefined): number => {
  if (!s) return 0
  const n = parseFloat(s.replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

// JWT validation — EXACT same as original: starts with "ey", length > 50
const looksLikeJwt = (v: string): boolean =>
  typeof v === 'string' && v.startsWith('ey') && v.length > 50

const mapProduct = (r: Record<string, unknown>): Product => {
  const pr = r.prices as Record<string, string> | undefined
  const rt = r.ratings as Record<string, number> | undefined
  const tg = r.tag as Record<string, string> | undefined
  return {
    sku: String(r.id ?? ''),
    name: strip(String(r.name ?? '')),
    manufacturer: String(r.manufacturer_name ?? ''),
    price: parsePrice(pr?.discounted_price),
    mrp: parsePrice(pr?.mrp),
    discount: pr?.discount ?? '',
    image: String(r.image ?? ''),
    pack: String(r.label ?? ''),
    ratings: rt ? { average: rt.average_rating, total: rt.total_ratings } : null,
    tag: tg ? { text: tg.text, bg: tg.bg_color ?? '#fecf7f' } : null,
    rx: !!r.rx_required,
    ptype: String(r.type ?? ''),
    avail: r.available !== false,
    purl: r.url ? `https://www.1mg.com${r.url}` : '',
  }
}

/* ═══════════════════════════════════════════════════════
   ORIGINAL: apiAddToCart — EXACT same as your code
═══════════════════════════════════════════════════════ */
async function apiAddToCart(token: string, skuId: string, quantity: number) {
  const res = await fetch(CART_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-access-token': token,
    },
    body: JSON.stringify({ skuId, quantity }),
  })
  if (!res.ok) throw new Error(`Failed to add SKU ${skuId}: ${res.status}`)
  return res.json()
}

/* ═══════════════════════════════════════════════════════
   ORIGINAL: Token auto-detect — EXACT same logic
═══════════════════════════════════════════════════════ */
function autoDetectTokens(): { key: string; value: string; source: string }[] {
  const found: { key: string; value: string; source: string }[] = []

  const scanStore = (store: Storage, label: string) => {
    // Check known token keys
    TOKEN_KEYS.forEach(k => {
      try {
        const v = store.getItem(k)
        if (v && looksLikeJwt(v) && !found.some(f => f.value === v))
          found.push({ key: k, value: v, source: label })
      } catch { /* */ }
    })
    // Also scan ALL keys for JWT-shaped values
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (!k) continue
        const v = store.getItem(k)
        if (v && looksLikeJwt(v) && !found.some(f => f.value === v))
          found.push({ key: k, value: v, source: label })
      }
    } catch { /* */ }
  }

  scanStore(localStorage, 'localStorage')
  scanStore(sessionStorage, 'sessionStorage')

  // Cookies
  try {
    document.cookie.split(';').forEach(c => {
      const [k, ...vp] = c.split('=')
      const key = k?.trim()
      const val = vp.join('=').trim()
      if (key && val && looksLikeJwt(val) && !found.some(f => f.value === val))
        found.push({ key, value: val, source: 'cookie' })
    })
  } catch { /* */ }

  return found
}

/* ═══════════════════════════════════════════════════════
   APP COMPONENT
═══════════════════════════════════════════════════════ */
export default function App() {
  // ── Search state ──
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('Pune')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(0)
  const [scrollId, setScrollId] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [searchErr, setSearchErr] = useState('')

  // ── Autocomplete state ──
  const [suggestions, setSuggestions] = useState<ACSuggestion[]>([])
  const [showAC, setShowAC] = useState(false)
  const acTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // ── Cart state (ORIGINAL) ──
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

  // ── Toast (ORIGINAL) ──
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  // ── Token state (ORIGINAL) ──
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem(WC_STORAGE_KEY)
    return saved && looksLikeJwt(saved) ? saved : ''
  })
  const [tokenInput, setTokenInput] = useState(token)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [tokenPanelOpen, setTokenPanelOpen] = useState(false)
  const [detectedTokens, setDetectedTokens] = useState<{ key: string; value: string; source: string }[]>([])
  const bookmarkletRef = useRef<HTMLTextAreaElement>(null)

  // Persist token to localStorage
  useEffect(() => {
    if (token) localStorage.setItem(WC_STORAGE_KEY, token)
    else localStorage.removeItem(WC_STORAGE_KEY)
  }, [token])

  // ── Auto-detect on mount (ORIGINAL) ──
  useEffect(() => {
    const found = autoDetectTokens()
    setDetectedTokens(found)
    // Auto-select first found if no saved token
    if (!token && found.length > 0) {
      setToken(found[0].value)
      setTokenInput(found[0].value)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close AC dropdown on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node))
        setShowAC(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ─────────────────────────────────────────────────
     Token Panel actions (ORIGINAL)
  ───────────────────────────────────────────────── */
  const handleDetect = () => {
    const found = autoDetectTokens()
    setDetectedTokens(found)
    if (found.length === 0) showToast('No tokens found in browser storage or cookies')
    else showToast(`Found ${found.length} token(s)`)
  }

  const handleSaveToken = () => {
    const v = tokenInput.trim()
    if (!v) { showToast('Paste a token first'); return }
    if (!looksLikeJwt(v)) { showToast('⚠️ Not a valid JWT (must start with "ey")'); return }
    setToken(v)
    showToast('✅ Token saved!')
  }

  const handleClearToken = () => {
    setToken(''); setTokenInput('')
    showToast('Token cleared')
  }

  const handleUseDetected = (value: string) => {
    setTokenInput(value)
    setToken(value)
    showToast('✅ Token applied!')
  }

  const handleCopyBookmarklet = async () => {
    // 1) Modern Clipboard API (needs HTTPS + focus + not blocked by iframe policy)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(TOKEN_BOOKMARKLET)
        showToast('✅ Copied! Now make a bookmark and paste this as its URL')
        return
      }
    } catch { /* fall through */ }
    // 2) Fallback: select the visible textarea and use execCommand
    const ta = bookmarkletRef.current
    if (ta) {
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, ta.value.length)
      try {
        if (document.execCommand('copy')) {
          showToast('✅ Copied! Now make a bookmark and paste this as its URL')
          return
        }
      } catch { /* fall through */ }
      showToast('Couldn’t auto-copy — the code is selected, press Ctrl/Cmd+C')
      return
    }
    showToast('Couldn’t auto-copy — select the code box below and press Ctrl/Cmd+C')
  }

  /* ─────────────────────────────────────────────────
     Autocomplete
  ───────────────────────────────────────────────── */
  const fetchAutocomplete = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); return }
    try {
      const params = new URLSearchParams({ q, types: 'allopathy,brand,sku,udp,disease', per_page: '12' })
      const res = await fetch(`${SEARCH_API}/search/autocomplete?${params}`, {
        headers: { ...SEARCH_HDR, 'x-city': city },
      })
      const json = await res.json()
      const results: ACSuggestion[] = ((json?.data?.search_results) as Record<string, unknown>[] ?? []).map(
        (s: Record<string, unknown>) => ({
          id: String(s.id ?? ''),
          type: String(s.type ?? ''),
          name: String(s.name ?? ''),
          label: s.label ? String(s.label) : null,
          image: s.image ? String(s.image) : null,
          term: String(s.search_term ?? strip(String(s.name ?? ''))),
        })
      )
      setSuggestions(results)
      setShowAC(true)
    } catch { setSuggestions([]) }
  }, [city])

  useEffect(() => {
    if (acTimerRef.current) clearTimeout(acTimerRef.current)
    if (query.trim().length >= 2) {
      acTimerRef.current = setTimeout(() => fetchAutocomplete(query), 250)
    } else { setSuggestions([]); setShowAC(false) }
    return () => { if (acTimerRef.current) clearTimeout(acTimerRef.current) }
  }, [query, fetchAutocomplete])

  /* ─────────────────────────────────────────────────
     Search
  ───────────────────────────────────────────────── */
  const searchProducts = useCallback(async (q: string, pg = 0, prevSid = '') => {
    if (!q.trim()) { setProducts([]); setSearched(false); setSearchErr(''); return }
    setLoading(true); setSearched(true); setSearchErr('')
    try {
      const params = new URLSearchParams({
        q: q.trim(), city, filter: '', page_number: String(pg), scroll_id: prevSid,
        per_page: '50', types: 'sku,allopathy', sort: 'relevance',
        fetch_eta: 'true', is_city_serviceable: 'true',
      })
      const res = await fetch(`${SEARCH_API}/search/all?${params}`, {
        headers: { ...SEARCH_HDR, 'x-city': city },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data = json?.data
      const results = ((data?.search_results) as Record<string, unknown>[] ?? []).map(mapProduct)
      setProducts(prev => pg === 0 ? results : [...prev, ...results])
      setScrollId(String(data?.scroll_id ?? ''))
      setHasMore(results.length >= 50)
    } catch (e) {
      if (pg === 0) setProducts([])
      setSearchErr(e instanceof Error ? e.message : 'Search failed')
    } finally { setLoading(false) }
  }, [city])

  const handleSearch = (q: string) => {
    setQuery(q); setPage(0); setScrollId(''); setShowAC(false); setSuggestions([])
    searchProducts(q, 0, '')
  }

  const handleLoadMore = () => {
    const next = page + 1; setPage(next)
    searchProducts(query, next, scrollId)
  }

  /* ─────────────────────────────────────────────────
     Cart (ORIGINAL logic)
  ───────────────────────────────────────────────── */
  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.sku === p.sku)
      if (existing) return prev.map(c => c.sku === p.sku ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...p, qty: 1 }]
    })
    showToast(`Added: ${p.name.slice(0, 40)}`)
  }

  const updateQty = (sku: string, delta: number) => {
    setCart(prev => prev.map(c => c.sku === sku ? { ...c, qty: Math.max(1, c.qty + delta) } : c))
  }

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(c => c.sku !== sku))
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0)

  /* ─────────────────────────────────────────────────
     Checkout (ORIGINAL — Promise.all, apiAddToCart)
  ───────────────────────────────────────────────── */
  const handleCheckout = async () => {
    if (!token) {
      showToast('⚠️ Set your Wellness Corner token first!')
      setTokenPanelOpen(true)
      return
    }
    if (cart.length === 0) return
    setCheckingOut(true)
    try {
      const results = await Promise.allSettled(
        cart.map(item => apiAddToCart(token, item.sku, item.qty))
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      if (succeeded > 0) {
        setCart([])
        setCartOpen(false)
        showToast(
          `✅ ${succeeded} item(s) added to Wellness Corner cart!` +
          (failed > 0 ? ` (${failed} failed)` : '')
        )
      } else {
        showToast('❌ Failed — your token may be expired. Get a fresh one from thewellnesscorner.com')
      }
    } catch {
      showToast('❌ Checkout failed. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  /* ─────────────────────────────────────────────────
     AC icon helper
  ───────────────────────────────────────────────── */
  const acMeta = (t: string) => {
    switch (t) {
      case 'udp': return { icon: '📁', label: 'Category' }
      case 'drug': return { icon: '💊', label: 'Medicine' }
      case 'labs': return { icon: '🧪', label: 'Lab Test' }
      case 'brand': return { icon: '🏷️', label: 'Brand' }
      case 'disease': return { icon: '🩹', label: 'Condition' }
      default: return { icon: '🔍', label: '' }
    }
  }

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */
  const C = '#00897B' // teal — original theme color

  return (
    <>
      <style>{`
        .fade{animation:fade .3s ease}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .btn{position:relative;overflow:hidden;cursor:pointer;border:none;font-family:inherit}
        .btn::after{content:'';position:absolute;inset:0;background:rgba(255,255,255,.15);opacity:0;transition:opacity .15s}
        .btn:active::after{opacity:1}
        .acd{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0e0e0;
          border-top:none;border-radius:0 0 12px 12px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:400px;overflow-y:auto;z-index:200}
        .aci{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;transition:background .15s}
        .aci:hover{background:#e0f2f1}
        .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06);
          transition:transform .2s,box-shadow .2s;display:flex;flex-direction:column;position:relative}
        .card:hover{transform:translateY(-4px);box-shadow:0 8px 28px rgba(0,0,0,.1)}
      `}</style>

      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column'}}>

        {/* ══════ APP BAR ══════ */}
        <header style={{background:C,color:'#fff',padding:'12px 0',position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 8px rgba(0,0,0,.15)'}}>
          <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:24}}>💊</span>
              <h1 style={{fontSize:20,fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:800}}>Wellness</h1>
            </div>

            {/* Search bar in header */}
            <div ref={searchBoxRef} style={{flex:1,maxWidth:600,position:'relative'}}>
              <form onSubmit={e=>{e.preventDefault();handleSearch(query)}} style={{display:'flex'}}>
                <div style={{flex:1,position:'relative'}}>
                  <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:16,opacity:.5,pointerEvents:'none'}}>🔍</span>
                  <input value={query} onChange={e=>setQuery(e.target.value)}
                    onFocus={()=>{if(suggestions.length)setShowAC(true)}}
                    placeholder="Search medicines, health products..."
                    style={{width:'100%',padding:'9px 36px 9px 40px',fontSize:14,fontFamily:'inherit',
                      border:'none',borderRadius:showAC&&suggestions.length?'24px 24px 0 0':'24px',
                      outline:'none',background:'rgba(255,255,255,.95)'}}/>
                  {query&&(
                    <button type="button" onClick={()=>{setQuery('');setProducts([]);setSearched(false);setSuggestions([]);setShowAC(false);setSearchErr('')}}
                      style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:14,color:'#999',cursor:'pointer'}}>
                      ✕
                    </button>
                  )}
                </div>
              </form>

              {/* Autocomplete dropdown */}
              {showAC&&suggestions.length>0&&(
                <div className="acd">
                  {suggestions.map((s,i)=>{const m=acMeta(s.type);return(
                    <div key={`${s.id}-${i}`} className="aci" onMouseDown={e=>{e.preventDefault();handleSearch(s.term)}}>
                      {s.image?<img src={s.image} alt="" style={{width:30,height:30,objectFit:'contain',borderRadius:4,flexShrink:0}}/>
                        :<span style={{fontSize:16,width:26,textAlign:'center',flexShrink:0}}>{m.icon}</span>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'#263238'}} dangerouslySetInnerHTML={{__html:s.name}}/>
                        {s.label&&<div style={{fontSize:10,color:'#888',marginTop:1}}>{s.label}</div>}
                      </div>
                      {m.label&&<span style={{fontSize:9,color:C,background:'#e0f2f1',padding:'2px 7px',borderRadius:10,flexShrink:0,fontWeight:600}}>{m.label}</span>}
                      <span style={{fontSize:13,color:'#ccc'}}>↗</span>
                    </div>
                  )})}
                </div>
              )}
            </div>

            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {/* City */}
              <select value={city} onChange={e=>{setCity(e.target.value);if(query)handleSearch(query)}}
                style={{background:'rgba(255,255,255,.2)',border:'none',color:'#fff',fontSize:12,fontFamily:'inherit',padding:'6px 8px',borderRadius:6,cursor:'pointer',outline:'none'}}>
                {CITIES.map(c=><option key={c} value={c} style={{color:'#263238'}}>{c}</option>)}
              </select>
              {/* Token status dot */}
              {token&&<span style={{width:8,height:8,borderRadius:'50%',background:'#69f0ae'}} title="Token active"/>}
              {/* Token btn */}
              <button onClick={()=>setTokenPanelOpen(!tokenPanelOpen)} className="btn"
                style={{background:'rgba(255,255,255,.2)',color:'#fff',padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600}}>
                🔑{token?' ✓':''}
              </button>
              {/* Cart btn */}
              <button onClick={()=>setCartOpen(true)} className="btn"
                style={{background:'#FF6D00',color:'#fff',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:600,position:'relative'}}>
                🛒 {cartCount>0&&<span style={{marginLeft:2}}>{cartCount}</span>}
              </button>
            </div>
          </div>
        </header>

        {/* ══════ TOKEN PANEL (ORIGINAL UI) ══════ */}
        {tokenPanelOpen&&(
          <div className="fade" style={{background:'#fff',borderBottom:'2px solid #e0e0e0',padding:'16px 20px'}}>
            <div style={{maxWidth:1200,margin:'0 auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h3 style={{fontSize:15,fontWeight:700}}>🔑 Wellness Corner Session</h3>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {token&&<span style={{fontSize:11,color:'#2e7d32',fontWeight:600,background:'#e8f5e9',padding:'2px 10px',borderRadius:10}}>✅ Connected</span>}
                  <button onClick={()=>setTokenPanelOpen(false)} style={{background:'none',border:'none',fontSize:16,cursor:'pointer',color:'#888'}}>✕</button>
                </div>
              </div>

              <p style={{fontSize:11,color:'#888',marginBottom:12}}>
                Your JWT lives on <strong>thewellnesscorner.com</strong>. For browser-security reasons this app
                <strong> can't read it across sites</strong> — so grab it over there with the one-click tool below (works in any browser).
              </p>

              {/* ✅ Cross-browser token grabber (reliable path) */}
              <div style={{background:'#e0f2f1',border:`1px solid #b2dfdb`,borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                <p style={{fontSize:12,fontWeight:700,marginBottom:6,color:'#00695c'}}>✅ Get token from Wellness Corner (any browser)</p>
                <ol style={{fontSize:11,color:'#37474F',margin:'0 0 10px 18px',lineHeight:1.7}}>
                  <li>Click <strong>Copy token grabber</strong> below.</li>
                  <li>Create a new browser bookmark and paste it as the bookmark's <strong>URL/address</strong>. Name it anything.</li>
                  <li><a href="https://www.thewellnesscorner.com" target="_blank" rel="noopener noreferrer" style={{color:C,fontWeight:600,textDecoration:'underline'}}>Open thewellnesscorner.com ↗</a> and log in.</li>
                  <li>Click your new bookmark there — the token is copied to your clipboard.</li>
                  <li>Come back here and paste it below, then Save.</li>
                </ol>
                <button onClick={handleCopyBookmarklet} className="btn"
                  style={{background:C,color:'#fff',padding:'8px 18px',borderRadius:8,fontSize:12,fontWeight:700}}>
                  📋 Copy token grabber
                </button>

                {/* Easiest install: drag this link straight onto the bookmarks bar.
                    href is set via a callback ref so the javascript: URL isn't stripped. */}
                <p style={{fontSize:11,color:'#37474F',margin:'10px 0 4px'}}>
                  Easiest: <strong>drag</strong> this button up onto your bookmarks bar 👇
                </p>
                <a
                  ref={el => { if (el) el.setAttribute('href', TOKEN_BOOKMARKLET) }}
                  onClick={e => e.preventDefault()}
                  draggable
                  style={{display:'inline-block',background:'#fff',color:C,border:`1.5px dashed ${C}`,
                    padding:'7px 16px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'grab',userSelect:'none'}}>
                  ⬆️ Get WC Token
                </a>

                {/* Always-visible code box as a manual fallback for copy */}
                <p style={{fontSize:11,color:'#37474F',margin:'12px 0 4px'}}>
                  Or copy the code manually:
                </p>
                <textarea
                  ref={bookmarkletRef}
                  readOnly
                  value={TOKEN_BOOKMARKLET}
                  onFocus={e => e.target.select()}
                  rows={3}
                  style={{width:'100%',fontFamily:'monospace',fontSize:10,color:'#333',background:'#fff',
                    border:'1px solid #cfd8dc',borderRadius:8,padding:8,resize:'vertical',whiteSpace:'pre-wrap',wordBreak:'break-all'}}/>
              </div>

              {/* ⚡ Auto-detect — only finds tokens already saved on THIS site */}
              <button onClick={handleDetect} className="btn"
                style={{background:'#fff',color:C,border:`1.5px solid ${C}`,padding:'8px 20px',borderRadius:8,fontSize:12,fontWeight:700,marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
                ⚡ Re-scan this site's storage
                <span style={{fontSize:9,background:'#e0f2f1',color:C,padding:'1px 6px',borderRadius:4}}>same site only</span>
              </button>

              {/* Detected tokens list — ORIGINAL */}
              {detectedTokens.length>0&&(
                <div style={{marginBottom:14}}>
                  <p style={{fontSize:12,fontWeight:600,marginBottom:6}}>Found {detectedTokens.length} token(s):</p>
                  {detectedTokens.map((t,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:token===t.value?'#e8f5e9':'#fafafa',
                      border:`1px solid ${token===t.value?'#a5d6a7':'#eee'}`,borderRadius:8,padding:'6px 10px',marginBottom:4}}>
                      <span style={{fontSize:10,color:'#666',minWidth:100,flexShrink:0}}>{t.source} → {t.key}</span>
                      <code style={{flex:1,fontSize:10,color:'#333',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {tokenVisible?t.value:t.value.slice(0,12)+'••••••••'+t.value.slice(-8)}
                      </code>
                      {token===t.value
                        ?<span style={{fontSize:10,color:'#2e7d32',fontWeight:700}}>✓ Active</span>
                        :<button onClick={()=>handleUseDetected(t.value)} className="btn"
                          style={{fontSize:10,color:C,background:'#e0f2f1',padding:'3px 10px',borderRadius:6,fontWeight:600}}>Use</button>
                      }
                    </div>
                  ))}
                </div>
              )}

              {/* Manual paste — ORIGINAL */}
              <p style={{fontSize:12,fontWeight:600,marginBottom:4}}>✏️ Or paste manually:</p>
              <div style={{position:'relative',marginBottom:8}}>
                <input value={tokenInput} onChange={e=>setTokenInput(e.target.value)}
                  type={tokenVisible?'text':'password'}
                  placeholder='Paste JWT (starts with eyJ...)'
                  style={{width:'100%',padding:'9px 80px 9px 12px',fontSize:12,fontFamily:'monospace',border:'2px solid #e0e0e0',borderRadius:8,outline:'none'}}
                  onFocus={e=>e.target.style.borderColor=C}
                  onBlur={e=>e.target.style.borderColor='#e0e0e0'}/>
                <button onClick={()=>setTokenVisible(!tokenVisible)}
                  style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:11,color:'#888',cursor:'pointer'}}>
                  {tokenVisible?'🙈 Hide':'👁 Show'}
                </button>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={handleSaveToken} className="btn"
                  style={{background:C,color:'#fff',padding:'7px 18px',borderRadius:8,fontSize:12,fontWeight:600}}>
                  💾 Save
                </button>
                {token&&(
                  <button onClick={handleClearToken} className="btn"
                    style={{background:'#ffebee',color:'#c62828',padding:'7px 18px',borderRadius:8,fontSize:12,fontWeight:600}}>
                    🗑 Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════ MAIN ══════ */}
        <main style={{maxWidth:1200,margin:'0 auto',padding:'20px 20px 80px',width:'100%',flex:1}}>

          {/* Hero */}
          {!searched&&(
            <div className="fade" style={{textAlign:'center',padding:'32px 20px 24px'}}>
              <span style={{fontSize:48}}>🏥</span>
              <h2 style={{fontSize:22,fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:800,margin:'8px 0 4px'}}>Search Medicines & Health Products</h2>
              <p style={{color:'#78909C',fontSize:14}}>Search on 1mg → Add to cart → Push to Wellness Corner</p>
            </div>
          )}

          {/* Chips */}
          {!searched&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',marginBottom:20}}>
              {CHIPS.map(chip=>(
                <button key={chip} onClick={()=>handleSearch(chip)} className="btn"
                  style={{background:'#fff',border:`1px solid #e0e0e0`,borderRadius:20,padding:'5px 14px',fontSize:12,color:'#546E7A',
                    transition:'all .15s'}}
                  onMouseEnter={e=>{(e.target as HTMLElement).style.borderColor=C;(e.target as HTMLElement).style.color=C}}
                  onMouseLeave={e=>{(e.target as HTMLElement).style.borderColor='#e0e0e0';(e.target as HTMLElement).style.color='#546E7A'}}>
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Results heading */}
          {searched&&!loading&&products.length>0&&(
            <p style={{fontSize:13,color:'#78909C',marginBottom:12}}>
              {products.length} result{products.length!==1?'s':''} for "<strong>{query}</strong>"
            </p>
          )}

          {/* Error */}
          {searchErr&&!loading&&(
            <div className="fade" style={{textAlign:'center',padding:'40px 20px',color:'#78909C'}}>
              <span style={{fontSize:40}}>⚠️</span>
              <h3 style={{fontSize:16,margin:'8px 0 4px',color:'#263238'}}>Search failed</h3>
              <p style={{fontSize:13}}>{searchErr}</p>
            </div>
          )}

          {/* ── Products Grid ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
            {products.map((p,i)=>(
              <div key={`${p.sku}-${i}`} className="fade card" style={{opacity:p.avail?1:.5}}>
                {/* Badges */}
                <div style={{position:'absolute',top:8,left:8,display:'flex',flexWrap:'wrap',gap:4,zIndex:2}}>
                  {p.tag&&<span style={{background:p.tag.bg,color:'#6b4700',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700,textTransform:'uppercase'}}>{p.tag.text}</span>}
                  {p.rx&&<span style={{background:'#ffebee',color:'#c62828',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700}}>℞ Rx</span>}
                  {p.ptype==='otc'&&<span style={{background:'#e8f5e9',color:'#2e7d32',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700}}>OTC</span>}
                </div>
                {/* Image */}
                <div style={{height:160,display:'flex',alignItems:'center',justifyContent:'center',background:'#fafafa',padding:12}}>
                  <img src={p.image} alt={p.name} loading="lazy"
                    onError={e=>{(e.target as HTMLImageElement).src='https://placehold.co/200x200?text=No+Image'}}
                    style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>
                </div>
                {/* Info */}
                <div style={{padding:12,flex:1,display:'flex',flexDirection:'column'}}>
                  <h3 style={{fontSize:13,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',marginBottom:3}}>{p.name}</h3>
                  <p style={{fontSize:10,color:'#90A4AE',marginBottom:2}}>{p.pack}</p>
                  {p.manufacturer&&<p style={{fontSize:10,color:'#B0BEC5',marginBottom:4}}>{p.manufacturer}</p>}
                  {/* Ratings */}
                  {p.ratings&&(
                    <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                      <span style={{background:'#2e7d32',color:'#fff',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4}}>★ {p.ratings.average}</span>
                      <span style={{fontSize:10,color:'#90A4AE'}}>({p.ratings.total})</span>
                    </div>
                  )}
                  {/* Price */}
                  <div style={{display:'flex',alignItems:'baseline',gap:5,marginBottom:8}}>
                    <span style={{fontSize:16,fontWeight:700,color:'#263238'}}>₹{p.price.toFixed(2)}</span>
                    {p.mrp>p.price&&<span style={{fontSize:11,color:'#B0BEC5',textDecoration:'line-through'}}>₹{p.mrp.toFixed(2)}</span>}
                    {p.discount&&p.discount!=='0% off'&&(
                      <span style={{fontSize:10,fontWeight:600,color:'#2e7d32'}}>{p.discount}</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{marginTop:'auto',display:'flex',gap:4}}>
                    <button onClick={()=>addToCart(p)} disabled={!p.avail} className="btn"
                      style={{flex:1,padding:'7px 0',fontSize:12,fontWeight:600,background:p.avail?C:'#ccc',
                        color:'#fff',borderRadius:8,cursor:p.avail?'pointer':'default'}}>
                      {p.avail?'+ Add':'Unavailable'}
                    </button>
                    {p.purl&&(
                      <a href={p.purl} target="_blank" rel="noopener noreferrer"
                        style={{padding:'7px 10px',fontSize:11,color:C,border:`1.5px solid ${C}`,borderRadius:8,display:'flex',alignItems:'center',
                          transition:'all .15s'}}
                        onMouseEnter={e=>{e.currentTarget.style.background=C;e.currentTarget.style.color='#fff'}}
                        onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=C}}>
                        ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Loading */}
          {loading&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 20px',color:'#78909C'}}>
              <div style={{width:32,height:32,border:`3px solid #e0e0e0`,borderTopColor:C,borderRadius:'50%',animation:'spin .7s linear infinite',marginBottom:10}}/>
              <p style={{fontSize:13}}>Searching...</p>
            </div>
          )}

          {/* Empty */}
          {!loading&&searched&&!searchErr&&products.length===0&&(
            <div className="fade" style={{textAlign:'center',padding:'40px 20px',color:'#78909C'}}>
              <span style={{fontSize:40}}>🔍</span>
              <h3 style={{fontSize:16,margin:'8px 0 4px',color:'#263238'}}>No products found</h3>
              <p style={{fontSize:13}}>Try a different search term or city.</p>
            </div>
          )}

          {/* Load more */}
          {hasMore&&!loading&&products.length>0&&(
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <button onClick={handleLoadMore} className="btn"
                style={{background:C,color:'#fff',padding:'9px 28px',fontSize:13,fontWeight:600,borderRadius:8}}>
                Load More
              </button>
            </div>
          )}
        </main>

        {/* ══════ CART DRAWER (ORIGINAL) ══════ */}
        {cartOpen&&(
          <>
            <div onClick={()=>setCartOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:300}}/>
            <div className="fade" style={{position:'fixed',top:0,right:0,bottom:0,width:Math.min(380,window.innerWidth-16),
              background:'#fff',zIndex:301,display:'flex',flexDirection:'column',boxShadow:'-4px 0 20px rgba(0,0,0,.12)'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h2 style={{fontSize:16,fontWeight:700}}>🛒 Cart ({cartCount})</h2>
                <button onClick={()=>setCartOpen(false)} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#888'}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:12}}>
                {cart.length===0?(
                  <div style={{textAlign:'center',padding:'36px 0',color:'#B0BEC5'}}>
                    <span style={{fontSize:40}}>🛒</span>
                    <p style={{marginTop:8,fontSize:13}}>Cart is empty</p>
                  </div>
                ):cart.map(c=>(
                  <div key={c.sku} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
                    <img src={c.image} alt="" style={{width:48,height:48,objectFit:'contain',borderRadius:8,background:'#fafafa'}}
                      onError={e=>{(e.target as HTMLImageElement).src='https://placehold.co/48'}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</p>
                      <p style={{fontSize:10,color:'#90A4AE'}}>{c.pack}</p>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                        <button onClick={()=>updateQty(c.sku,-1)}
                          style={{width:22,height:22,borderRadius:4,border:'1px solid #e0e0e0',background:'#fff',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                        <span style={{fontSize:12,fontWeight:700,minWidth:16,textAlign:'center'}}>{c.qty}</span>
                        <button onClick={()=>updateQty(c.sku,1)}
                          style={{width:22,height:22,borderRadius:4,border:'1px solid #e0e0e0',background:'#fff',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                        <span style={{flex:1}}/>
                        <span style={{fontSize:13,fontWeight:700,color:'#263238'}}>₹{(c.price*c.qty).toFixed(2)}</span>
                        <button onClick={()=>removeFromCart(c.sku)}
                          style={{background:'none',border:'none',color:'#ef5350',cursor:'pointer',fontSize:14,padding:2}}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length>0&&(
                <div style={{padding:12,borderTop:'1px solid #eee'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:14,fontWeight:600}}>Total</span>
                    <span style={{fontSize:16,fontWeight:700}}>₹{cartTotal.toFixed(2)}</span>
                  </div>
                  <p style={{fontSize:10,color:'#90A4AE',marginBottom:8}}>
                    Items will be added to your <strong>thewellnesscorner.com</strong> cart.
                  </p>
                  {!token&&<p style={{fontSize:11,color:'#FF6D00',marginBottom:6}}>⚠️ Set your token first</p>}
                  <button onClick={handleCheckout} disabled={checkingOut} className="btn"
                    style={{width:'100%',padding:'10px 0',background:token?'#FF6D00':'#bbb',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,
                      cursor:checkingOut?'wait':'pointer',opacity:checkingOut?.7:1}}>
                    {checkingOut?'⏳ Adding to Wellness Corner...':token?'🚀 Push to Wellness Corner Cart':'⚠️ Set Token First'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════ TOAST (ORIGINAL) ══════ */}
        {toast&&(
          <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',background:'#263238',color:'#fff',
            padding:'8px 20px',borderRadius:10,fontSize:12,fontWeight:500,boxShadow:'0 4px 16px rgba(0,0,0,.2)',zIndex:500,
            animation:'fade .2s ease',maxWidth:'90vw',textAlign:'center'}}>
            {toast}
          </div>
        )}

        {/* ══════ FOOTER ══════ */}
        <footer style={{textAlign:'center',padding:14,fontSize:10,color:'#B0BEC5',borderTop:'1px solid #eee',background:'#fff'}}>
          1mg Search → Wellness Corner Cart | thewellnesscorner.com
        </footer>
      </div>
    </>
  )
}