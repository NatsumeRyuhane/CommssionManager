// Shared wireframe primitives - chips, image placeholders, top bars, sample data
const { useState, useMemo, useEffect, useRef } = React;

// ============== Sample data ==============
const SAMPLE_LABELS = [
  { kind: "rating", name: "General" },
  { kind: "cat", name: "Chibi" },
  { kind: "cat", name: "Avatar" },
  { kind: "cat", name: "Monochrome" },
  { kind: "cat", name: "Reference" },
  { kind: "cat", name: "Weapon" },
  { kind: "tag", name: "background" },
  { kind: "tag", name: "co-commission" },
  { kind: "tag", name: "watermark" },
  { kind: "tag", name: "差分" },
  { kind: "tag", name: "expression-sheet" },
];

const SAMPLE_CHARACTERS = ["Heiyao", "Banzhi", "Gengzi", "Dileselon", "Aki", "Mira"];
const SAMPLE_ARTISTS    = ["Natsume Ryuhane", "@yuzuki_art", "板纸", "ToumeiSheep", "凉子"];

// ============== Platform handles ==============
// Each platform: symbol shown in the badge + a brand-ish color (muted for wireframe)
const PLATFORMS = {
  twitter:  { label: "X / Twitter", sym: "𝕏",  color: "#1d1d1f" },
  bsky:     { label: "Bluesky",     sym: "B",  color: "#3b6cf6" },
  fa:       { label: "FurAffinity", sym: "FA", color: "#36567a" },
  qq:       { label: "QQ",          sym: "Q",  color: "#1296db" },
  mihuashi: { label: "Mihuashi",    sym: "米", color: "#9b3b2b" },
  weibo:    { label: "Weibo",       sym: "微", color: "#b6552a" },
};

// Configured artists with multiple platform handles
const ARTIST_DB = [
  { id:"a1", name:"Natsume Ryuhane", handles:[
    {platform:"twitter",  handle:"@natsume_ryu"},
    {platform:"bsky",     handle:"natsume.bsky.social"},
    {platform:"fa",       handle:"natsumeR"},
  ], works: 14 },
  { id:"a2", name:"板纸 (Banzhi-art)", handles:[
    {platform:"weibo",    handle:"@板纸绘画"},
    {platform:"mihuashi", handle:"板纸"},
    {platform:"qq",       handle:"284910"},
  ], works: 9 },
  { id:"a3", name:"yuzuki", handles:[
    {platform:"twitter",  handle:"@yuzuki_art"},
    {platform:"fa",       handle:"yuzuki"},
  ], works: 6 },
  { id:"a4", name:"ToumeiSheep", handles:[
    {platform:"twitter",  handle:"@toumei_sheep"},
    {platform:"bsky",     handle:"sheep.bsky.social"},
  ], works: 3 },
  { id:"a5", name:"凉子 (Liangzi)", handles:[
    {platform:"mihuashi", handle:"凉子约稿"},
    {platform:"qq",       handle:"771203"},
  ], works: 5 },
];

// PlatformBadge — small circular monogram standing in for a platform logo
function PlatformBadge({ platform, size=20 }) {
  const p = PLATFORMS[platform] || { sym:"?", color:"var(--mute)", label:platform };
  return (
    <span title={p.label} style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:"var(--paper)", border:`1.5px solid ${p.color}`,
      color:p.color, fontWeight:700,
      fontSize: size*0.46, fontFamily:"IBM Plex Mono, monospace",
      lineHeight:1
    }}>{p.sym}</span>
  );
}

// pick aspect ratios that vary like a real album
function gen(seed, n=24) {
  // deterministic pseudo-random from seed
  let s = seed;
  const r = () => { s = (s*9301 + 49297) % 233280; return s/233280; };
  const ratios = [[3,4],[4,5],[1,1],[4,3],[2,3],[3,2],[3,5],[5,4],[9,16],[16,9]];
  const titles = [
    "Banzhi & Shouza", "Chibi w/ Dileselon", "Cut tail study", "Greatsword - watermark",
    "Avatar set", "Totem motif", "Lineart pass", "Color rough",
    "Expression sheet", "Reference: outfit A", "Background: forest", "Mira ref",
    "Aki - chibi pair", "Heiyao - portrait", "Gengzi 1", "Gengzi 2",
    "Weapon study II", "B/W concept", "Headshot - Heiyao", "Mira & Aki",
    "Twin chibis", "Outfit ref - winter", "Wing ref", "Co-commission: dual"
  ];
  const cats = ["Chibi","Avatar","Monochrome","Reference","Weapon","Other"];
  const ratings = ["General","General","General","Mature","General","General","Mature","Adult"];
  const out = [];
  for (let i=0;i<n;i++){
    const ar = ratios[Math.floor(r()*ratios.length)];
    out.push({
      id: i+1,
      title: titles[i % titles.length],
      ar,
      ratio: ar[0]/ar[1],
      cat: cats[Math.floor(r()*cats.length)],
      rating: ratings[Math.floor(r()*ratings.length)],
      tags: ["background","co-commission","差分","watermark"].filter(()=>r()>0.7).slice(0,2),
      chars: SAMPLE_CHARACTERS.filter(()=>r()>0.7).slice(0,2),
      artist: SAMPLE_ARTISTS[Math.floor(r()*SAMPLE_ARTISTS.length)],
      date: `2024-${String(1+Math.floor(r()*12)).padStart(2,"0")}-${String(1+Math.floor(r()*28)).padStart(2,"0")}`,
      formats: ["png","jpg","psd","sai2"].filter(()=>r()>0.55),
      size: [Math.floor(r()*2000+1200), Math.floor(r()*2000+1200)],
    });
  }
  return out;
}

const COMMISSIONS = gen(7, 28);

// ============== Chip ==============
function Chip({ kind="tag", children, removable=false, ghost=false, dot=false }) {
  return (
    <span className={`chip ${ghost? "ghost": kind}`}>
      {dot && <span className="dot" />}
      {children}
      {removable && <span className="x">✕</span>}
    </span>
  );
}

// ============== Image placeholder ==============
function ImgPh({ ar=[4,5], label, format, detached=false, style, focal, children }) {
  const w = 220;
  const h = Math.round(w * ar[1]/ar[0]);
  return (
    <div className={`imgph ${detached?"detached":""}`}
         style={{ width: "100%", aspectRatio: `${ar[0]} / ${ar[1]}`, ...style }}>
      <span style={{opacity:0.5}}>{ar[0]}:{ar[1]}</span>
      {label && <div className="meta">{label}</div>}
      {format && <div className="meta" style={{right:6, left:"auto"}}>{format}</div>}
      {focal && (
        <div style={{
          position:"absolute",
          left: `${focal[0]*100}%`, top: `${focal[1]*100}%`,
          transform: "translate(-50%,-50%)",
          width: 36, height: 36, borderRadius: "50%",
          border: "2px solid #2f6a55", boxShadow: "0 0 0 2px rgba(255,255,255,0.8)",
          background: "rgba(47,106,85,0.12)",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#2f6a55", fontFamily:"IBM Plex Mono", fontSize: 11
        }}>
          ⊕
        </div>
      )}
      {children}
    </div>
  );
}

// ============== Notion-style top bar ==============
function NotionTop({ crumbs=[], children, onSearch }) {
  return (
    <div className="notion-top">
      <span className="iconbtn" title="toggle sidebar">≡</span>
      <span className="crumb">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i>0 && <span style={{margin:"0 6px", color:"var(--mute)"}}>/</span>}
            {i === crumbs.length-1 ? <b>{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </span>
      <span className="spacer" />
      {children}
      <span className="iconbtn">⤴</span>
      <span className="iconbtn">★</span>
      <span className="iconbtn">⋯</span>
    </div>
  );
}

// ============== Sidebar ==============
function NotionSide({ active="Gallery" }) {
  const items = [
    ["🖼", "Gallery"],
    ["🗂", "Categories"],
    ["🏷", "Tags"],
    ["🧑", "Characters"],
    ["✍️", "Artists"],
  ];
  const lifecycle = [
    ["✏️", "Sketching"],
    ["🖋", "Lineart"],
    ["🎨", "Color"],
    ["📦", "Delivered"],
    ["⊘", "Detached"],
  ];
  return (
    <div className="notion-side">
      <div className="ws">
        <div className="avatar">H</div>
        <span style={{fontWeight:600, color:"var(--ink)"}}>Heiyao's commissions</span>
        <span className="iconbtn" style={{marginLeft:"auto"}}>⌄</span>
      </div>
      <div className="nav-item"><span className="nav-icon">🔍</span> Search</div>
      <div className="nav-item"><span className="nav-icon">⏱</span> Recents</div>

      <div className="section-label">Browse</div>
      {items.map(([ic, name]) => (
        <div key={name} className={`nav-item ${name===active?"active":""}`}>
          <span className="nav-icon">{ic}</span>{name}
        </div>
      ))}

      <div className="section-label">Lifecycle</div>
      {lifecycle.map(([ic, name]) => (
        <div key={name} className={`nav-item ${name===active?"active":""}`}>
          <span className="nav-icon">{ic}</span>{name}
        </div>
      ))}

      <div style={{flex:1}} />
      <div className="nav-item" style={{color:"var(--mute)"}}>
        <span className="nav-icon">🔒</span> Locked · sign in to edit
      </div>
    </div>
  );
}

// ============== Sketchy annotation ==============
function Note({ children, style }) {
  return <div className="note" style={style}>
    <span style={{fontSize: 16}}>↳</span>
    <span>{children}</span>
  </div>;
}

// ============== Filter bar (collapsible top) ==============
function FilterBar({ expanded=false, onToggle }) {
  return (
    <div style={{
      borderBottom: "1px solid var(--rule)",
      background: "var(--paper)",
      padding: "10px 24px",
    }}>
      <div className="row gap-8" style={{flexWrap:"wrap"}}>
        <div className="row" style={{
          flex: "1 1 240px", maxWidth: 360,
          border:"1px solid var(--rule-2)", borderRadius: 6,
          padding: "4px 10px", background: "var(--paper)"
        }}>
          <span style={{color:"var(--mute)"}}>🔍</span>
          <input className="field" style={{border:"none", padding:"2px 4px"}}
                 placeholder="Search title, description…" />
          <span className="mono-sm" style={{whiteSpace:"nowrap"}}>title · desc</span>
        </div>

        <Chip kind="cat">Chibi <span className="x">✕</span></Chip>
        <Chip kind="cat">Avatar <span className="x">✕</span></Chip>
        <Chip kind="rating">General <span className="x">✕</span></Chip>
        <Chip kind="char">Heiyao <span className="x">✕</span></Chip>
        <Chip ghost>+ filter</Chip>

        <span style={{flex:1}} />

        <span className="mono-sm">28 results</span>
        <button className="btn sm" onClick={onToggle}>
          {expanded ? "▴ collapse" : "▾ more filters"}
        </button>
        <button className="btn sm">Sort: date ↓</button>
      </div>

      {expanded && (
        <div style={{
          marginTop: 10, padding: 12,
          background: "var(--paper-2)", borderRadius: 6,
          display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 12, fontSize: 12
        }}>
          <FilterCol title="Categories" tone="cat" items={["Chibi","Avatar","Monochrome","Reference","Weapon","Other"]} active={["Chibi","Avatar"]} />
          <FilterCol title="Tags" tone="tag" items={["background","co-commission","差分","watermark","expression-sheet"]} />
          <FilterCol title="Rating" tone="rating" items={["General","Mature","Adult"]} active={["General"]} radio />
          <div className="col gap-8">
            <div className="label">Time range</div>
            <div className="row gap-4">
              <input className="field" placeholder="2024-01-01" />
              <span className="muted">→</span>
              <input className="field" placeholder="2025-12-31" />
            </div>
            <div className="label" style={{marginTop:8}}>Character count</div>
            <div className="row gap-4">
              <input className="field" defaultValue="1" style={{width:60}} />
              <span className="muted">to</span>
              <input className="field" defaultValue="3" style={{width:60}} />
            </div>
            <div className="label" style={{marginTop:8}}>File format</div>
            <div className="row gap-4 wrap">
              <Chip ghost>png ✓</Chip>
              <Chip ghost>jpg</Chip>
              <Chip ghost>psd ✓</Chip>
              <Chip ghost>sai2</Chip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterCol({ title, tone, items, active=[], radio=false }) {
  return (
    <div className="col gap-4">
      <div className="row" style={{justifyContent:"space-between"}}>
        <div className="label" style={{margin:0}}>{title}</div>
        <span className="mono-sm">{radio?"○ one":"☑ many"}</span>
      </div>
      <input className="field" placeholder={`search ${title.toLowerCase()}…`} />
      <div className="row wrap gap-4">
        {items.map(it => (
          <Chip key={it} kind={tone} ghost={!active.includes(it)}>
            {active.includes(it) && "✓ "}{it}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// ============== FurAffinity-style column gallery ==============
function FaGallery({ items, columns=4, showTitles=true, compact=false }) {
  // Distribute items into N columns, balancing by accumulated height
  const cols = Array.from({length: columns}, () => ({ h: 0, items: [] }));
  items.forEach(it => {
    const c = cols.reduce((a,b) => a.h <= b.h ? a : b);
    const itemH = 1 / it.ratio; // height per unit width
    c.items.push(it);
    c.h += itemH + 0.1;
  });
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: compact? 8 : 12,
      padding: compact? "12px 16px" : "16px 24px",
      overflow:"auto"
    }}>
      {cols.map((col, i) => (
        <div key={i} style={{display:"flex", flexDirection:"column", gap: compact?8:12}}>
          {col.items.map(it => (
            <div key={it.id} className="fa-tile">
              <ImgPh ar={it.ar} />
              {showTitles && (
                <div style={{
                  position:"absolute", left:0, right:0, bottom:0,
                  padding:"18px 8px 6px",
                  background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                  color: "white", fontSize: 12
                }}>
                  <div style={{fontWeight:500}}>{it.title}</div>
                  <div style={{opacity:0.85, fontSize:10}} className="mono">
                    {it.size[0]}×{it.size[1]} · {it.formats.join(",") || "png"}
                  </div>
                </div>
              )}
              <div className="label-row">
                <Chip kind="cat">{it.cat}</Chip>
                {it.rating !== "General" && <Chip kind="rating">{it.rating}</Chip>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  COMMISSIONS, SAMPLE_LABELS, SAMPLE_CHARACTERS, SAMPLE_ARTISTS,
  PLATFORMS, ARTIST_DB, PlatformBadge,
  Chip, ImgPh, NotionTop, NotionSide, Note, FilterBar, FilterCol, FaGallery
});
