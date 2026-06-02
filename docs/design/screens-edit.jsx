// Add / Edit page with focal-point reticle

function AddEditPage() {
  const [focal, setFocal] = React.useState([0.42, 0.32]);
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef(null);

  const onMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setFocal([Math.max(0,Math.min(1,x)), Math.max(0,Math.min(1,y))]);
  };

  return (
    <div className="wf">
      <NotionTop crumbs={["Gallery", "Banzhi & Shouza", "Edit"]}>
        <span className="mono-sm muted">unsaved changes · auto-saved 12s ago</span>
        <ApiCopyButton />
        <button className="btn sm">Cancel</button>
        <button className="btn sm primary">✓ Save</button>
      </NotionTop>

      <div style={{flex:1, display:"grid", gridTemplateColumns:"1fr 360px", overflow:"hidden"}}>
        {/* left: image manager */}
        <div style={{padding:"24px 32px", overflow:"auto"}}>
          <input className="field lg" style={{
            border:"none", padding:"4px 0", fontSize:30, fontWeight:700, marginBottom:6,
            background:"transparent"
          }} defaultValue="Banzhi & Shouza — chibi pair" />

          <textarea className="field" rows={2} placeholder="Description…" defaultValue={
            "Co-commission chibi piece, completed for Heiyao's anniversary. Includes background and a clean variant."
          } style={{resize:"vertical", marginBottom:16}} />

          <div className="row" style={{justifyContent:"space-between", marginBottom: 8}}>
            <strong>Files</strong>
            <span className="mono-sm muted">drag to reorder · drop image to upload</span>
          </div>

          {/* Stage groups */}
          {[
            { name:"Sketching", files:[{ar:[3,4]},{ar:[3,4]}] },
            { name:"Lineart",   files:[{ar:[3,4], psd:true}] },
            { name:"Color",     files:[{ar:[3,4]}, {ar:[3,4], psd:true}] },
            { name:"Delivered", files:[{ar:[3,4], main:true},{ar:[3,4]},{ar:[3,4], psd:true}] },
          ].map(stage => (
            <div key={stage.name} style={{
              marginBottom: 12, padding: 12,
              background: "var(--paper-2)", borderRadius: 6
            }}>
              <div className="row" style={{justifyContent:"space-between", marginBottom: 8}}>
                <div className="row gap-8">
                  <span className="mono-sm muted">⋮⋮</span>
                  <strong>{stage.name}</strong>
                  <span className="mono-sm muted">started 2024-09-04</span>
                </div>
                <div className="row gap-4">
                  <button className="btn sm">+ file</button>
                  <span className="iconbtn">⋯</span>
                </div>
              </div>
              <div className="row gap-8 wrap">
                {stage.files.map((f, i) => (
                  <div key={i} style={{width: 110, position:"relative"}}>
                    <div style={{
                      outline: f.main ? "2px solid var(--accent)" : "none",
                      outlineOffset: 2, borderRadius: 4
                    }}>
                      <ImgPh ar={f.ar || [3,4]} />
                    </div>
                    <div className="row gap-4" style={{marginTop:4, fontSize:11}}>
                      {f.psd
                        ? <Chip kind="tag">psd</Chip>
                        : <Chip kind="cat">png</Chip>}
                      {f.main && <Chip kind="rating">cover</Chip>}
                    </div>
                  </div>
                ))}
                <div style={{
                  width: 110, aspectRatio: "3/4",
                  border: "1.5px dashed var(--rule-2)", borderRadius: 4,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"var(--mute)", fontSize:12, cursor:"pointer"
                }}>
                  + drop file
                </div>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 12, padding: 12, borderRadius: 6,
            background: "rgba(182,85,42,0.06)",
            border: "1px dashed var(--warn)"
          }}>
            <div className="row" style={{justifyContent:"space-between", marginBottom:8}}>
              <div className="row gap-8">
                <strong style={{color:"var(--warn)"}}>⊘ Detached</strong>
                <span className="mono-sm muted">uncategorized · system-managed</span>
              </div>
              <button className="btn sm">+ file</button>
            </div>
            <div className="row gap-8">
              <div style={{width: 110}}><ImgPh ar={[1,1]} detached label="qr_code.png" /></div>
            </div>
          </div>

          <div className="row" style={{marginTop: 14}}>
            <button className="btn">+ Add stage</button>
            <span style={{flex:1}} />
            <button className="btn ghost danger">🗑 Delete commission</button>
          </div>
        </div>

        {/* right: meta + focal point */}
        <div style={{
          borderLeft: "1px solid var(--rule)",
          padding: "20px 18px", overflow:"auto",
          background: "#fbfaf6"
        }}>
          <div className="label">Cover image · focal point</div>
          <div
            ref={ref}
            onMouseMove={(e) => dragging && onMove(e)}
            onMouseDown={(e) => { setDragging(true); onMove(e); }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            style={{ marginTop: 6, cursor: "crosshair" }}
          >
            <ImgPh ar={[3,4]} focal={focal}>
              {/* crosshair guides */}
              <div style={{
                position:"absolute", left:0, right:0, top: `${focal[1]*100}%`,
                borderTop:"1px dashed rgba(47,106,85,0.5)"
              }} />
              <div style={{
                position:"absolute", top:0, bottom:0, left: `${focal[0]*100}%`,
                borderLeft:"1px dashed rgba(47,106,85,0.5)"
              }} />
            </ImgPh>
          </div>
          <div className="mono-sm" style={{marginTop:6, textAlign:"center"}}>
            drag the reticle · focal ({focal[0].toFixed(2)}, {focal[1].toFixed(2)})
          </div>
          <div className="row gap-4" style={{justifyContent:"center", marginTop:8}}>
            {[[1,1],[3,4],[16,9]].map((ar, i) => (
              <div key={i} style={{width: 60}}>
                <ImgPh ar={ar} />
                <div className="mono-sm" style={{textAlign:"center", marginTop:2}}>{ar[0]}:{ar[1]}</div>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="col gap-12">
            <Field label="Date">
              <input className="field" defaultValue="2024-09-12" />
            </Field>
            <Field label="Confirmed at">
              <input className="field" defaultValue="2024-08-21" />
            </Field>
            <Field label="Price">
              <div className="row gap-4">
                <input className="field" defaultValue="280" style={{flex:1}} />
                <select className="field" defaultValue="USD" style={{width:80}}>
                  <option>USD</option><option>JPY</option><option>CNY</option>
                </select>
              </div>
            </Field>

            <Field label="Rating · pick one" tone="rating">
              <div className="row gap-4">
                <Chip kind="rating">✓ General</Chip>
                <Chip kind="rating" ghost>Mature</Chip>
                <Chip kind="rating" ghost>Adult</Chip>
              </div>
            </Field>

            <Field label="Categories" tone="cat">
              <div className="row gap-4 wrap">
                <Chip kind="cat">Chibi <span className="x">✕</span></Chip>
                <Chip kind="cat" ghost>+ add</Chip>
              </div>
            </Field>

            <Field label="Tags" tone="tag">
              <div className="row gap-4 wrap">
                <Chip kind="tag">co-commission <span className="x">✕</span></Chip>
                <Chip kind="tag">差分 <span className="x">✕</span></Chip>
                <Chip kind="tag" ghost>+ add</Chip>
              </div>
            </Field>

            <Field label="Characters" tone="char">
              <div className="row gap-4 wrap">
                <Chip kind="char">Heiyao</Chip>
                <Chip kind="char">Banzhi</Chip>
                <Chip kind="char" ghost>+ link</Chip>
              </div>
            </Field>

            <Field label="Artists" tone="artist">
              <div className="row gap-4 wrap">
                <Chip kind="artist">Natsume Ryuhane</Chip>
                <Chip kind="artist">@yuzuki_art</Chip>
                <Chip kind="artist" ghost>+ link</Chip>
              </div>
            </Field>

            <div style={{
              padding: 10, background: "rgba(182,85,42,0.08)",
              borderRadius: 6, borderLeft: "3px solid var(--warn)",
              fontSize: 12
            }}>
              <strong>Validation</strong>
              <ul style={{margin:"4px 0 0 18px", padding:0, color:"var(--ink-2)"}}>
                <li>Rating: ✓ exactly one selected</li>
                <li>At least one displayable image: ✓</li>
                <li className="muted">Cover image: ✓ Delivered/final_with_bg.png</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <Note style={{top: 60, right: 380}}>drag reticle anywhere on the image</Note>
    </div>
  );
}

function Field({label, tone, children}) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

Object.assign(window, { AddEditPage });
