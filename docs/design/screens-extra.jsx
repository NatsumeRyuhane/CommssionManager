// Missing screens — fills out the desktop/mobile pairs across sections

// ============== ① Mobile auth ==============
function MobileAuth() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 14px", display:"flex", alignItems:"center", gap: 8, borderBottom:"1px solid var(--rule)"}}>
          <strong style={{fontSize: 15}}>Heiyao</strong>
          <span className="mono-sm muted">28</span>
          <span style={{flex:1}} />
          <span className="iconbtn">🔍</span>
        </div>

        {/* faded gallery preview behind sheet */}
        <div style={{position:"relative", flex:1, overflow:"hidden"}}>
          <div style={{padding:8, opacity:0.45, pointerEvents:"none"}}>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
              {[0,1].map(col => (
                <div key={col} className="col" style={{gap:6}}>
                  {COMMISSIONS.slice(col*4, col*4+4).map(it => (
                    <div key={it.id} className="fa-tile"><ImgPh ar={it.ar} /></div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* bottom sheet */}
          <div style={{
            position:"absolute", left:0, right:0, bottom:0,
            background:"var(--paper)", borderTopLeftRadius:16, borderTopRightRadius:16,
            boxShadow:"0 -8px 32px rgba(0,0,0,0.18)",
            padding:"14px 18px 22px"
          }}>
            <div style={{
              width:40, height:4, borderRadius:2, background:"var(--rule-2)",
              margin:"0 auto 12px"
            }} />
            <div className="row" style={{justifyContent:"space-between", marginBottom:4}}>
              <strong style={{fontSize:15}}>Sign in to edit</strong>
              <span className="iconbtn">✕</span>
            </div>
            <div className="mono-sm muted" style={{marginBottom:12}}>
              Browsing is open. Sign in to add, edit or export.
            </div>
            <div className="col gap-8">
              <div>
                <span className="label">Password</span>
                <input className="field lg" type="password" placeholder="••••••••" />
              </div>
              <label className="row gap-4 mono-sm" style={{marginTop:2}}>
                <input type="checkbox" defaultChecked /> stay signed in 30 days
              </label>
              <button className="btn primary" style={{justifyContent:"center", marginTop:6, padding:"10px"}}>
                Unlock
              </button>
              <button className="btn" style={{justifyContent:"center"}}>Continue browsing →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== ③ Mobile filter sheet ==============
function MobileFilter() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">✕</span>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>Filter & search</strong>
          <button className="btn sm ghost" style={{padding:"2px 6px"}}>Reset</button>
        </div>

        <div style={{flex:1, overflow:"auto", padding:"12px 14px"}}>
          {/* search */}
          <div className="row" style={{
            border:"1px solid var(--rule-2)", borderRadius:6, padding:"6px 10px", marginBottom:10
          }}>
            <span style={{color:"var(--mute)"}}>🔍</span>
            <input className="field" style={{border:"none", padding:"2px 4px", flex:1}} placeholder="Banzhi" defaultValue="Banzhi" />
          </div>
          <div className="row gap-4 wrap" style={{marginBottom:14}}>
            <Chip ghost>title ✓</Chip>
            <Chip ghost>desc ✓</Chip>
            <Chip ghost>fuzzy ✓</Chip>
          </div>

          {/* active filters */}
          <div className="label">Active</div>
          <div className="row gap-4 wrap" style={{marginBottom:14}}>
            <Chip kind="cat">Chibi <span className="x">✕</span></Chip>
            <Chip kind="rating">General <span className="x">✕</span></Chip>
            <Chip kind="char">Heiyao <span className="x">✕</span></Chip>
          </div>

          {/* accordion sections */}
          <MobileFilterAcc title="Categories" tone="cat" items={["Chibi","Avatar","Monochrome","Reference","Weapon"]} active={["Chibi"]} expanded />
          <MobileFilterAcc title="Tags" tone="tag" items={["background","co-commission","差分","watermark"]} active={["差分"]} />
          <MobileFilterAcc title="Rating" tone="rating" items={["General","Mature","Adult"]} active={["General"]} radio />
          <MobileFilterAcc title="Characters & Artists" tone="char" items={["Heiyao","Banzhi","Natsume Ryuhane","@yuzuki_art"]} active={["Heiyao"]} />
          <MobileFilterAcc title="Time range" custom>
            <div className="row gap-4">
              <input className="field" defaultValue="2024-01-01" />
              <span className="muted">→</span>
              <input className="field" defaultValue="2025-12-31" />
            </div>
          </MobileFilterAcc>
          <MobileFilterAcc title="File format" custom>
            <div className="row gap-4 wrap">
              <Chip ghost>png ✓</Chip>
              <Chip ghost>jpg</Chip>
              <Chip ghost>psd ✓</Chip>
              <Chip ghost>sai2</Chip>
            </div>
          </MobileFilterAcc>
        </div>

        <div style={{borderTop:"1px solid var(--rule)", padding:"10px 14px", display:"flex", gap:8}}>
          <span className="mono-sm muted" style={{alignSelf:"center", flex:1}}>28 results</span>
          <button className="btn primary" style={{flex:1, justifyContent:"center"}}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function MobileFilterAcc({ title, tone, items=[], active=[], radio=false, expanded=false, custom=false, children }) {
  const [open, setOpen] = React.useState(expanded);
  return (
    <div style={{borderBottom:"1px solid var(--rule)", padding:"10px 0"}}>
      <div onClick={() => setOpen(!open)} className="row" style={{justifyContent:"space-between", cursor:"pointer"}}>
        <strong style={{fontSize:13}}>{title}</strong>
        <span className="mono-sm muted">{!custom && (radio?"○ one":"☑ many")} {open?"▴":"▾"}</span>
      </div>
      {open && (
        <div style={{marginTop:8}}>
          {custom ? children : (
            <div className="row gap-4 wrap">
              {items.map(it => (
                <Chip key={it} kind={tone} ghost={!active.includes(it)}>
                  {active.includes(it) && "✓ "}{it}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============== ⑥ Mobile settings - API ==============
function MobileSettingsAPI() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>API & Integrations</strong>
          <span className="iconbtn">⋯</span>
        </div>

        {/* settings sub-nav */}
        <div style={{display:"flex", borderBottom:"1px solid var(--rule)", overflowX:"auto", fontSize:11}}>
          {["General","API","Visibility","Storage","Users"].map((t,i)=>(
            <div key={t} style={{
              padding:"8px 12px", flexShrink:0, cursor:"pointer", whiteSpace:"nowrap",
              borderBottom: i===1?"2px solid var(--accent)":"2px solid transparent",
              color: i===1?"var(--ink)":"var(--mute)",
              fontWeight: i===1?600:400
            }}>{t}</div>
          ))}
        </div>

        <div style={{flex:1, overflow:"auto", padding:"12px 14px"}}>
          <div className="mono-sm muted" style={{marginBottom:14, lineHeight:1.5}}>
            Keys grant machine access to commission data. Never share keys.
          </div>

          {/* API key cards */}
          <div className="row" style={{justifyContent:"space-between", marginBottom:8}}>
            <strong style={{fontSize:13}}>API Keys</strong>
            <button className="btn sm primary" style={{padding:"3px 8px"}}>+ Generate</button>
          </div>

          {[
            {name:"n8n automation", key:"cmgr_••••3f9a", scopes:"read · write", last:"2h ago", active:true},
            {name:"gallery widget", key:"cmgr_••••b2c1", scopes:"read-only",    last:"4d ago", active:true},
            {name:"old backup bot", key:"cmgr_••••11ee", scopes:"read-only",    last:"90d ago", active:false},
          ].map((k,i) => (
            <div key={i} style={{
              border:"1px solid var(--rule)", borderRadius:8, padding:10, marginBottom:8,
              opacity: k.active ? 1 : 0.55
            }}>
              <div className="row" style={{justifyContent:"space-between", marginBottom:4}}>
                <strong style={{fontSize:13}}>{k.name}</strong>
                {!k.active && <Chip kind="rating">revoked</Chip>}
              </div>
              <div className="mono-sm" style={{fontFamily:"IBM Plex Mono, monospace", fontSize:11, color:"var(--ink-2)"}}>{k.key}</div>
              <div className="row gap-4" style={{marginTop:6}}>
                {k.scopes.split(" · ").map(s => <Chip key={s} kind="tag">{s}</Chip>)}
              </div>
              <div className="row" style={{justifyContent:"space-between", marginTop:6}}>
                <span className="mono-sm muted">last used {k.last}</span>
                <button className="btn sm" style={{padding:"2px 6px"}}>⋯</button>
              </div>
            </div>
          ))}

          <div className="row" style={{justifyContent:"space-between", marginTop:18, marginBottom:8}}>
            <strong style={{fontSize:13}}>Webhooks</strong>
            <button className="btn sm primary" style={{padding:"3px 8px"}}>+ Add</button>
          </div>
          {[
            {url:"https://n8n.home/webhook/cmgr", status:"active", events:"created · updated"},
            {url:"https://hooks.example.com/notify", status:"failing", events:"delivered"}
          ].map((w,i)=>(
            <div key={i} style={{border:"1px solid var(--rule)", borderRadius:8, padding:10, marginBottom:8}}>
              <div className="row" style={{justifyContent:"space-between"}}>
                <span className="mono-sm" style={{fontFamily:"IBM Plex Mono, monospace", fontSize:10, color:"var(--ink-2)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{w.url}</span>
                <Chip kind={w.status === "active" ? "cat" : "rating"}>{w.status}</Chip>
              </div>
              <div className="row gap-4 wrap" style={{marginTop:6}}>
                {w.events.split(" · ").map(e => <Chip key={e} kind="tag" ghost>{e}</Chip>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== ⑥ Mobile settings - Visibility presets ==============
function MobileSettingsVisibility() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>Visibility Presets</strong>
          <button className="btn sm primary" style={{padding:"2px 8px"}}>Save</button>
        </div>

        <div style={{display:"flex", borderBottom:"1px solid var(--rule)", overflowX:"auto", fontSize:11}}>
          {["General","API","Visibility","Storage","Users"].map((t,i)=>(
            <div key={t} style={{
              padding:"8px 12px", flexShrink:0, cursor:"pointer", whiteSpace:"nowrap",
              borderBottom: i===2?"2px solid var(--accent)":"2px solid transparent",
              color: i===2?"var(--ink)":"var(--mute)",
              fontWeight: i===2?600:400
            }}>{t}</div>
          ))}
        </div>

        <div style={{flex:1, overflow:"auto", padding:"12px 14px"}}>
          <div className="mono-sm muted" style={{marginBottom:12, lineHeight:1.5}}>
            Defaults for new commissions. Per-commission panel can override.
          </div>

          <div className="label">Default preset</div>
          <div className="col gap-6" style={{marginBottom:18}}>
            {[
              {name:"Public by default",  desc:"Everything public, sensitive fields private", active:true},
              {name:"Private by default", desc:"Nothing public until explicitly released",     active:false},
              {name:"Custom",             desc:"Define field-by-field below",                  active:false},
            ].map(p => (
              <div key={p.name} style={{
                padding:"10px 12px", borderRadius:8, cursor:"pointer",
                border: p.active ? "2px solid var(--accent)" : "1px solid var(--rule)",
                background: p.active ? "rgba(47,106,85,0.05)" : "var(--paper)"
              }}>
                <div className="row gap-6">
                  <span style={{
                    width:14, height:14, borderRadius:"50%",
                    border: p.active ? "none" : "2px solid var(--rule-2)",
                    background: p.active ? "var(--accent)" : "transparent",
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    color:"white", fontSize:9, flexShrink:0
                  }}>{p.active && "✓"}</span>
                  <strong style={{fontSize:13}}>{p.name}</strong>
                </div>
                <div className="mono-sm" style={{color:"var(--ink-2)", paddingLeft:20, marginTop:2}}>{p.desc}</div>
              </div>
            ))}
          </div>

          <div className="label">Field defaults</div>
          <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden", marginBottom:14}}>
            {[
              {field:"Title",        public:true},
              {field:"Description",  public:true},
              {field:"Categories & Tags", public:true},
              {field:"Characters",   public:true},
              {field:"Artists",      public:true},
              {field:"Date",         public:true},
              {field:"Confirmed at", public:false, note:"private"},
              {field:"Price",        public:false, note:"private"},
            ].map((row, i, arr) => (
              <div key={row.field} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
                borderBottom: i < arr.length-1 ? "1px solid var(--rule)" : "none",
                fontSize:12
              }}>
                <span style={{flex:1}}>{row.field}</span>
                {row.note && <span className="mono-sm muted">{row.note}</span>}
                <MobileToggle on={row.public} />
              </div>
            ))}
          </div>

          <div className="label">Stage defaults</div>
          <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
            {[
              {stage:"Delivered", public:true},
              {stage:"Color",     public:false},
              {stage:"Lineart",   public:false},
              {stage:"Sketching", public:false},
            ].map((row, i, arr) => (
              <div key={row.stage} style={{
                display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
                borderBottom: i < arr.length-1 ? "1px solid var(--rule)" : "none",
                fontSize:12
              }}>
                <span style={{flex:1}}>{row.stage}</span>
                <MobileToggle on={row.public} />
              </div>
            ))}
          </div>

          <div style={{
            marginTop:14, padding:10, borderRadius:6,
            background:"rgba(47,106,85,0.06)", borderLeft:"3px solid var(--accent)",
            fontSize:11, color:"var(--ink-2)", lineHeight:1.5
          }}>
            <strong style={{color:"var(--ink)"}}>Precedence:</strong> global → per-commission → per-stage → per-file
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileToggle({on}) {
  const [state, setState] = React.useState(on);
  return (
    <div onClick={() => setState(!state)} style={{
      width:36, height:20, borderRadius:10, cursor:"pointer",
      background: state ? "var(--accent)" : "var(--rule-2)",
      position:"relative", flexShrink:0, transition:"background 0.15s"
    }}>
      <div style={{
        position:"absolute", top:2, left: state ? 18 : 2,
        width:16, height:16, borderRadius:"50%", background:"white",
        boxShadow:"0 1px 2px rgba(0,0,0,0.15)", transition:"left 0.15s"
      }} />
    </div>
  );
}

// ============== ⑦ Desktop Visibility (per-commission override) ==============
function DesktopVisibility() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Gallery", "Banzhi & Shouza", "Visibility"]}>
        <span className="mono-sm muted">override global defaults</span>
        <button className="btn sm">Cancel</button>
        <button className="btn sm primary">Save</button>
      </NotionTop>

      <div style={{flex:1, overflow:"auto", display:"grid", gridTemplateColumns:"1fr 1fr", gap:0}}>
        {/* LEFT: Commission-level + Metadata */}
        <div style={{padding:"24px 32px", borderRight:"1px solid var(--rule)"}}>
          <h2 style={{margin:"0 0 4px", fontSize:20}}>Visibility for this commission</h2>
          <div className="mono-sm muted" style={{marginBottom:18}}>
            Inherits global preset · <strong style={{color:"var(--ink)"}}>Public by default</strong>. Toggle to override.
          </div>

          {/* commission-level master */}
          <div style={{
            padding:"12px 14px", background:"var(--paper-2)", borderRadius:8,
            display:"flex", alignItems:"center", gap:12, marginBottom:22
          }}>
            <div style={{flex:1}}>
              <strong style={{fontSize:14}}>Commission public</strong>
              <div className="mono-sm muted" style={{marginTop:2}}>
                Turn off to hide entire commission from gallery
              </div>
            </div>
            <DesktopToggle on={true} large />
          </div>

          <strong style={{fontSize:14}}>Metadata fields</strong>
          <div className="mono-sm muted" style={{marginBottom:8, marginTop:2}}>What's visible in public detail page</div>
          <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
            {[
              {field:"Title & description", public:true,  overridden:false},
              {field:"Categories & Tags",   public:true,  overridden:false},
              {field:"Rating",              public:true,  overridden:false},
              {field:"Characters",          public:true,  overridden:false},
              {field:"Artists",             public:true,  overridden:false},
              {field:"Date completed",      public:true,  overridden:false},
              {field:"Confirmed at",        public:true,  overridden:true, note:"overrides global default (private)"},
              {field:"Price",               public:false, overridden:false, note:"global default"},
            ].map((row, i, arr) => (
              <div key={row.field} style={{
                display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
                borderBottom: i < arr.length-1 ? "1px solid var(--rule)" : "none",
                background: row.overridden ? "rgba(47,106,85,0.04)" : "var(--paper)"
              }}>
                <span style={{flex:1, fontSize:13}}>
                  {row.field}
                  {row.overridden && <span className="mono-sm" style={{color:"var(--accent)", marginLeft:6}}>· overridden</span>}
                </span>
                {row.note && <span className="mono-sm muted">{row.note}</span>}
                <DesktopToggle on={row.public} />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Stages + files */}
        <div style={{padding:"24px 32px"}}>
          <strong style={{fontSize:14}}>Lifecycle stages</strong>
          <div className="mono-sm muted" style={{marginBottom:8, marginTop:2}}>
            Stage toggle cascades to all files in stage · file-level override wins
          </div>
          <div className="col gap-8">
            {[
              {stage:"Delivered", public:true,  files:[
                {name:"final_with_bg.png", public:true},
                {name:"final_clean.png",   public:true},
              ]},
              {stage:"Color", public:true, files:[
                {name:"color_flat.png",   public:true},
                {name:"color_render.psd", public:false, override:true, note:"overridden private"},
              ]},
              {stage:"Lineart", public:false, files:[
                {name:"lineart.psd", public:false},
              ]},
              {stage:"Sketching", public:false, files:[
                {name:"rough.png",     public:true, override:true, note:"overridden public"},
                {name:"rough_alt.png", public:false},
              ]},
            ].map(s => (
              <div key={s.stage} style={{border:"1px solid var(--rule)", borderRadius:8}}>
                <div style={{
                  display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
                  background:"var(--paper-2)", borderBottom:"1px solid var(--rule)"
                }}>
                  <strong style={{flex:1, fontSize:13}}>{s.stage}</strong>
                  <span className="mono-sm muted">{s.files.length} files</span>
                  <DesktopToggle on={s.public} />
                </div>
                <div>
                  {s.files.map((f, i) => (
                    <div key={f.name} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"7px 14px",
                      borderTop: i > 0 ? "1px solid var(--rule)" : "none",
                      background: f.override ? "rgba(47,106,85,0.04)" : "transparent"
                    }}>
                      <div style={{width:28, height:28, borderRadius:3, background:"var(--paper-2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                        <ImgPh ar={[3,4]} />
                      </div>
                      <span style={{flex:1, fontSize:12, fontFamily:"IBM Plex Mono, monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.name}</span>
                      {f.note && <span className="mono-sm" style={{color:"var(--accent)"}}>{f.note}</span>}
                      <DesktopToggle on={f.public} sm />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop:14, padding:"10px 12px", borderRadius:6,
            background:"rgba(47,106,85,0.06)", borderLeft:"3px solid var(--accent)",
            fontSize:12, color:"var(--ink-2)", lineHeight:1.6
          }}>
            <strong style={{color:"var(--ink)"}}>Precedence:</strong> Global preset (Settings ⑥) → this commission → stage → file (highest wins)
          </div>
        </div>
      </div>
      <Note style={{top:60, right:32}}>per-commission override · highlighted rows differ from global</Note>
    </div>
  );
}

function DesktopToggle({on, large=false, sm=false}) {
  const [state, setState] = React.useState(on);
  const w = large ? 48 : sm ? 32 : 40;
  const h = large ? 26 : sm ? 18 : 22;
  const knob = large ? 20 : sm ? 14 : 16;
  return (
    <div onClick={() => setState(!state)} style={{
      width:w, height:h, borderRadius:h/2, cursor:"pointer",
      background: state ? "var(--accent)" : "var(--rule-2)",
      position:"relative", flexShrink:0, transition:"background 0.15s"
    }}>
      <div style={{
        position:"absolute", top:3, left: state ? w - knob - 3 : 3,
        width:knob, height:knob, borderRadius:"50%", background:"white",
        boxShadow:"0 1px 2px rgba(0,0,0,0.15)", transition:"left 0.15s"
      }} />
    </div>
  );
}

// ============== ⑧ Mobile lifecycle ==============
// Uses shared LifecycleStagesList — same component as embedded in detail page (desktop)
function MobileLifecycle() {
  const [showAll, setShowAll] = React.useState(true);

  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1}}>Lifecycle</strong>
          <span className="iconbtn">⋯</span>
        </div>

        {/* segmented toggle */}
        <div style={{padding:"10px 14px 6px"}}>
          <div className="row gap-4" style={{
            background:"var(--paper-2)", borderRadius:6, padding:"3px 4px",
            border:"1px solid var(--rule)"
          }}>
            <button onClick={()=>setShowAll(false)} style={{
              flex:1, padding:"5px 8px", borderRadius:4, border:"none", cursor:"pointer", fontSize:12,
              background: !showAll ? "var(--paper)" : "transparent",
              boxShadow: !showAll ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              fontWeight: !showAll ? 600 : 400,
              color: !showAll ? "var(--ink)" : "var(--mute)"
            }}>Delivered only</button>
            <button onClick={()=>setShowAll(true)} style={{
              flex:1, padding:"5px 8px", borderRadius:4, border:"none", cursor:"pointer", fontSize:12,
              background: showAll ? "var(--paper)" : "transparent",
              boxShadow: showAll ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              fontWeight: showAll ? 600 : 400,
              color: showAll ? "var(--ink)" : "var(--mute)"
            }}>Show all</button>
          </div>
        </div>

        <div style={{flex:1, overflow:"auto", padding:"6px 14px 14px"}}>
          <div className="mono-sm muted" style={{marginBottom:10, lineHeight:1.5}}>
            Long-press a file to move it to another stage.
          </div>
          <LifecycleStagesList showAll={showAll} onShowAllChange={setShowAll} dragEnabled compact editable />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  MobileAuth, MobileFilter, MobileSettingsAPI, MobileSettingsVisibility,
  DesktopVisibility, MobileLifecycle
});
