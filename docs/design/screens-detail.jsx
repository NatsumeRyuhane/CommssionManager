// Detail page - 3 variants
const SAMPLE = {
  id: 42,
  title: "Banzhi & Shouza — chibi pair",
  description: "Co-commission chibi piece, completed for Heiyao's anniversary. Includes background and a clean variant.",
  date: "2024-09-12",
  confirmedAt: "2024-08-21",
  price: { amount: 280, currency: "USD" },
  cat: "Chibi",
  rating: "General",
  tags: ["background", "co-commission", "差分"],
  characters: ["Heiyao", "Banzhi"],
  artists: ["Natsume Ryuhane", "@yuzuki_art"],
  formats: ["png", "jpg", "psd", "sai2"],
  size: [3000, 4000],
  files: [
    { node: "Sketching",  name: "rough.png",            kind:"png",  display:true },
    { node: "Sketching",  name: "rough_alt.png",        kind:"png",  display:true },
    { node: "Lineart",    name: "lineart.psd",          kind:"psd",  display:false },
    { node: "Color",      name: "color_flat.png",       kind:"png",  display:true },
    { node: "Color",      name: "color_render.psd",     kind:"psd",  display:false },
    { node: "Delivered",  name: "final_with_bg.png",    kind:"png",  display:true, label:"with bg" },
    { node: "Delivered",  name: "final_clean.png",      kind:"png",  display:true, label:"clean" },
    { node: "Delivered",  name: "final.psd",            kind:"psd",  display:false },
    { node: "Detached",   name: "qr_code.png",          kind:"png",  display:true },
  ]
};

// ============== Variant 1 — hero + side rail (top) + vertical lifecycle (bottom) ==============
function ApiCopyButton() {
  const [copied, setCopied] = React.useState(false);
  const payload = JSON.stringify({
    id: 42,
    title: "Banzhi & Shouza — chibi pair",
    date: "2024-09-12",
    confirmed_at: "2024-08-21",
    category: "Chibi",
    rating: "General",
    tags: ["background", "co-commission", "差分"],
    characters: ["Heiyao", "Banzhi"],
    artists: ["Natsume Ryuhane", "@yuzuki_art"],
    current_stage: "Delivered",
    files_endpoint: "/api/v1/commissions/42/files",
    public_images_endpoint: "/api/v1/commissions/42/images?visibility=public"
  }, null, 2);
  return (
    <button className="btn sm" title="Copy commission details as JSON for agent/automation use"
      style={{fontFamily:"IBM Plex Mono", fontSize:11}}
      onClick={() => { navigator.clipboard?.writeText(payload); setCopied(true); setTimeout(()=>setCopied(false), 2000); }}>
      {copied ? "✓ copied!" : "{} Copy API JSON"}
    </button>
  );
}

function DetailHeroSide() {
  const [showAll, setShowAll] = React.useState(true);
  return (
    <div className="wf">
      <div style={{
        padding:"12px 24px", display:"flex", alignItems:"center", gap: 12,
        borderBottom: "1px solid var(--rule)", background:"var(--paper)"
      }}>
        <span className="iconbtn">←</span>
        <span className="mono-sm muted">gallery /</span>
        <strong style={{fontSize:14}}>Banzhi & Shouza — chibi pair</strong>
        <span className="mono-sm muted">#042</span>
        <span style={{flex:1}} />
        <span className="row gap-4 mono-sm" style={{color:"var(--accent)"}}>
          <span>🌐</span> public · <span style={{color:"var(--mute)"}}>3 fields hidden</span>
        </span>
        <button className="btn sm">👁 visibility</button>
        <ApiCopyButton />
        <button className="btn sm">↗ Export zip</button>
        <button className="btn sm primary">✎ Edit</button>
      </div>

      <div style={{flex:1, overflow:"auto"}}>
        {/* TOP HALF — hero + side rail */}
        <div style={{display:"flex", borderBottom: "1px solid var(--rule)"}}>
          <div style={{flex: 1, minWidth: 0}}>
            <div className="page-title">
              <div className="row gap-8" style={{marginBottom:6}}>
                <Chip kind="cat">Chibi</Chip>
                <Chip kind="rating">General</Chip>
                <Chip kind="tag">co-commission</Chip>
                <Chip kind="tag">背景</Chip>
                <Chip kind="tag">差分</Chip>
              </div>
              <h1>{SAMPLE.title}</h1>
              <div className="sub mono">commission #042 · 2024-09-12 · 3000×4000 · png/jpg/psd/sai2</div>
            </div>
            {/* Main image + public images in timeline order */}
            <div style={{padding: "8px 64px 28px"}}>
              <div style={{borderRadius: 8, overflow: "hidden", border: "1px solid var(--rule)", maxWidth: 460, margin:"0 auto"}}>
                <ImgPh ar={[3,4]} />
              </div>
              {/* All public displayable images — timeline order, no detached */}
              <div style={{marginTop:12}}>
                <div className="mono-sm muted" style={{marginBottom:6, textAlign:"center"}}>
                  public images · timeline order · Sketching → Delivered
                </div>
                <div className="row gap-8" style={{justifyContent:"center", overflowX:"auto", flexWrap:"wrap"}}>
                  {[
                    {ar:[3,4], stage:"Sketching", label:"rough.png"},
                    {ar:[3,4], stage:"Sketching", label:"rough_alt.png"},
                    {ar:[3,4], stage:"Color",     label:"color_flat.png"},
                    {ar:[3,4], stage:"Delivered", label:"final_with_bg.png", cover:true},
                    {ar:[3,4], stage:"Delivered", label:"final_clean.png"},
                  ].map((img, i) => (
                    <div key={i} style={{textAlign:"center"}}>
                      <div style={{
                        width: 72, flexShrink:0,
                        outline: img.cover ? "2px solid var(--accent)" : "1px solid var(--rule)",
                        outlineOffset: 2, borderRadius: 4
                      }}>
                        <ImgPh ar={img.ar} />
                      </div>
                      <div className="mono-sm" style={{marginTop:3, color:"var(--mute)", fontSize:9, maxWidth:72, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{img.stage}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginTop: 18, color:"var(--ink-2)", lineHeight:1.7}}>
                {SAMPLE.description}
              </div>
            </div>
          </div>
          <div style={{
            width: 320, borderLeft: "1px solid var(--rule)",
            padding: "24px 20px", flexShrink: 0,
            background: "#fbfaf6"
          }}>
            <SideMeta />
          </div>
        </div>

        {/* BOTTOM HALF — vertical lifecycle (uses shared LifecycleStagesList) */}
        <div style={{padding: "20px 32px 32px"}}>
          <div className="row" style={{justifyContent:"space-between", marginBottom: 12}}>
            <div className="row gap-8">
              <strong style={{fontSize:15}}>Lifecycle</strong>
              <span className="mono-sm muted">embedded · same component as /lifecycle endpoint</span>
            </div>
            <div className="row gap-8">
              <LifecycleViewToggle showAll={showAll} setShowAll={setShowAll} />
              <a href="#lifecycle" className="mono-sm" style={{color:"var(--accent)", textDecoration:"none", alignSelf:"center"}}>
                open full page ↗
              </a>
            </div>
          </div>
          <LifecycleStagesList showAll={showAll} onShowAllChange={setShowAll} dragEnabled editable />
        </div>
      </div>
      <Note style={{top: 90, right: 360}}>desktop: lifecycle inlined here · standalone page rarely visited</Note>
    </div>
  );
}

// Public/private indicator dot, shown over file thumbnails
function PrivacyDot({ kind }) {
  const isPub = kind === "public";
  return (
    <div title={isPub ? "Public" : "Login required"} style={{
      position:"absolute", top:4, right:4,
      width: 18, height: 18, borderRadius: "50%",
      background: isPub ? "rgba(47,106,85,0.92)" : "rgba(155,58,43,0.92)",
      color:"white", fontSize: 10,
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:"0 0 0 2px rgba(255,255,255,0.85)"
    }}>{isPub ? "🌐" : "🔒"}</div>
  );
}

function SideMeta() {
  const meta = [
    { label:"Date", value:"2024-09-12", pub: true },
    { label:"Confirmed", value:"2024-08-21", pub: false },
    { label:"Price", value:"$280 USD", pub: false },
  ];
  return (
    <div className="col gap-12">
      <div className="row gap-4" style={{padding:"6px 8px", background:"var(--paper-2)", borderRadius:6, fontSize:12}}>
        <span className="mono-sm">visibility:</span>
        <span style={{color:"var(--accent)"}}>🌐 4 public</span>
        <span className="mono-sm muted">·</span>
        <span style={{color:"var(--warn)"}}>🔒 3 private</span>
        <span style={{flex:1}} />
        <span className="mono-sm" style={{cursor:"pointer", color:"var(--accent)"}}>edit</span>
      </div>
      {meta.map(m => (
        <div key={m.label} className="row" style={{justifyContent:"space-between", borderBottom:"1px dashed var(--rule)", paddingBottom:6}}>
          <span className="row gap-4">
            <span className="label" style={{margin:0}}>{m.label}</span>
            <span style={{fontSize:10, color: m.pub?"var(--accent)":"var(--warn)"}}>
              {m.pub ? "🌐" : "🔒"}
            </span>
          </span>
          <span style={{fontSize:13}}>{m.value}</span>
        </div>
      ))}
      <div>
        <div className="label">Characters</div>
        <div className="row wrap gap-4">
          <Chip kind="char">Heiyao</Chip>
          <Chip kind="char">Banzhi</Chip>
        </div>
      </div>
      <div>
        <div className="label">Artists</div>
        <div className="row wrap gap-4">
          <Chip kind="artist">Natsume Ryuhane</Chip>
          <Chip kind="artist">@yuzuki_art</Chip>
        </div>
      </div>
      <div>
        <div className="label">Files</div>
        <div className="col gap-4">
          {SAMPLE.files.slice(0,6).map(f => <FileRow key={f.name} f={f} />)}
          <span className="mono-sm muted">+ 3 more in Detached…</span>
        </div>
      </div>
      <div>
        <div className="label">Storage</div>
        <div className="mono-sm">
          <div>backend: <span style={{color:"var(--ink)"}}>local-fs</span></div>
          <div>bucket: <span style={{color:"var(--ink)"}}>commissions/</span></div>
          <div>key: <span style={{color:"var(--ink)"}}>042/banzhi-shouza/</span></div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({label, value}) {
  return (
    <div className="row" style={{justifyContent:"space-between", borderBottom:"1px dashed var(--rule)", paddingBottom: 6}}>
      <span className="label" style={{margin:0}}>{label}</span>
      <span style={{fontSize:13}}>{value}</span>
    </div>
  );
}

function FileRow({f}) {
  return (
    <div className="row gap-8" style={{
      padding: "4px 6px", borderRadius: 4,
      background: f.node==="Detached"? "rgba(182,85,42,0.08)": "transparent"
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 3, background: "var(--paper-2)",
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        fontFamily:"IBM Plex Mono", fontSize: 9, fontWeight: 600,
        color: "var(--ink-2)"
      }}>{f.kind.toUpperCase().slice(0,3)}</span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.name}</div>
        <div className="mono-sm">{f.node}{f.label? ` · ${f.label}`:""}</div>
      </div>
      {f.display && <span title="displayable" style={{color:"var(--accent)", fontSize:12}}>◉</span>}
    </div>
  );
}

// ============== Variant 2 — image + lifecycle equally featured ==============
function DetailWithLifecycle() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Gallery", "Banzhi & Shouza"]}>
        <button className="btn sm">↗ Export zip</button>
        <button className="btn sm">✎ Edit</button>
      </NotionTop>
      <div style={{flex:1, overflow:"auto", padding: "20px 32px"}}>
        <div className="row gap-8">
          <Chip kind="cat">Chibi</Chip>
          <Chip kind="rating">General</Chip>
          <Chip kind="tag">co-commission</Chip>
          <Chip kind="tag">差分</Chip>
        </div>
        <h1 style={{margin: "10px 0 4px", fontSize: 28}}>{SAMPLE.title}</h1>
        <div className="mono-sm muted">#042 · 2024-09-12 · 3000×4000</div>

        <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap: 24, marginTop: 18}}>
          <div>
            <div style={{borderRadius: 8, overflow:"hidden", border:"1px solid var(--rule)"}}>
              <ImgPh ar={[3,4]} />
            </div>
            <div className="row gap-4" style={{marginTop:8}}>
              <Chip ghost>with bg ✓</Chip>
              <Chip ghost>clean</Chip>
              <Chip ghost>rough</Chip>
              <Chip ghost>color flat</Chip>
            </div>
          </div>
          <div className="col gap-12">
            <div>
              <div className="label">Characters · Artists</div>
              <div className="row wrap gap-4">
                <Chip kind="char">Heiyao</Chip>
                <Chip kind="char">Banzhi</Chip>
                <Chip kind="artist">Natsume Ryuhane</Chip>
                <Chip kind="artist">@yuzuki_art</Chip>
              </div>
            </div>
            <p className="muted" style={{margin:0, fontSize:13, lineHeight:1.6}}>
              {SAMPLE.description}
            </p>
            <div style={{
              padding: 12, background: "var(--paper-2)", borderRadius: 6,
              display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, fontSize: 13
            }}>
              <div><div className="label">Confirmed</div>2024-08-21</div>
              <div><div className="label">Completed</div>2024-09-12</div>
              <div><div className="label">Price</div>$280 USD</div>
            </div>
          </div>
        </div>

        <div style={{marginTop: 28}}>
          <div className="row" style={{justifyContent:"space-between"}}>
            <strong>Lifecycle</strong>
            <span className="mono-sm muted">5 stages · linear</span>
          </div>
          <HorizontalLifecycle />
        </div>
      </div>
      <Note style={{top: 80, right: 32}}>v2 · image + lifecycle timeline equally featured</Note>
    </div>
  );
}

function HorizontalLifecycle() {
  const stages = [
    { name:"Sketching", date:"08-22", files:2, kind:"done" },
    { name:"Lineart",   date:"08-29", files:1, kind:"done" },
    { name:"Color",     date:"09-04", files:2, kind:"done" },
    { name:"Delivered", date:"09-12", files:3, kind:"done" },
  ];
  return (
    <div style={{
      marginTop: 12, padding: "16px 8px",
      background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8,
      overflowX: "auto"
    }}>
      <div className="row" style={{gap: 0, position:"relative"}}>
        {stages.map((s, i) => (
          <React.Fragment key={s.name}>
            <div style={{flex:1, minWidth: 160, padding: "0 12px"}}>
              <div className="row gap-8" style={{marginBottom: 8}}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "var(--accent)", color: "white",
                  display:"inline-flex", alignItems:"center", justifyContent:"center",
                  fontSize: 11, fontWeight: 600
                }}>{i+1}</span>
                <div>
                  <div style={{fontWeight: 600, fontSize: 13}}>{s.name}</div>
                  <div className="mono-sm">{s.date}</div>
                </div>
              </div>
              <div className="row gap-4">
                {Array.from({length: s.files}).map((_, k) => (
                  <div key={k} style={{width: 36, height: 44}}>
                    <ImgPh ar={[3,4]} />
                  </div>
                ))}
              </div>
            </div>
            {i<stages.length-1 && (
              <div style={{width: 40, alignSelf:"flex-start", marginTop: 10}}>
                <div style={{borderTop: "1.5px dashed var(--rule-2)"}} />
              </div>
            )}
          </React.Fragment>
        ))}
        <div style={{flex:1, minWidth: 140, padding: "0 12px", borderLeft: "1px dashed var(--warn)"}}>
          <div className="row gap-8" style={{marginBottom: 8}}>
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "transparent", color:"var(--warn)",
              border:"1.5px dashed var(--warn)",
              display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize: 11
            }}>⊘</span>
            <div>
              <div style={{fontWeight:600, fontSize:13, color:"var(--warn)"}}>Detached</div>
              <div className="mono-sm">uncategorized</div>
            </div>
          </div>
          <div className="row gap-4">
            <div style={{width:36, height:44}}><ImgPh ar={[1,1]} detached /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Variant 3 — lightbox-first ==============
function DetailLightbox() {
  return (
    <div className="wf" style={{background:"#1a1916", color: "#f0ede5"}}>
      <div style={{
        padding:"10px 16px", display:"flex", alignItems:"center", gap:12,
        borderBottom:"1px solid rgba(255,255,255,0.08)"
      }}>
        <span className="iconbtn" style={{color:"#f0ede5"}}>←</span>
        <span style={{fontSize:13, opacity:0.7}}>Gallery / </span>
        <strong style={{fontSize:13}}>Banzhi & Shouza</strong>
        <span style={{flex:1}} />
        <span className="mono-sm" style={{color:"rgba(255,255,255,0.6)"}}>1 / 4</span>
        <span className="iconbtn" style={{color:"#f0ede5"}}>⤓</span>
        <span className="iconbtn" style={{color:"#f0ede5"}}>ⓘ</span>
        <span className="iconbtn" style={{color:"#f0ede5"}}>✎</span>
      </div>
      <div style={{flex:1, position:"relative", display:"flex", alignItems:"center", justifyContent:"center", padding: 32}}>
        <div style={{width:"60%", maxHeight:"100%"}}>
          <ImgPh ar={[3,4]} />
        </div>
        <span className="iconbtn" style={{
          position:"absolute", left: 24, top: "50%", color: "#f0ede5",
          background: "rgba(0,0,0,0.4)", width:36, height:36, borderRadius:"50%"
        }}>‹</span>
        <span className="iconbtn" style={{
          position:"absolute", right: 24, top: "50%", color: "#f0ede5",
          background: "rgba(0,0,0,0.4)", width:36, height:36, borderRadius:"50%"
        }}>›</span>

        {/* metadata overlay - bottom */}
        <div style={{
          position:"absolute", left: 32, right: 32, bottom: 24,
          padding: "16px 20px", borderRadius: 10,
          background: "rgba(20,18,15,0.85)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.08)"
        }}>
          <div className="row gap-8" style={{marginBottom:6}}>
            <Chip kind="cat">Chibi</Chip>
            <Chip kind="rating">General</Chip>
            <Chip kind="tag">co-commission</Chip>
            <Chip kind="tag">差分</Chip>
          </div>
          <div className="row" style={{justifyContent:"space-between", alignItems:"flex-end"}}>
            <div>
              <h2 style={{margin:"4px 0", fontSize:20, color:"#f8f5ec"}}>{SAMPLE.title}</h2>
              <div className="mono-sm" style={{color:"rgba(255,255,255,0.55)"}}>
                Heiyao · Banzhi · Natsume Ryuhane · @yuzuki_art · 2024-09-12
              </div>
            </div>
            <span className="mono-sm" style={{color:"rgba(255,255,255,0.5)"}}>
              press <b style={{color:"#fff"}}>I</b> for full info · <b style={{color:"#fff"}}>Esc</b> to close
            </span>
          </div>
        </div>
      </div>

      {/* film strip */}
      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display:"flex", gap: 8, overflowX:"auto"
      }}>
        {[[3,4],[3,4],[1,1],[3,4]].map((ar, i) => (
          <div key={i} style={{
            width: 60, flexShrink:0,
            border: i===0?"2px solid #d2b88a":"2px solid transparent",
            borderRadius: 4
          }}>
            <ImgPh ar={ar} />
          </div>
        ))}
        <span style={{flex:1}} />
        <div style={{
          width: 60, flexShrink:0, opacity: 0.6,
          borderRadius: 4, border: "1px dashed rgba(255,255,255,0.2)"
        }}>
          <ImgPh ar={[1,1]} detached />
        </div>
      </div>
      <Note style={{top: 40, right: 32, color:"#d2b88a"}}>v3 · lightbox-first · keyboard nav, info on tap</Note>
    </div>
  );
}

Object.assign(window, { DetailHeroSide, ApiCopyButton });
