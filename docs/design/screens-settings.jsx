// Global admin settings — API management + visibility presets

// ============== Settings: API & Integrations ==============
function SettingsAPI() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Settings", "API & Integrations"]}>
        <span className="mono-sm muted">admin only</span>
      </NotionTop>
      <div style={{flex:1, overflow:"auto", display:"grid", gridTemplateColumns:"200px 1fr", height:"100%"}}>
        {/* settings sidebar nav */}
        <div style={{borderRight:"1px solid var(--rule)", padding:"20px 12px", background:"var(--paper-2)"}}>
          <div className="col gap-4">
            {[
              {label:"General",           active:false},
              {label:"API & Integrations",active:true},
              {label:"Visibility Presets",active:false},
              {label:"Storage",           active:false},
              {label:"Users / Access",    active:false},
            ].map(item => (
              <div key={item.label} style={{
                padding:"7px 10px", borderRadius:6, fontSize:13, cursor:"pointer",
                background: item.active ? "var(--paper)" : "transparent",
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "var(--ink)" : "var(--ink-2)",
                boxShadow: item.active ? "0 1px 3px rgba(0,0,0,0.07)" : "none"
              }}>{item.label}</div>
            ))}
          </div>
        </div>

        {/* main content */}
        <div style={{padding:"28px 36px", overflow:"auto"}}>
          <h2 style={{margin:"0 0 4px", fontSize:22}}>API &amp; Integrations</h2>
          <div className="mono-sm muted" style={{marginBottom:28}}>
            Keys grant machine access to commission data. Never share keys — they are excluded from all copy-JSON outputs.
          </div>

          {/* API Keys table */}
          <div style={{marginBottom:32}}>
            <div className="row" style={{justifyContent:"space-between", marginBottom:10}}>
              <strong style={{fontSize:15}}>API Keys</strong>
              <button className="btn sm primary">+ Generate key</button>
            </div>
            <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead>
                  <tr style={{background:"var(--paper-2)", borderBottom:"1px solid var(--rule)"}}>
                    {["Name","Key (masked)","Scopes","Created","Last used",""].map(h => (
                      <th key={h} style={{padding:"8px 12px", textAlign:"left", fontWeight:600, fontSize:11, color:"var(--ink-2)", fontFamily:"IBM Plex Mono, monospace"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {name:"n8n automation", key:"cmgr_••••••••••••3f9a", scopes:"read · write", created:"2025-03-10", last:"2 hours ago", active:true},
                    {name:"gallery widget", key:"cmgr_••••••••••••b2c1", scopes:"read-only",    created:"2025-01-22", last:"4 days ago",  active:true},
                    {name:"old backup bot", key:"cmgr_••••••••••••11ee", scopes:"read-only",    created:"2024-11-05", last:"90 days ago", active:false},
                  ].map((k, i) => (
                    <tr key={i} style={{borderBottom:"1px solid var(--rule)", opacity: k.active ? 1 : 0.55}}>
                      <td style={{padding:"9px 12px", fontWeight:500}}>{k.name}</td>
                      <td style={{padding:"9px 12px", fontFamily:"IBM Plex Mono, monospace", fontSize:12}}>{k.key}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div className="row gap-4">
                          {k.scopes.split(" · ").map(s => <Chip key={s} kind="tag">{s}</Chip>)}
                        </div>
                      </td>
                      <td style={{padding:"9px 12px"}} className="mono-sm">{k.created}</td>
                      <td style={{padding:"9px 12px"}} className="mono-sm">{k.last}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div className="row gap-4">
                          {!k.active && <Chip kind="rating">revoked</Chip>}
                          <button className="btn sm">⋯</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mono-sm muted" style={{marginTop:8}}>
              Keys are shown once on creation. Rotate keys immediately if compromised. Revoked keys cannot be re-activated.
            </div>
          </div>

          {/* Webhooks */}
          <div style={{marginBottom:32}}>
            <div className="row" style={{justifyContent:"space-between", marginBottom:10}}>
              <strong style={{fontSize:15}}>Webhooks</strong>
              <button className="btn sm primary">+ Add endpoint</button>
            </div>
            <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead>
                  <tr style={{background:"var(--paper-2)", borderBottom:"1px solid var(--rule)"}}>
                    {["Endpoint URL","Events","Status","Last delivery",""].map(h => (
                      <th key={h} style={{padding:"8px 12px", textAlign:"left", fontWeight:600, fontSize:11, color:"var(--ink-2)", fontFamily:"IBM Plex Mono, monospace"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {url:"https://n8n.home/webhook/cmgr", events:"commission.created · commission.updated", status:"active", last:"200 OK · 2h ago"},
                    {url:"https://hooks.example.com/notify", events:"commission.delivered", status:"failing", last:"502 · 10 min ago"},
                  ].map((w, i) => (
                    <tr key={i} style={{borderBottom:"1px solid var(--rule)"}}>
                      <td style={{padding:"9px 12px", fontFamily:"IBM Plex Mono, monospace", fontSize:11, maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{w.url}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div className="row gap-4 wrap">
                          {w.events.split(" · ").map(e => <Chip key={e} kind="tag" ghost>{e}</Chip>)}
                        </div>
                      </td>
                      <td style={{padding:"9px 12px"}}>
                        <Chip kind={w.status === "active" ? "cat" : "rating"}>{w.status}</Chip>
                      </td>
                      <td style={{padding:"9px 12px"}} className="mono-sm">{w.last}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div className="row gap-4">
                          <button className="btn sm">test</button>
                          <button className="btn sm">⋯</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* API shape note */}
          <div style={{
            padding:"14px 16px", background:"var(--paper-2)",
            border:"1px solid var(--rule)", borderRadius:8, fontSize:13
          }}>
            <div className="row gap-8" style={{marginBottom:8}}>
              <strong>{"{}"} Copy-API JSON shape</strong>
              <span className="mono-sm muted">what agents receive from the detail / edit page button</span>
            </div>
            <pre style={{
              margin:0, fontFamily:"IBM Plex Mono, monospace", fontSize:11,
              color:"var(--ink-2)", lineHeight:1.6, whiteSpace:"pre-wrap"
            }}>{`{
  "id": 42,
  "title": "Banzhi & Shouza — chibi pair",
  "date": "2024-09-12",
  "confirmed_at": "2024-08-21",
  "category": "Chibi",
  "rating": "General",
  "tags": ["background", "co-commission", "差分"],
  "characters": ["Heiyao", "Banzhi"],
  "artists": ["Natsume Ryuhane", "@yuzuki_art"],
  "current_stage": "Delivered",
  "files_endpoint": "/api/v1/commissions/42/files",
  "public_images_endpoint": "/api/v1/commissions/42/images?visibility=public"
  // ↑ no API credentials — agent must supply its own key in request header
}`}</pre>
          </div>
        </div>
      </div>
      <Note style={{top:60, right:32}}>admin only · keys never appear in copy-JSON output</Note>
    </div>
  );
}

// ============== Settings: Visibility Presets ==============
function SettingsVisibility() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Settings", "Visibility Presets"]}>
        <span className="mono-sm muted">admin only</span>
        <button className="btn sm primary">Save presets</button>
      </NotionTop>
      <div style={{flex:1, overflow:"auto", display:"grid", gridTemplateColumns:"200px 1fr", height:"100%"}}>
        {/* sidebar */}
        <div style={{borderRight:"1px solid var(--rule)", padding:"20px 12px", background:"var(--paper-2)"}}>
          <div className="col gap-4">
            {[
              {label:"General",           active:false},
              {label:"API & Integrations",active:false},
              {label:"Visibility Presets",active:true},
              {label:"Storage",           active:false},
              {label:"Users / Access",    active:false},
            ].map(item => (
              <div key={item.label} style={{
                padding:"7px 10px", borderRadius:6, fontSize:13, cursor:"pointer",
                background: item.active ? "var(--paper)" : "transparent",
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "var(--ink)" : "var(--ink-2)",
                boxShadow: item.active ? "0 1px 3px rgba(0,0,0,0.07)" : "none"
              }}>{item.label}</div>
            ))}
          </div>
        </div>

        {/* main */}
        <div style={{padding:"28px 36px", overflow:"auto"}}>
          <h2 style={{margin:"0 0 4px", fontSize:22}}>Visibility Presets</h2>
          <div className="mono-sm muted" style={{marginBottom:24}}>
            Global defaults applied to every new commission. Per-commission overrides take precedence.
          </div>

          {/* Active preset picker */}
          <div style={{marginBottom:28}}>
            <div className="label">Default preset for new commissions</div>
            <div className="row gap-8" style={{marginTop:8}}>
              {[
                {name:"Public by default",  desc:"Everything public, sensitive fields private", active:true},
                {name:"Private by default", desc:"Nothing public until explicitly released",     active:false},
                {name:"Custom",             desc:"Define field-by-field below",                  active:false},
              ].map(p => (
                <div key={p.name} style={{
                  flex:1, padding:"12px 14px", borderRadius:8, cursor:"pointer",
                  border: p.active ? "2px solid var(--accent)" : "1px solid var(--rule)",
                  background: p.active ? "rgba(47,106,85,0.05)" : "var(--paper-2)"
                }}>
                  <div className="row gap-6" style={{marginBottom:4}}>
                    <span style={{
                      width:16, height:16, borderRadius:"50%",
                      border: p.active ? "none" : "2px solid var(--rule-2)",
                      background: p.active ? "var(--accent)" : "transparent",
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      color:"white", fontSize:10, flexShrink:0
                    }}>{p.active && "✓"}</span>
                    <strong style={{fontSize:13}}>{p.name}</strong>
                  </div>
                  <div className="mono-sm" style={{color:"var(--ink-2)", paddingLeft:22}}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Field-level defaults */}
          <div style={{marginBottom:24}}>
            <strong style={{fontSize:15}}>Field visibility defaults</strong>
            <div className="mono-sm muted" style={{marginBottom:10, marginTop:2}}>Per-commission panel can override any of these</div>
            <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
              {[
                {field:"Title",        public:true,  note:""},
                {field:"Description",  public:true,  note:""},
                {field:"Category / Tags", public:true, note:""},
                {field:"Characters",   public:true,  note:""},
                {field:"Artists",      public:true,  note:""},
                {field:"Date",         public:true,  note:""},
                {field:"Confirmed at", public:false, note:"typically private"},
                {field:"Price",        public:false, note:"typically private"},
              ].map((row, i) => (
                <div key={row.field} style={{
                  display:"flex", alignItems:"center", gap:12, padding:"9px 14px",
                  borderBottom: i < 7 ? "1px solid var(--rule)" : "none",
                  background: i%2===0 ? "var(--paper)" : "var(--paper-2)"
                }}>
                  <span style={{flex:1, fontSize:13}}>{row.field}</span>
                  {row.note && <span className="mono-sm muted">{row.note}</span>}
                  <ToggleSwitch on={row.public} />
                </div>
              ))}
            </div>
          </div>

          {/* Stage visibility defaults */}
          <div style={{marginBottom:24}}>
            <strong style={{fontSize:15}}>Stage visibility defaults</strong>
            <div className="mono-sm muted" style={{marginBottom:10, marginTop:2}}>
              Applied to stages when created. Lifecycle view toggle (Delivered only / Show all) is a per-viewer preference, not a privacy control.
            </div>
            <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
              {[
                {stage:"Delivered", public:true,  note:"final deliverables — public by default"},
                {stage:"Color",     public:false, note:"WIP — private by default"},
                {stage:"Lineart",   public:false, note:"WIP — private by default"},
                {stage:"Sketching", public:false, note:"WIP — private by default"},
                {stage:"(any new stage)", public:false, note:"inherit this default"},
              ].map((row, i, arr) => (
                <div key={row.stage} style={{
                  display:"flex", alignItems:"center", gap:12, padding:"9px 14px",
                  borderBottom: i < arr.length-1 ? "1px solid var(--rule)" : "none",
                  background: i%2===0 ? "var(--paper)" : "var(--paper-2)"
                }}>
                  <span style={{flex:1, fontSize:13, fontStyle: row.stage.startsWith("(") ? "italic" : "normal"}}>{row.stage}</span>
                  <span className="mono-sm muted">{row.note}</span>
                  <ToggleSwitch on={row.public} />
                </div>
              ))}
            </div>
          </div>

          <div style={{
            padding:"12px 14px", background:"rgba(47,106,85,0.06)",
            border:"1px solid rgba(47,106,85,0.2)", borderRadius:8, fontSize:13, color:"var(--ink-2)"
          }}>
            <strong style={{color:"var(--ink)"}}>Override precedence:</strong>{" "}
            Global preset → per-commission panel override → per-stage toggle → per-file toggle (highest wins)
          </div>
        </div>
      </div>
      <Note style={{top:60, right:32}}>global defaults · per-commission panel overrides any field</Note>
    </div>
  );
}

function ToggleSwitch({on}) {
  const [state, setState] = React.useState(on);
  return (
    <div onClick={() => setState(!state)} style={{
      width:40, height:22, borderRadius:11, cursor:"pointer",
      background: state ? "var(--accent)" : "var(--rule-2)",
      position:"relative", transition:"background 0.15s", flexShrink:0
    }}>
      <div style={{
        position:"absolute", top:3, left: state ? 21 : 3,
        width:16, height:16, borderRadius:"50%",
        background:"white", boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
        transition:"left 0.15s"
      }} />
    </div>
  );
}

Object.assign(window, { SettingsAPI, SettingsVisibility });
