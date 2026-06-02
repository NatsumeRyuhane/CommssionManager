// ⑩ Artist management — multi-platform handles, as-you-type matching, no-match dialog

// ============== Reusable: live handle autocomplete ==============
// Type a handle → searches ARTIST_DB across every platform handle.
// Each match row shows the platform badge + the handle + the configured artist name.
// No match + Enter → onNoMatch(query) (opens the resolve dialog).
function ArtistHandleInput({ initialQuery="@natsume", autoFocus=true, onNoMatch, onPick }) {
  const [q, setQ] = React.useState(initialQuery);
  const matches = React.useMemo(() => {
    const needle = q.replace(/^@/, "").toLowerCase().trim();
    if (!needle) return [];
    const out = [];
    ARTIST_DB.forEach(a => {
      a.handles.forEach(h => {
        if (h.handle.toLowerCase().replace(/^@/,"").includes(needle) ||
            a.name.toLowerCase().includes(needle)) {
          out.push({ artist:a, handle:h });
        }
      });
    });
    return out;
  }, [q]);

  return (
    <div style={{position:"relative"}}>
      <div className="row" style={{
        border:"1px solid var(--artist-fg)", borderRadius:6, padding:"7px 10px",
        background:"var(--paper)", boxShadow:"0 0 0 3px rgba(91,58,120,0.12)"
      }}>
        <span style={{color:"var(--mute)"}}>🔍</span>
        <input
          className="field" autoFocus={autoFocus}
          style={{border:"none", padding:"0 4px", flex:1}}
          value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Paste handle, e.g. @artist or mihuashi name…"
        />
        <span className="mono-sm muted">⏎ to resolve</span>
      </div>

      {/* dropdown */}
      <div style={{
        marginTop:6, border:"1px solid var(--rule-2)", borderRadius:8,
        background:"var(--paper)", boxShadow:"var(--shadow-2)", overflow:"hidden"
      }}>
        {matches.length > 0 ? (
          <>
            <div className="mono-sm muted" style={{padding:"6px 12px", borderBottom:"1px solid var(--rule)"}}>
              {matches.length} matching handle{matches.length!==1?"s":""}
            </div>
            {matches.map((m, i) => (
              <div key={i} onClick={()=>onPick && onPick(m)} style={{
                display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                borderBottom: i<matches.length-1?"1px solid var(--rule)":"none", cursor:"pointer"
              }} className="hoverable">
                <PlatformBadge platform={m.handle.platform} size={24} />
                <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:13}}>{m.handle.handle}</span>
                <span className="mono-sm muted">→</span>
                <Chip kind="artist">{m.artist.name}</Chip>
                <span style={{flex:1}} />
                <span className="mono-sm muted">{m.artist.works} works</span>
              </div>
            ))}
          </>
        ) : (
          <div style={{padding:"14px 12px"}}>
            <div className="row gap-8" style={{marginBottom:8}}>
              <span style={{color:"var(--warn)"}}>⚠</span>
              <span style={{fontSize:13}}>No artist matches <b style={{fontFamily:"IBM Plex Mono, monospace"}}>{q}</b></span>
            </div>
            <button className="btn primary sm" onClick={()=>onNoMatch && onNoMatch(q)}>
              ⏎ Resolve this handle…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Desktop · Artist management hub ==============
function ArtistManagement() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Artists"]}>
        <button className="btn sm">↧ Import</button>
        <button className="btn sm primary">+ New artist</button>
      </NotionTop>
      <div style={{flex:1, overflow:"auto", padding:"24px 32px"}}>
        <div className="page-title" style={{padding:0, marginBottom:6}}>
          <h1 style={{fontSize:26, margin:0}}>Artists</h1>
          <div className="sub mono">{ARTIST_DB.length} artists · handles consolidate across platforms</div>
        </div>

        {/* quick add by handle */}
        <div style={{
          margin:"16px 0 24px", padding:16, background:"var(--paper-2)",
          borderRadius:10, border:"1px solid var(--rule)"
        }}>
          <div className="label">Add / find an artist by handle</div>
          <div style={{maxWidth:520, marginTop:6}}>
            <ArtistHandleInput initialQuery="@yuzuki" autoFocus={false} />
          </div>
          <div className="mono-sm muted" style={{marginTop:8}}>
            Paste any platform handle — if it's already configured, it resolves to the artist automatically.
          </div>
        </div>

        {/* artist cards */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
          {ARTIST_DB.map(a => (
            <div key={a.id} style={{
              border:"1px solid var(--rule)", borderRadius:10, padding:16, background:"var(--paper)"
            }}>
              <div className="row" style={{justifyContent:"space-between", marginBottom:10}}>
                <div className="row gap-8">
                  <div style={{
                    width:36, height:36, borderRadius:"50%", background:"var(--artist-bg)",
                    color:"var(--artist-fg)", display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:700
                  }}>{a.name.slice(0,1)}</div>
                  <div>
                    <strong style={{fontSize:15}}>{a.name}</strong>
                    <div className="mono-sm muted">{a.works} commissions</div>
                  </div>
                </div>
                <span className="iconbtn">⋯</span>
              </div>
              <div className="col gap-6">
                {a.handles.map((h, i) => (
                  <div key={i} className="row gap-8" style={{
                    padding:"6px 8px", borderRadius:6, background:"var(--paper-2)"
                  }}>
                    <PlatformBadge platform={h.platform} size={22} />
                    <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:12.5}}>{h.handle}</span>
                    <span className="mono-sm muted">{PLATFORMS[h.platform]?.label}</span>
                    <span style={{flex:1}} />
                    <span className="iconbtn" style={{fontSize:11}}>✎</span>
                  </div>
                ))}
                <button className="btn sm" style={{alignSelf:"flex-start", marginTop:2}}>+ add handle</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Note style={{top:64, right:32}}>one artist · many platform handles · paste-to-match</Note>
    </div>
  );
}

// ============== Desktop · resolve dialog (2.1: no match on Enter) ==============
function ArtistResolveDialog() {
  const [mode, setMode] = React.useState("new"); // "new" | "existing"
  const query = "@natsume_alt";
  return (
    <div className="wf">
      {/* dimmed edit-page background */}
      <NotionTop crumbs={["Gallery", "Banzhi & Shouza", "Edit"]} />
      <div style={{flex:1, position:"relative", overflow:"hidden"}}>
        <div style={{padding:"20px 32px", opacity:0.4, pointerEvents:"none"}}>
          <div className="label">Artists</div>
          <div className="row gap-4 wrap">
            <Chip kind="artist">Natsume Ryuhane</Chip>
            <div style={{
              border:"1px solid var(--artist-fg)", borderRadius:6, padding:"5px 10px",
              fontFamily:"IBM Plex Mono, monospace", fontSize:13
            }}>{query} ⏎</div>
          </div>
        </div>

        {/* dialog */}
        <div style={{
          position:"absolute", inset:0, background:"rgba(20,18,15,0.4)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:24
        }}>
          <div style={{
            width:520, background:"var(--paper)", borderRadius:12,
            boxShadow:"var(--shadow-2)", overflow:"hidden"
          }}>
            <div style={{padding:"16px 20px", borderBottom:"1px solid var(--rule)"}}>
              <div className="row gap-8" style={{marginBottom:4}}>
                <span style={{color:"var(--warn)"}}>⚠</span>
                <strong style={{fontSize:15}}>No artist matches this handle</strong>
              </div>
              <div className="row gap-8" style={{marginTop:6}}>
                <PlatformBadge platform="twitter" size={22} />
                <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:13}}>{query}</span>
                <span className="mono-sm muted">— unrecognized</span>
              </div>
            </div>

            {/* mode toggle */}
            <div style={{padding:"16px 20px"}}>
              <div className="mono-sm muted" style={{marginBottom:10}}>What should happen?</div>
              <div className="col gap-8">
                <label onClick={()=>setMode("new")} style={{
                  display:"flex", gap:10, padding:"12px 14px", borderRadius:8, cursor:"pointer",
                  border: mode==="new" ? "2px solid var(--accent)" : "1px solid var(--rule)",
                  background: mode==="new" ? "rgba(47,106,85,0.05)" : "var(--paper)"
                }}>
                  <Radio on={mode==="new"} />
                  <div>
                    <strong style={{fontSize:14}}>Create a new artist profile</strong>
                    <div className="mono-sm muted" style={{marginTop:2}}>Start a fresh artist with this handle as its first contact.</div>
                  </div>
                </label>
                <label onClick={()=>setMode("existing")} style={{
                  display:"flex", gap:10, padding:"12px 14px", borderRadius:8, cursor:"pointer",
                  border: mode==="existing" ? "2px solid var(--accent)" : "1px solid var(--rule)",
                  background: mode==="existing" ? "rgba(47,106,85,0.05)" : "var(--paper)"
                }}>
                  <Radio on={mode==="existing"} />
                  <div style={{flex:1}}>
                    <strong style={{fontSize:14}}>Add this handle to an existing artist</strong>
                    <div className="mono-sm muted" style={{marginTop:2}}>Link it as another platform of someone already configured.</div>
                  </div>
                </label>
              </div>

              {/* contextual body */}
              {mode === "new" ? (
                <div style={{marginTop:14}}>
                  <div className="label">New artist name</div>
                  <input className="field" placeholder="e.g. Natsume Ryuhane" defaultValue="" />
                  <div className="row gap-8" style={{marginTop:10, alignItems:"center"}}>
                    <span className="mono-sm muted">first handle:</span>
                    <PlatformBadge platform="twitter" size={20} />
                    <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:12.5}}>{query}</span>
                  </div>
                </div>
              ) : (
                <div style={{marginTop:14}}>
                  <div className="label">Pick the artist to attach to</div>
                  <div className="row" style={{border:"1px solid var(--rule-2)", borderRadius:6, padding:"4px 10px", marginBottom:8}}>
                    <span style={{color:"var(--mute)"}}>🔍</span>
                    <input className="field" style={{border:"none"}} placeholder="Search configured artists…" defaultValue="natsume" />
                  </div>
                  <div style={{border:"1px solid var(--rule)", borderRadius:8, overflow:"hidden"}}>
                    {ARTIST_DB.slice(0,3).map((a,i) => (
                      <div key={a.id} className="row gap-8" style={{
                        padding:"9px 12px", borderBottom: i<2?"1px solid var(--rule)":"none",
                        cursor:"pointer", background: i===0?"rgba(91,58,120,0.06)":"transparent"
                      }}>
                        <Radio on={i===0} />
                        <strong style={{fontSize:13}}>{a.name}</strong>
                        <span style={{flex:1}} />
                        <div className="row gap-4">
                          {a.handles.map((h,k)=><PlatformBadge key={k} platform={h.platform} size={18} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mono-sm muted" style={{marginTop:8}}>
                    {query} will be added as a new <b>X / Twitter</b> handle on the selected artist.
                  </div>
                </div>
              )}
            </div>

            <div style={{padding:"12px 20px", borderTop:"1px solid var(--rule)", display:"flex", gap:10, justifyContent:"flex-end"}}>
              <button className="btn">Cancel</button>
              <button className="btn primary">
                {mode==="new" ? "Create artist" : "Add handle"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <Note style={{top:90, right:32}}>2.1 · no-match dialog · create new vs attach to existing</Note>
    </div>
  );
}

function Radio({on}) {
  return (
    <span style={{
      width:16, height:16, borderRadius:"50%", flexShrink:0, marginTop:2,
      border: on ? "none" : "2px solid var(--rule-2)",
      background: on ? "var(--accent)" : "transparent",
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      color:"white", fontSize:9
    }}>{on && "✓"}</span>
  );
}

// ============== Mobile · artist management ==============
function MobileArtistManagement() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)"}}>
          <span className="iconbtn">←</span>
          <strong style={{fontSize:14, flex:1}}>Artists</strong>
          <span className="iconbtn">＋</span>
        </div>
        <div style={{flex:1, overflow:"auto", padding:"12px 14px"}}>
          {/* add by handle */}
          <div className="label">Add by handle</div>
          <div className="row" style={{
            border:"1px solid var(--artist-fg)", borderRadius:6, padding:"7px 10px",
            boxShadow:"0 0 0 3px rgba(91,58,120,0.12)", marginBottom:8
          }}>
            <span style={{color:"var(--mute)"}}>🔍</span>
            <input className="field" style={{border:"none", flex:1}} defaultValue="@natsume" />
          </div>
          {/* one match preview */}
          <div style={{border:"1px solid var(--rule-2)", borderRadius:8, overflow:"hidden", marginBottom:18}}>
            <div className="row gap-8" style={{padding:"9px 12px"}}>
              <PlatformBadge platform="twitter" size={22} />
              <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:12}}>@natsume_ryu</span>
              <span className="mono-sm muted">→</span>
              <Chip kind="artist">Natsume Ryuhane</Chip>
            </div>
          </div>

          {/* artist list */}
          {ARTIST_DB.map(a => (
            <div key={a.id} style={{
              border:"1px solid var(--rule)", borderRadius:10, padding:12, marginBottom:10
            }}>
              <div className="row gap-8" style={{marginBottom:8}}>
                <div style={{
                  width:32, height:32, borderRadius:"50%", background:"var(--artist-bg)",
                  color:"var(--artist-fg)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700
                }}>{a.name.slice(0,1)}</div>
                <div style={{flex:1}}>
                  <strong style={{fontSize:14}}>{a.name}</strong>
                  <div className="mono-sm muted">{a.works} commissions</div>
                </div>
                <span className="iconbtn">⋯</span>
              </div>
              <div className="row gap-6 wrap">
                {a.handles.map((h,i)=>(
                  <div key={i} className="row gap-4" style={{
                    padding:"4px 8px", borderRadius:20, background:"var(--paper-2)"
                  }}>
                    <PlatformBadge platform={h.platform} size={18} />
                    <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:11}}>{h.handle}</span>
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

// ============== Mobile · resolve dialog (2.1) ==============
function MobileArtistResolve() {
  return (
    <div className="device">
      <div className="notch" />
      <div className="device-inner" style={{paddingTop:32, position:"relative"}}>
        <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--rule)", opacity:0.5}}>
          <button className="btn sm ghost" style={{padding:"2px 4px"}}>Cancel</button>
          <strong style={{fontSize:14, flex:1, textAlign:"center"}}>Edit</strong>
          <button className="btn sm primary">Save</button>
        </div>
        <div style={{padding:"14px", opacity:0.4, pointerEvents:"none"}}>
          <div className="label">Artists</div>
          <div className="row gap-4 wrap">
            <Chip kind="artist">Natsume Ryuhane</Chip>
            <div style={{border:"1px solid var(--artist-fg)", borderRadius:6, padding:"4px 8px", fontFamily:"IBM Plex Mono, monospace", fontSize:12}}>@natsume_alt ⏎</div>
          </div>
        </div>

        {/* dim + bottom sheet */}
        <div style={{position:"absolute", inset:0, background:"rgba(20,18,15,0.4)"}} />
        <div style={{
          position:"absolute", left:0, right:0, bottom:0, background:"var(--paper)",
          borderTopLeftRadius:16, borderTopRightRadius:16, padding:"14px 16px 20px",
          boxShadow:"0 -8px 32px rgba(0,0,0,0.18)"
        }}>
          <div style={{width:40, height:4, borderRadius:2, background:"var(--rule-2)", margin:"0 auto 12px"}} />
          <div className="row gap-6" style={{marginBottom:4}}>
            <span style={{color:"var(--warn)"}}>⚠</span>
            <strong style={{fontSize:14}}>No artist matches</strong>
          </div>
          <div className="row gap-6" style={{marginBottom:14}}>
            <PlatformBadge platform="twitter" size={20} />
            <span style={{fontFamily:"IBM Plex Mono, monospace", fontSize:12}}>@natsume_alt</span>
          </div>

          <div className="col gap-8">
            <div style={{
              padding:"12px 14px", borderRadius:8, border:"2px solid var(--accent)",
              background:"rgba(47,106,85,0.05)"
            }}>
              <div className="row gap-8"><Radio on={true} /><strong style={{fontSize:13}}>Create new artist profile</strong></div>
            </div>
            <div style={{padding:"12px 14px", borderRadius:8, border:"1px solid var(--rule)"}}>
              <div className="row gap-8"><Radio on={false} /><strong style={{fontSize:13}}>Add to existing artist</strong></div>
            </div>
          </div>

          <div style={{marginTop:12}}>
            <div className="label">New artist name</div>
            <input className="field" placeholder="e.g. Natsume Ryuhane" />
          </div>

          <button className="btn primary" style={{width:"100%", justifyContent:"center", marginTop:14, padding:"10px"}}>
            Create artist
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ArtistHandleInput, ArtistManagement, ArtistResolveDialog,
  MobileArtistManagement, MobileArtistResolve, Radio
});
