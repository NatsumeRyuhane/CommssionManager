// Home / Gallery + Filter & Search panel variants

function HomeGallery() {
  const [filterOpen, setFilterOpen] = React.useState(false);
  return (
    <div className="wf">
      {/* Minimal top bar — single-owner, gallery-first */}
      <div style={{
        padding:"14px 28px", display:"flex", alignItems:"center", gap: 14,
        borderBottom: "1px solid var(--rule)", background:"var(--paper)"
      }}>
        <h1 style={{margin:0, fontSize: 22, fontWeight: 700, letterSpacing:"-0.01em"}}>
          Heiyao&rsquo;s commissions
        </h1>
        <span className="mono-sm muted">{COMMISSIONS.length} works</span>
        <span style={{flex:1}} />
        <HoverFilter expanded={filterOpen} setExpanded={setFilterOpen} />
        <button className="btn sm">Sort: date ↓</button>
        <span style={{width:1, height:20, background:"var(--rule)"}} />
        <button className="btn sm">↗ Export</button>
        <button className="btn sm primary">+ New</button>
        <span className="mono-sm muted" style={{marginLeft:4}}>🔓 admin</span>
      </div>

      <div style={{flex:1, overflow:"auto"}}>
        <FaGallery items={COMMISSIONS} columns={4} />
      </div>

      <Note style={{top: 70, right: 320}}>filter is a click-to-expand hover menu</Note>
    </div>
  );
}

// Click-to-expand filter menu — replaces full sidebar chrome
function HoverFilter({ expanded, setExpanded }) {
  return (
    <div style={{position:"relative"}}>
      <button className="btn sm" onClick={() => setExpanded(!expanded)} style={{
        background: expanded ? "var(--paper-2)" : "var(--paper)"
      }}>
        🔍 Search & filter
        <span className="mono-sm muted" style={{marginLeft:6}}>4 active</span>
        <span style={{marginLeft:4}}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div style={{
          position:"absolute", top: "calc(100% + 8px)", right: 0,
          width: 520, zIndex: 50,
          background:"var(--paper)", border:"1px solid var(--rule-2)",
          borderRadius: 10, boxShadow: "var(--shadow-2)",
          padding: 16
        }}>
          {/* tiny arrow */}
          <div style={{
            position:"absolute", top: -6, right: 60,
            width: 12, height: 12, background:"var(--paper)",
            border:"1px solid var(--rule-2)", borderRight:"none", borderBottom:"none",
            transform:"rotate(45deg)"
          }} />

          <div className="row gap-8" style={{marginBottom:10}}>
            <div className="row" style={{
              flex: 1, border:"1px solid var(--rule-2)", borderRadius: 6, padding:"4px 10px"
            }}>
              <span style={{color:"var(--mute)"}}>🔍</span>
              <input className="field" style={{border:"none", padding:"2px 4px"}}
                     placeholder="Search title, description…" defaultValue="Banzhi" />
            </div>
            <div className="row gap-4">
              <Chip ghost>title ✓</Chip>
              <Chip ghost>desc ✓</Chip>
              <Chip ghost>fuzzy ✓</Chip>
            </div>
          </div>

          <div className="row wrap gap-4" style={{marginBottom:10}}>
            <Chip kind="cat">Chibi <span className="x">✕</span></Chip>
            <Chip kind="cat">Avatar <span className="x">✕</span></Chip>
            <Chip kind="rating">General <span className="x">✕</span></Chip>
            <Chip kind="char">Heiyao <span className="x">✕</span></Chip>
            <span className="mono-sm muted">· 4 active</span>
          </div>

          <div style={{
            display:"grid", gridTemplateColumns:"1fr 1fr", gap: 14,
            background: "var(--paper-2)", padding: 12, borderRadius: 6
          }}>
            <FilterCol title="Categories" tone="cat"
                       items={["Chibi","Avatar","Monochrome","Reference","Weapon"]}
                       active={["Chibi","Avatar"]} />
            <FilterCol title="Tags" tone="tag"
                       items={["background","co-commission","差分","watermark"]} />
            <FilterCol title="Rating" tone="rating"
                       items={["General","Mature","Adult"]} active={["General"]} radio />
            <div className="col gap-4">
              <div className="row" style={{justifyContent:"space-between"}}>
                <div className="label" style={{margin:0}}>Time / count / format</div>
              </div>
              <div className="row gap-4">
                <input className="field" placeholder="2024-01" />
                <span className="muted">→</span>
                <input className="field" placeholder="now" />
              </div>
              <div className="row gap-4 wrap" style={{marginTop:4}}>
                <Chip ghost>png ✓</Chip>
                <Chip ghost>psd ✓</Chip>
                <Chip ghost>jpg</Chip>
              </div>
            </div>
          </div>

          <div className="row" style={{marginTop:12, justifyContent:"space-between"}}>
            <button className="btn sm ghost">Reset all</button>
            <div className="row gap-4">
              <span className="mono-sm">28 results</span>
              <button className="btn sm primary">Apply</button>
              <span className="mono-sm muted">⏎</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact / batch select state
function HomeBatchSelect() {
  return (
    <div className="wf">
      <div style={{
        background: "var(--ink)", color: "var(--paper)",
        padding: "8px 16px", display: "flex", alignItems:"center", gap: 12, fontSize: 13
      }}>
        <span className="iconbtn" style={{color:"var(--paper)"}}>✕</span>
        <strong>3 selected</strong>
        <span style={{flex:1}} />
        <button className="btn sm" style={{background:"transparent", color:"var(--paper)", borderColor:"rgba(255,255,255,0.3)"}}>
          + add labels
        </button>
        <button className="btn sm" style={{background:"transparent", color:"var(--paper)", borderColor:"rgba(255,255,255,0.3)"}}>
          ⤓ export zip
        </button>
        <button className="btn sm" style={{background:"transparent", color:"var(--paper)", borderColor:"rgba(255,255,255,0.3)"}}>
          → move stage
        </button>
        <button className="btn sm danger" style={{background:"transparent", borderColor:"rgba(255,255,255,0.3)"}}>
          🗑 delete
        </button>
      </div>
      <NotionTop crumbs={["Gallery"]} />
      <div style={{flex:1, overflow:"auto", position:"relative"}}>
        <div style={{padding:"12px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12}}>
          {COMMISSIONS.slice(0,16).map((it, i) => {
            const sel = [1,4,7].includes(i);
            return (
              <div key={it.id} className="fa-tile" style={sel? {outline:"2px solid var(--accent)", outlineOffset:2}: {}}>
                <ImgPh ar={it.ar} />
                <div style={{position:"absolute", top:6, left:6}}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: "2px solid white", background: sel?"var(--accent)":"rgba(0,0,0,0.3)",
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    color:"white", fontSize: 11
                  }}>{sel && "✓"}</span>
                </div>
                <div style={{
                  position:"absolute", left:0, right:0, bottom:0, padding:"14px 8px 6px",
                  background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                  color: "white", fontSize: 12
                }}>
                  <div style={{fontWeight:500}}>{it.title}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Note style={{top: 8, right: 24, color:"var(--paper)"}}>batch toolbar slides in from top</Note>
    </div>
  );
}

// Standalone "Filter & search panel" deep-dive
function FilterPanelDeepDive() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Gallery", "Filter"]}>
        <button className="btn sm">Reset</button>
        <button className="btn sm primary">Apply (28)</button>
      </NotionTop>
      <div style={{flex:1, overflow:"auto", padding: "20px 24px"}}>
        <div className="row gap-8" style={{marginBottom:14}}>
          <div className="row" style={{
            flex: 1, border: "1px solid var(--rule-2)", borderRadius: 6, padding: "8px 12px"
          }}>
            <span style={{color:"var(--mute)"}}>🔍</span>
            <input className="field" style={{border:"none"}}
                   placeholder="Banzhi" defaultValue="Banzhi" />
          </div>
          <div className="row gap-4">
            <Chip ghost>title ✓</Chip>
            <Chip ghost>description ✓</Chip>
            <Chip ghost>image content (CLIP)</Chip>
          </div>
          <div className="row gap-4">
            <Chip ghost>fuzzy ✓</Chip>
            <Chip ghost>exact</Chip>
          </div>
        </div>

        <div style={{
          display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap: 16,
          background: "var(--paper-2)", padding: 16, borderRadius: 8
        }}>
          <FilterSection title="Categories" tone="cat" items={["Chibi","Avatar","Monochrome","Reference","Weapon","Other"]} active={["Chibi","Avatar"]} />
          <FilterSection title="Tags" tone="tag" items={["background","co-commission","差分","watermark","expression-sheet","headshot"]} active={["差分"]} />
          <FilterSection title="Rating" tone="rating" items={["General","Mature","Adult"]} active={["General"]} radio />

          <div className="col gap-8">
            <div className="label">Time range</div>
            <div className="row gap-4">
              <input className="field" defaultValue="2024-01-01" />
              <span className="muted">→</span>
              <input className="field" defaultValue="2025-12-31" />
            </div>
            <div style={{
              height: 48, marginTop: 4,
              background: "var(--paper)", border:"1px solid var(--rule)", borderRadius: 4,
              padding: 6, position:"relative"
            }}>
              <svg width="100%" height="100%" viewBox="0 0 200 36" preserveAspectRatio="none">
                {Array.from({length: 24}).map((_, i) => {
                  const h = 6 + (Math.sin(i*1.3)+1)*10;
                  return <rect key={i} x={i*8} y={36-h} width="6" height={h} fill="#c8d6cf" />;
                })}
              </svg>
              <div style={{
                position:"absolute", top: 0, bottom: 0, left: "10%", right:"15%",
                background: "rgba(47,106,85,0.18)", borderLeft: "2px solid var(--accent)",
                borderRight: "2px solid var(--accent)"
              }} />
            </div>
          </div>

          <div className="col gap-8">
            <div className="label">Character count</div>
            <div className="row gap-4">
              <input className="field" defaultValue="1" style={{width:60}} />
              <span className="muted">to</span>
              <input className="field" defaultValue="3" style={{width:60}} />
            </div>
            <div className="label" style={{marginTop:8}}>Character species</div>
            <input className="field" placeholder="search species…" />
            <div className="row wrap gap-4">
              <Chip kind="char">✓ kitsune</Chip>
              <Chip kind="char" ghost>cervid</Chip>
              <Chip kind="char" ghost>avian</Chip>
              <Chip kind="char" ghost>dragon</Chip>
            </div>
          </div>

          <div className="col gap-8">
            <div className="label">Character / Artist names</div>
            <input className="field" placeholder="search names…" />
            <div className="row wrap gap-4">
              <Chip kind="char">✓ Heiyao</Chip>
              <Chip kind="char" ghost>Banzhi</Chip>
              <Chip kind="artist">✓ Natsume Ryuhane</Chip>
              <Chip kind="artist" ghost>@yuzuki_art</Chip>
            </div>

            <div className="label" style={{marginTop:8}}>File format</div>
            <div className="row wrap gap-4">
              <Chip ghost>✓ png</Chip>
              <Chip ghost>jpg</Chip>
              <Chip ghost>✓ psd</Chip>
              <Chip ghost>sai2</Chip>
            </div>
          </div>
        </div>

        <div style={{marginTop: 18}}>
          <div className="row" style={{justifyContent:"space-between"}}>
            <div className="label" style={{margin:0, fontSize: 13}}>Sort</div>
            <span className="mono-sm">applied last</span>
          </div>
          <div className="row gap-8" style={{marginTop:6}}>
            <div className="row gap-4">
              <Chip ghost>by date ✓</Chip>
              <Chip ghost>by title (pinyin)</Chip>
            </div>
            <span className="muted">·</span>
            <div className="row gap-4">
              <Chip ghost>↑ asc</Chip>
              <Chip ghost>↓ desc ✓</Chip>
            </div>
          </div>
        </div>
      </div>
      <Note style={{top: 60, right: 32}}>3-section grid · search type chips · time histogram</Note>
    </div>
  );
}

function FilterSection({ title, tone, items, active=[], radio=false }) {
  return (
    <div className="col gap-4">
      <div className="row" style={{justifyContent:"space-between"}}>
        <strong style={{fontSize: 13}}>{title}</strong>
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

Object.assign(window, { HomeGallery, HomeGalleryFilterOpen, HomeBatchSelect, FilterPanelDeepDive });

function HomeGalleryFilterOpen() {
  // same as HomeGallery but with the menu pre-opened so reviewers see it
  return (
    <div style={{position:"relative", width:"100%", height:"100%"}}>
      <_HomeGalleryWith open />
    </div>
  );
}

function _HomeGalleryWith({open}) {
  const [filterOpen, setFilterOpen] = React.useState(open);
  return (
    <div className="wf">
      <div style={{
        padding:"14px 28px", display:"flex", alignItems:"center", gap: 14,
        borderBottom: "1px solid var(--rule)", background:"var(--paper)"
      }}>
        <h1 style={{margin:0, fontSize:22, fontWeight:700, letterSpacing:"-0.01em"}}>Heiyao&rsquo;s commissions</h1>
        <span className="mono-sm muted">{COMMISSIONS.length} works</span>
        <span style={{flex:1}} />
        <HoverFilter expanded={filterOpen} setExpanded={setFilterOpen} />
        <button className="btn sm">Sort: date ↓</button>
        <span style={{width:1, height:20, background:"var(--rule)"}} />
        <button className="btn sm">↗ Export</button>
        <button className="btn sm primary">+ New</button>
        <span className="mono-sm muted" style={{marginLeft:4}}>🔓 admin</span>
      </div>
      <div style={{flex:1, overflow:"auto"}}>
        <FaGallery items={COMMISSIONS} columns={4} />
      </div>
    </div>
  );
}
