// ⑨ Character pages — shareable profile + curated image "bookshelves"

// Curated sets ("bookshelves"): admin picks DB images containing this character
const HEIYAO_SETS = [
  { id:"s1", title:"Portraits & headshots", desc:"Close-ups and bust shots across commissions.", count:5 },
  { id:"s2", title:"Chibi & sticker sets",  desc:"Cute small-format pieces, including co-commissions.", count:6 },
  { id:"s3", title:"Full outfits",          desc:"Reference-quality full body in each costume.", count:4 },
];

function CharProfilePic({ size=120, ring=true }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", overflow:"hidden",
      border: ring ? "3px solid var(--paper)" : "none",
      boxShadow: ring ? "0 0 0 1px var(--rule-2), 0 4px 14px rgba(0,0,0,0.12)" : "none",
      flexShrink:0, background:"var(--paper-2)"
    }}>
      <div style={{
        width:"100%", height:"100%",
        display:"flex", alignItems:"center", justifyContent:"center",
        color:"var(--mute)", fontFamily:"IBM Plex Mono, monospace", fontSize: size*0.13
      }}>profile</div>
    </div>
  );
}

// Horizontal "bookshelf" of images
function Bookshelf({ set, editable=false, onAdd }) {
  return (
    <div style={{marginBottom:28}}>
      <div className="row" style={{justifyContent:"space-between", alignItems:"flex-end", marginBottom:8}}>
        <div>
          <div className="row gap-8">
            {editable && <span className="mono-sm muted" style={{cursor:"grab"}} title="Drag set to reorder">⋮⋮</span>}
            <strong style={{fontSize:16}}>{set.title}</strong>
            <span className="mono-sm muted">{set.count} images</span>
          </div>
          <div className="mono-sm" style={{color:"var(--ink-2)", marginTop:2}}>{set.desc}</div>
        </div>
        {editable && (
          <div className="row gap-4">
            <button className="btn sm">✎ edit set</button>
            <button className="btn sm" onClick={onAdd}>+ add images</button>
          </div>
        )}
      </div>
      <div className="row gap-8" style={{overflowX:"auto", paddingBottom:4}}>
        {Array.from({length:set.count}).map((_,i)=>(
          <div key={i} style={{width:150, flexShrink:0, position:"relative"}}>
            <ImgPh ar={[Math.random()>0.5?3:4, 4]} />
            {editable && (
              <span className="iconbtn" style={{
                position:"absolute", top:4, right:4, width:22, height:22,
                background:"rgba(20,18,15,0.6)", color:"white", borderRadius:4, fontSize:12
              }}>✕</span>
            )}
          </div>
        ))}
        {editable && (
          <div onClick={onAdd} style={{
            width:150, flexShrink:0, aspectRatio:"3/4",
            border:"1.5px dashed var(--rule-2)", borderRadius:6,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            color:"var(--mute)", cursor:"pointer", gap:4
          }}>
            <span style={{fontSize:22}}>+</span>
            <span className="mono-sm">add from gallery</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Desktop · public character page (admin viewing) ==============
function CharacterPage() {
  const [picker, setPicker] = React.useState(false);
  return (
    <div className="wf">
      <div style={{
        padding:"12px 24px", display:"flex", alignItems:"center", gap:12,
        borderBottom:"1px solid var(--rule)", background:"var(--paper)"
      }}>
        <span className="iconbtn">←</span>
        <span className="mono-sm muted">characters /</span>
        <strong style={{fontSize:14}}>Heiyao</strong>
        <span style={{flex:1}} />
        <span className="row gap-4 mono-sm" style={{color:"var(--accent)"}}>🌐 public page</span>
        <button className="btn sm">🔗 Copy share link</button>
        <button className="btn sm">{"{}"} Copy API JSON</button>
        <button className="btn sm primary">✎ Edit page</button>
      </div>

      <div style={{flex:1, overflow:"auto"}}>
        {/* banner + identity */}
        <div style={{position:"relative"}}>
          <div style={{height:140, background:"linear-gradient(110deg, #e6ecf3, #ece5f2)"}} />
          <div style={{padding:"0 40px", display:"flex", gap:20, alignItems:"flex-end", marginTop:-50}}>
            <CharProfilePic size={120} />
            <div style={{paddingBottom:10, flex:1}}>
              <h1 style={{margin:0, fontSize:30}}>Heiyao</h1>
              <div className="row gap-8" style={{marginTop:4}}>
                <Chip kind="char">kitsune</Chip>
                <Chip kind="char">ref-sheet ✓</Chip>
                <span className="mono-sm muted">appears in 14 commissions · 3 curated sets</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{padding:"24px 40px 40px"}}>
          {/* about + main ref, side by side */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:28, marginBottom:32}}>
            <div>
              <div className="label">About</div>
              <p style={{margin:"4px 0 0", color:"var(--ink-2)", lineHeight:1.7}}>
                Heiyao is a black-and-white kitsune with a single cut tail and totem markings.
                Primary OC — this page collects the canonical reference and curated highlights
                pulled from the commission gallery.
              </p>
              <div className="row gap-16" style={{marginTop:16}}>
                <div><div className="label">Species</div><strong>Kitsune</strong></div>
                <div><div className="label">First commissioned</div><strong>2023-04</strong></div>
                <div><div className="label">Designer</div><strong>Natsume Ryuhane</strong></div>
              </div>
            </div>
            <div>
              <div className="row" style={{justifyContent:"space-between", marginBottom:6}}>
                <div className="label" style={{margin:0}}>Main reference</div>
                <span className="mono-sm" style={{color:"var(--accent)"}}>pinned</span>
              </div>
              <div style={{borderRadius:8, overflow:"hidden", border:"2px solid var(--char-fg)"}}>
                <ImgPh ar={[4,3]} label="ref_sheet_v3.png" />
              </div>
            </div>
          </div>

          {/* curated sets */}
          <div className="row" style={{justifyContent:"space-between", marginBottom:14}}>
            <h2 style={{margin:0, fontSize:20}}>Curated sets</h2>
            <span className="mono-sm muted">drag to reorder · sets are admin-picked from the gallery</span>
          </div>
          {HEIYAO_SETS.map(set => (
            <Bookshelf key={set.id} set={set} editable onAdd={()=>setPicker(true)} />
          ))}
          <button className="btn" style={{marginTop:4}}>+ New set</button>
        </div>
      </div>

      {picker && <ImagePickerModal onClose={()=>setPicker(false)} />}
      <Note style={{top:60, right:32}}>shareable public page · profile + main ref + curated "bookshelves"</Note>
    </div>
  );
}

// ============== Image picker modal — choose DB images containing this character ==============
function ImagePickerModal({ onClose }) {
  const [selected, setSelected] = React.useState([1,4,7]);
  const pool = COMMISSIONS.slice(0, 18);
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  return (
    <div style={{
      position:"absolute", inset:0, zIndex:80,
      background:"rgba(20,18,15,0.45)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:32
    }}>
      <div style={{
        width:760, maxHeight:"100%", background:"var(--paper)",
        borderRadius:12, boxShadow:"var(--shadow-2)", display:"flex", flexDirection:"column", overflow:"hidden"
      }}>
        <div style={{padding:"14px 18px", borderBottom:"1px solid var(--rule)"}}>
          <div className="row" style={{justifyContent:"space-between"}}>
            <strong style={{fontSize:15}}>Add images to “Portraits & headshots”</strong>
            <span className="iconbtn" onClick={onClose}>✕</span>
          </div>
          <div className="row gap-8" style={{marginTop:10}}>
            <div className="row" style={{flex:1, border:"1px solid var(--rule-2)", borderRadius:6, padding:"4px 10px"}}>
              <span style={{color:"var(--mute)"}}>🔍</span>
              <input className="field" style={{border:"none"}} placeholder="Filter images…" />
            </div>
            <Chip kind="char">✓ contains Heiyao</Chip>
            <Chip ghost>only public</Chip>
            <Chip ghost>not in any set</Chip>
          </div>
        </div>
        <div style={{flex:1, overflow:"auto", padding:16}}>
          <div className="mono-sm muted" style={{marginBottom:10}}>
            Showing 18 gallery images tagged with Heiyao · {selected.length} selected
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10}}>
            {pool.map((it) => {
              const sel = selected.includes(it.id);
              return (
                <div key={it.id} onClick={()=>toggle(it.id)} style={{
                  position:"relative", borderRadius:6, overflow:"hidden", cursor:"pointer",
                  outline: sel ? "2px solid var(--accent)" : "1px solid var(--rule)", outlineOffset: sel?0:-1
                }}>
                  <ImgPh ar={[3,4]} />
                  <span style={{
                    position:"absolute", top:5, left:5, width:18, height:18, borderRadius:4,
                    border:"2px solid white", background: sel?"var(--accent)":"rgba(0,0,0,0.3)",
                    display:"inline-flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:11
                  }}>{sel && "✓"}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{padding:"12px 18px", borderTop:"1px solid var(--rule)", display:"flex", gap:10}}>
          <span className="mono-sm muted" style={{flex:1, alignSelf:"center"}}>{selected.length} images will be added to the set</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onClose}>Add {selected.length} images</button>
        </div>
      </div>
    </div>
  );
}

// ============== Mobile · character page ==============
function MobileCharacterPage() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1}}>Heiyao</strong>
          <span className="iconbtn">🔗</span>
          <span className="iconbtn">⋯</span>
        </div>

        <div style={{flex:1, overflow:"auto"}}>
          {/* banner + profile */}
          <div style={{position:"relative"}}>
            <div style={{height:88, background:"linear-gradient(110deg, #e6ecf3, #ece5f2)"}} />
            <div style={{display:"flex", justifyContent:"center", marginTop:-44}}>
              <CharProfilePic size={84} />
            </div>
          </div>
          <div style={{textAlign:"center", padding:"8px 16px 4px"}}>
            <h2 style={{margin:0, fontSize:22}}>Heiyao</h2>
            <div className="row gap-4" style={{justifyContent:"center", marginTop:6}}>
              <Chip kind="char">kitsune</Chip>
              <Chip kind="char">ref-sheet ✓</Chip>
            </div>
            <div className="mono-sm muted" style={{marginTop:6}}>14 commissions · 3 sets</div>
            <p style={{fontSize:13, color:"var(--ink-2)", lineHeight:1.6, marginTop:10, textAlign:"left"}}>
              Black-and-white kitsune with a single cut tail and totem markings. Primary OC.
            </p>
          </div>

          {/* main ref */}
          <div style={{padding:"4px 16px 14px"}}>
            <div className="row" style={{justifyContent:"space-between", marginBottom:6}}>
              <span className="label" style={{margin:0}}>Main reference</span>
              <span className="mono-sm" style={{color:"var(--accent)"}}>pinned</span>
            </div>
            <div style={{borderRadius:8, overflow:"hidden", border:"2px solid var(--char-fg)"}}>
              <ImgPh ar={[4,3]} label="ref_sheet_v3.png" />
            </div>
          </div>

          {/* sets — vertical, each a horizontal scroll */}
          {HEIYAO_SETS.map(set => (
            <div key={set.id} style={{padding:"8px 0 8px 16px", borderTop:"1px solid var(--rule)"}}>
              <strong style={{fontSize:14}}>{set.title}</strong>
              <div className="mono-sm" style={{color:"var(--ink-2)", margin:"2px 16px 8px 0"}}>{set.desc}</div>
              <div className="row gap-6" style={{overflowX:"auto", paddingRight:16}}>
                {Array.from({length:set.count}).map((_,i)=>(
                  <div key={i} style={{width:104, flexShrink:0}}>
                    <ImgPh ar={[3,4]} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CharacterPage, MobileCharacterPage, ImagePickerModal, CharProfilePic, Bookshelf });
