// Lifecycle / nodes view
// LifecycleStagesList = reusable component used in:
//   - Detail page (embedded inline on desktop, button-jump on mobile)
//   - Standalone /commissions/:id/lifecycle endpoint (primarily for mobile, deep-link on desktop)

// Shared toggle: show only delivered vs show all
function LifecycleViewToggle({ showAll, setShowAll }) {
  return (
    <div className="row gap-4" style={{
      background:"var(--paper-2)", borderRadius:6, padding:"3px 4px",
      border:"1px solid var(--rule)"
    }}>
      <button onClick={()=>setShowAll(false)} style={{
        padding:"3px 10px", borderRadius:4, border:"none", cursor:"pointer", fontSize:12,
        background: !showAll ? "var(--paper)" : "transparent",
        boxShadow: !showAll ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        fontWeight: !showAll ? 600 : 400, color: !showAll ? "var(--ink)" : "var(--mute)"
      }}>Delivered only</button>
      <button onClick={()=>setShowAll(true)} style={{
        padding:"3px 10px", borderRadius:4, border:"none", cursor:"pointer", fontSize:12,
        background: showAll ? "var(--paper)" : "transparent",
        boxShadow: showAll ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        fontWeight: showAll ? 600 : 400, color: showAll ? "var(--ink)" : "var(--mute)"
      }}>Show all</button>
    </div>
  );
}

const ALL_STAGES_META = [
  { name:"Sketching", date:"2024-08-22" },
  { name:"Lineart",   date:"2024-08-29" },
  { name:"Color",     date:"2024-09-04" },
  { name:"Delivered", date:"2024-09-12", current:true },
];

const INITIAL_FILES = {
  Sketching: [{id:"f1", name:"rough.png", public:true}, {id:"f2", name:"rough_alt.png", public:false}],
  Lineart:   [{id:"f3", name:"lineart.psd", public:false}],
  Color:     [{id:"f4", name:"color_flat.png", public:true}, {id:"f5", name:"color_render.psd", public:false}],
  Delivered: [{id:"f6", name:"final_with_bg.png", public:true}, {id:"f7", name:"final_clean.png", public:true}],
};

// ============== Reusable component ==============
// Props:
//   showAll          - bool (controlled)
//   onShowAllChange  - setter
//   dragEnabled      - bool, default true
//   compact          - bool, smaller thumbs/padding for mobile or embedded views
//   editable         - bool, show "+ file" buttons and stage controls
function LifecycleStagesList({
  showAll = true,
  onShowAllChange,
  dragEnabled = true,
  compact = false,
  editable = true,
}) {
  const [files, setFiles] = React.useState(INITIAL_FILES);
  const [dragging, setDragging] = React.useState(null);
  const [hoverStage, setHoverStage] = React.useState(null);

  const visible = showAll ? ALL_STAGES_META : ALL_STAGES_META.filter(s => s.name === "Delivered");

  const onDragStart = (fileId, fromStage) => (e) => {
    if (!dragEnabled) return;
    setDragging({fileId, fromStage});
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (stageName) => (e) => {
    if (!dragEnabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverStage !== stageName) setHoverStage(stageName);
  };
  const onDrop = (toStage) => (e) => {
    if (!dragEnabled) return;
    e.preventDefault();
    if (!dragging || dragging.fromStage === toStage) {
      setDragging(null); setHoverStage(null); return;
    }
    setFiles(prev => {
      const next = {...prev};
      const file = prev[dragging.fromStage].find(f => f.id === dragging.fileId);
      next[dragging.fromStage] = prev[dragging.fromStage].filter(f => f.id !== dragging.fileId);
      next[toStage] = [...prev[toStage], file];
      return next;
    });
    setDragging(null); setHoverStage(null);
  };

  const thumbW = compact ? 60 : 80;
  const railLeft = compact ? 22 : 28;

  return (
    <div style={{position:"relative", paddingLeft: railLeft}}>
      <div style={{
        position:"absolute", left: railLeft/2 - 1, top: 6, bottom: 20,
        borderLeft: "2px solid var(--rule-2)"
      }} />
      {visible.map((s) => {
        const stageFiles = files[s.name] || [];
        const isHover = hoverStage === s.name && dragging && dragging.fromStage !== s.name;
        const stageIdx = ALL_STAGES_META.findIndex(x => x.name === s.name) + 1;
        return (
          <div key={s.name} style={{position:"relative", marginBottom: 12}}>
            <span style={{
              position:"absolute", left: -(railLeft - 4), top: 4,
              width: compact ? 20 : 24, height: compact ? 20 : 24, borderRadius: "50%",
              background: s.current ? "var(--accent)" : "var(--paper)",
              border: s.current ? "none" : "2px solid var(--rule-2)",
              color: s.current ? "white" : "var(--mute)",
              display:"inline-flex", alignItems:"center", justifyContent:"center",
              fontSize: compact ? 10 : 11, fontWeight: 700,
              boxShadow: "0 0 0 3px var(--paper)"
            }}>{stageIdx}</span>
            <div
              onDragOver={onDragOver(s.name)}
              onDragLeave={() => setHoverStage(null)}
              onDrop={onDrop(s.name)}
              style={{
                background: isHover ? "rgba(47,106,85,0.06)" : "var(--paper)",
                border: isHover ? "2px dashed var(--accent)" : "1px solid var(--rule)",
                borderRadius: 8, padding: isHover ? (compact ? 9 : 11) : (compact ? 10 : 12),
                transition: "background 0.12s"
              }}
            >
              <div className="row" style={{justifyContent:"space-between", marginBottom: 6}}>
                <div className="row gap-8">
                  {editable && dragEnabled && (
                    <span className="mono-sm muted" style={{cursor:"grab"}} title="Drag stage to reorder">⋮⋮</span>
                  )}
                  <strong style={{fontSize: compact ? 13 : 14}}>{s.name}</strong>
                  {s.current && <Chip kind="cat">current</Chip>}
                  <span className="mono-sm muted">started {s.date}</span>
                </div>
                <div className="row gap-4">
                  <span className="mono-sm">{stageFiles.length} file{stageFiles.length!==1?"s":""}</span>
                  {editable && <button className="btn sm">+ file</button>}
                </div>
              </div>
              <div className="row gap-8 wrap">
                {stageFiles.map((f) => (
                  <div
                    key={f.id}
                    draggable={dragEnabled}
                    onDragStart={onDragStart(f.id, s.name)}
                    onDragEnd={() => { setDragging(null); setHoverStage(null); }}
                    title={dragEnabled ? `Drag ${f.name} to another stage` : f.name}
                    style={{
                      width: thumbW, position:"relative",
                      cursor: dragEnabled ? "grab" : "default",
                      opacity: dragging?.fileId === f.id ? 0.4 : 1,
                      transition: "opacity 0.12s"
                    }}
                  >
                    <ImgPh ar={[3,4]} />
                    <div title={f.public ? "Public" : "Private"} style={{
                      position:"absolute", top:3, right:3,
                      width:14, height:14, borderRadius:"50%",
                      background: f.public ? "rgba(47,106,85,0.92)" : "rgba(155,58,43,0.92)",
                      color:"white", fontSize:8,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      boxShadow:"0 0 0 1.5px rgba(255,255,255,0.85)"
                    }}>{f.public ? "🌐" : "🔒"}</div>
                    <div className="mono-sm" style={{
                      marginTop:3, fontSize: compact ? 9 : 10, color:"var(--mute)",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>{f.name}</div>
                  </div>
                ))}
                {dragEnabled && stageFiles.length === 0 && (
                  <div style={{
                    width: thumbW, aspectRatio:"3/4",
                    border:"1.5px dashed var(--rule-2)", borderRadius:4,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"var(--mute)", fontSize:11
                  }}>drop here</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============== Standalone page (endpoint) ==============
// Mounted at /commissions/:id/lifecycle — used primarily on mobile when user taps
// "View lifecycle" on the detail page. On desktop, the same data is embedded
// inline in the detail page, so this URL is mostly hit via deep-link / bookmark.
function LifecycleVertical() {
  const [showAll, setShowAll] = React.useState(true);
  return (
    <div className="wf">
      <NotionTop crumbs={["Banzhi & Shouza", "Lifecycle"]}>
        <LifecycleViewToggle showAll={showAll} setShowAll={setShowAll} />
        <button className="btn sm">+ stage</button>
      </NotionTop>
      <div style={{padding:"20px 32px", flex:1, overflow:"auto"}}>
        <div className="row" style={{justifyContent:"space-between", alignItems:"baseline", marginBottom:14}}>
          <h1 style={{fontSize:24, margin:0}}>Lifecycle</h1>
          <span className="mono-sm muted">drag files between stages</span>
        </div>
        <LifecycleStagesList showAll={showAll} onShowAllChange={setShowAll} dragEnabled editable />
      </div>
      <Note style={{top: 70, right: 32}}>standalone endpoint · same component as inline detail view</Note>
    </div>
  );
}

Object.assign(window, { LifecycleStagesList, LifecycleViewToggle, LifecycleVertical });
