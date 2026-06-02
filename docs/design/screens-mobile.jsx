// Mobile responsive variants - gallery + detail + edit in a phone frame

function MobileGallery() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner">
        <div style={{padding:"8px 14px", display:"flex", alignItems:"center", gap: 8, borderBottom:"1px solid var(--rule)"}}>
          <strong style={{fontSize: 15}}>Heiyao</strong>
          <span className="mono-sm muted">28</span>
          <span style={{flex:1}} />
          <span className="iconbtn">🔍</span>
          <span className="iconbtn">⊕</span>
        </div>
        <div style={{padding:"8px 12px", borderBottom:"1px solid var(--rule)", overflowX:"auto", whiteSpace:"nowrap"}}>
          <div className="row gap-4" style={{display:"inline-flex"}}>
            <Chip kind="cat">✓ Chibi</Chip>
            <Chip kind="rating">General</Chip>
            <Chip kind="tag" ghost>差分</Chip>
            <Chip ghost>+ filter</Chip>
          </div>
        </div>
        <div style={{flex:1, overflow:"auto", padding:8}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 6}}>
            {[0,1].map(col => (
              <div key={col} className="col" style={{gap:6}}>
                {COMMISSIONS.slice(col*6, col*6+6).map(it => (
                  <div key={it.id} className="fa-tile">
                    <ImgPh ar={it.ar} />
                    <div style={{position:"absolute", top:4, left:4}}>
                      <Chip kind="cat">{it.cat}</Chip>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileDetail() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        {/* sticky top */}
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap: 8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <span className="mono-sm muted">1/4</span>
          <span style={{flex:1}} />
          <span style={{color:"var(--accent)", fontSize:11}}>🌐 public</span>
          <span className="iconbtn">⋯</span>
        </div>
        <div style={{flex:1, overflow:"auto"}}>
          {/* hero */}
          <div style={{padding:"10px 12px"}}>
            <ImgPh ar={[3,4]} />
            <div className="row gap-4" style={{marginTop:8, overflowX:"auto"}}>
              {[[3,4],[3,4],[1,1],[3,4]].map((ar,i)=>(
                <div key={i} style={{width:48, flexShrink:0, outline:i===0?"2px solid var(--accent)":"none", outlineOffset:1, borderRadius:3}}>
                  <ImgPh ar={ar} />
                </div>
              ))}
            </div>
          </div>
          {/* meta */}
          <div style={{padding:"4px 14px 14px"}}>
            <div className="row gap-4 wrap" style={{marginBottom:6}}>
              <Chip kind="cat">Chibi</Chip>
              <Chip kind="rating">General</Chip>
              <Chip kind="tag">co-commission</Chip>
              <Chip kind="tag">差分</Chip>
            </div>
            <h2 style={{margin:"4px 0 2px", fontSize:18, lineHeight:1.25}}>Banzhi & Shouza — chibi pair</h2>
            <div className="mono-sm muted">2024-09-12 · 3000×4000</div>
            <p style={{fontSize:13, color:"var(--ink-2)", lineHeight:1.6, marginTop:10, marginBottom:0}}>
              Co-commission chibi piece. Includes background and clean variant.
            </p>
            <div className="row gap-4 wrap" style={{marginTop:10}}>
              <Chip kind="char">Heiyao</Chip>
              <Chip kind="char">Banzhi</Chip>
              <Chip kind="artist">Natsume Ryuhane</Chip>
            </div>
          </div>

          {/* lifecycle — button to dedicated page (component used both inline-desktop & standalone-mobile) */}
          <div style={{borderTop:"1px solid var(--rule)", padding:"12px 14px"}}>
            <button className="btn" style={{
              width:"100%", justifyContent:"space-between", padding:"12px 14px",
              background:"var(--paper-2)", border:"1px solid var(--rule)"
            }}>
              <div className="row gap-8">
                <span style={{fontSize:18}}>📈</span>
                <div style={{textAlign:"left"}}>
                  <div style={{fontWeight:600, fontSize:13}}>View lifecycle</div>
                  <div className="mono-sm muted">4 stages · 7 files · current: Delivered</div>
                </div>
              </div>
              <span style={{color:"var(--mute)"}}>›</span>
            </button>
            <div className="mono-sm muted" style={{marginTop:8, textAlign:"center"}}>
              Quick peek: Delivered ✓ · Color ✓ · Lineart 🔒 · Sketching 🔒
            </div>
          </div>
        </div>
        {/* bottom action bar */}
        <div style={{
          borderTop:"1px solid var(--rule)", padding:"8px 12px",
          display:"flex", gap:6
        }}>
          <button className="btn sm" style={{flex:1, justifyContent:"center"}}>👁 visibility</button>
          <button className="btn sm" style={{flex:1, justifyContent:"center"}}>↗ export</button>
          <button className="btn sm primary" style={{flex:1, justifyContent:"center"}}>✎ edit</button>
        </div>
      </div>
    </div>
  );
}

function MobileLifeRow({ title, sub, count, expanded=false, detached=false, current=false }) {
  return (
    <div style={{
      marginBottom: 8, borderRadius: 6,
      background: detached ? "rgba(182,85,42,0.06)" : "var(--paper)",
      border: detached ? "1.5px dashed var(--warn)" : "1px solid var(--rule)",
      padding: 8
    }}>
      <div className="row" style={{justifyContent:"space-between"}}>
        <div className="row gap-4">
          <strong style={{fontSize:12, color: detached?"var(--warn)":"var(--ink)"}}>{title}</strong>
          {current && <Chip kind="cat">current</Chip>}
        </div>
        <span className="mono-sm muted">{count} · {expanded?"▴":"▾"}</span>
      </div>
      <div className="mono-sm muted" style={{marginTop:2}}>{sub}</div>
      {expanded && (
        <div className="row gap-4 wrap" style={{marginTop:8}}>
          {Array.from({length:count}).map((_,i)=>(
            <div key={i} style={{width:60, position:"relative"}}>
              <ImgPh ar={detached?[1,1]:[3,4]} detached={detached} />
              <div style={{
                position:"absolute", top:2, right:2,
                width:14, height:14, borderRadius:"50%", background:"rgba(255,255,255,0.85)",
                fontSize:8, display:"flex", alignItems:"center", justifyContent:"center"
              }}>{i===0&&!detached?"🌐":(detached||i===1?"🔒":"🌐")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileEdit() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <button className="btn sm ghost" style={{padding:"2px 4px"}}>Cancel</button>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>Edit</strong>
          <button className="btn sm primary">Save</button>
        </div>

        {/* tabs */}
        <div style={{display:"flex", borderBottom:"1px solid var(--rule)", fontSize:12}}>
          {["Files","Meta","Lifecycle","Privacy"].map((t,i) => (
            <div key={t} style={{
              flex:1, textAlign:"center", padding:"8px 0", cursor:"pointer",
              borderBottom: i===1?"2px solid var(--accent)":"2px solid transparent",
              color: i===1?"var(--ink)":"var(--mute)",
              fontWeight: i===1?600:400
            }}>{t}</div>
          ))}
        </div>

        <div style={{flex:1, overflow:"auto", padding:"12px 14px"}}>
          <div className="col gap-12">
            <div>
              <div className="label">Title</div>
              <input className="field" defaultValue="Banzhi & Shouza — chibi pair" />
            </div>
            <div>
              <div className="label">Description</div>
              <textarea className="field" rows={3} defaultValue="Co-commission chibi piece. Includes background and a clean variant." style={{resize:"vertical"}} />
            </div>

            {/* Cover focal point */}
            <div>
              <div className="row" style={{justifyContent:"space-between", marginBottom:6}}>
                <span className="label" style={{margin:0}}>Cover · focal point</span>
                <span className="mono-sm muted">drag the ⊕</span>
              </div>
              <div style={{maxWidth:200, margin:"0 auto"}}>
                <ImgPh ar={[3,4]} focal={[0.42, 0.32]} />
              </div>
            </div>

            <div>
              <div className="label">Date</div>
              <input className="field" defaultValue="2024-09-12" />
            </div>
            <div>
              <div className="label">Price</div>
              <div className="row gap-4">
                <input className="field" defaultValue="280" style={{flex:1}} />
                <select className="field" defaultValue="USD" style={{width:80}}>
                  <option>USD</option><option>JPY</option><option>CNY</option>
                </select>
              </div>
            </div>
            <div>
              <div className="label">Rating</div>
              <div className="row gap-4">
                <Chip kind="rating">✓ General</Chip>
                <Chip kind="rating" ghost>Mature</Chip>
                <Chip kind="rating" ghost>Adult</Chip>
              </div>
            </div>
            <div>
              <div className="label">Categories</div>
              <div className="row gap-4 wrap">
                <Chip kind="cat">Chibi <span className="x">✕</span></Chip>
                <Chip kind="cat" ghost>+ add</Chip>
              </div>
            </div>
            <div>
              <div className="label">Tags</div>
              <div className="row gap-4 wrap">
                <Chip kind="tag">co-commission <span className="x">✕</span></Chip>
                <Chip kind="tag">差分 <span className="x">✕</span></Chip>
                <Chip kind="tag" ghost>+ add</Chip>
              </div>
            </div>
            <div>
              <div className="label">Characters</div>
              <div className="row gap-4 wrap">
                <Chip kind="char">Heiyao</Chip>
                <Chip kind="char">Banzhi</Chip>
                <Chip kind="char" ghost>+ link</Chip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Visibility / privacy panel — for mobile + a desktop modal version
function MobileVisibility() {
  const Row = ({label, pub, sub}) => (
    <div className="row" style={{
      justifyContent:"space-between", padding: "8px 0",
      borderBottom: "1px solid var(--rule)"
    }}>
      <div>
        <div style={{fontSize:13}}>{label}</div>
        {sub && <div className="mono-sm muted">{sub}</div>}
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: pub ? "var(--accent)" : "var(--rule-2)",
        position:"relative", flexShrink:0
      }}>
        <div style={{
          position:"absolute", top: 2, left: pub?18:2,
          width: 16, height: 16, borderRadius:"50%", background:"white",
          transition:"left 0.15s"
        }} />
      </div>
    </div>
  );
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>Visibility</strong>
          <button className="btn sm primary">Done</button>
        </div>
        <div style={{flex:1, overflow:"auto", padding:"12px 16px"}}>
          <div className="mono-sm muted" style={{marginBottom:10}}>
            What visitors can see without signing in.
          </div>
          <div style={{
            padding: 10, background: "var(--paper-2)", borderRadius: 6,
            display:"flex", justifyContent:"space-between", marginBottom:14
          }}>
            <strong style={{fontSize:13}}>Make commission public</strong>
            <div style={{
              width: 36, height: 20, borderRadius: 10,
              background: "var(--accent)", position:"relative"
            }}>
              <div style={{position:"absolute", top:2, left:18, width:16, height:16, borderRadius:"50%", background:"white"}} />
            </div>
          </div>

          <div className="label" style={{marginTop:8}}>Metadata fields</div>
          <Row label="Title & description" pub />
          <Row label="Categories & tags" pub />
          <Row label="Rating" pub />
          <Row label="Characters" pub />
          <Row label="Artists" pub />
          <Row label="Date completed" pub />
          <Row label="Confirmed at" pub={false} sub="hidden — admin only" />
          <Row label="Price" pub={false} sub="hidden — admin only" />

          <div className="label" style={{marginTop:14}}>Lifecycle stages</div>
          <Row label="Delivered" pub sub="3 files · all public" />
          <Row label="Color" pub sub="2 files · all public" />
          <Row label="Lineart" pub={false} sub="1 file · WIP, hidden" />
          <Row label="Sketching" pub sub="1 of 2 files public" />
          <Row label="Detached" pub sub="2 files · 1 hidden" />

          <div style={{
            marginTop: 14, padding: 10,
            background: "rgba(47,106,85,0.08)", borderLeft:"3px solid var(--accent)",
            fontSize: 12, color: "var(--ink-2)", borderRadius: 4
          }}>
            File-level overrides live on each file (in the file editor). Stage-level toggles cascade unless overridden.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MobileGallery, MobileDetail, MobileEdit, MobileVisibility });
