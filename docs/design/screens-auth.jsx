// Login / Auth gate variants
const { useState: useStateA } = React;

function LoginPublicGate() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Heiyao's commissions"]}>
        <span className="mono-sm">read-only</span>
      </NotionTop>
      <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24}}>
        <div style={{width: 360}}>
          <div className="page-title" style={{padding:0, marginBottom: 16}}>
            <div className="icon">🔒</div>
            <h1 style={{fontSize:28}}>Sign in to edit</h1>
            <div className="sub">Browsing is open. Editing, adding, and exporting require the admin password.</div>
          </div>
          <div className="col gap-8" style={{marginTop: 16}}>
            <div>
              <span className="label">Password</span>
              <input className="field lg" type="password" placeholder="••••••••" />
            </div>
            <div className="row" style={{justifyContent:"space-between", marginTop: 4}}>
              <label className="row gap-4 mono-sm" style={{cursor:"pointer"}}>
                <input type="checkbox" defaultChecked /> remember on this device
              </label>
              <span className="mono-sm muted">forgot?</span>
            </div>
            <button className="btn primary" style={{justifyContent:"center", marginTop: 8, padding:"10px"}}>
              Unlock edit access
            </button>
            <div className="row" style={{justifyContent:"center", marginTop:8}}>
              <span className="mono-sm muted">or</span>
            </div>
            <button className="btn" style={{justifyContent:"center"}}>Continue browsing →</button>
          </div>
        </div>
      </div>
      <Note style={{top:60, right:32}}>public read · login = edit only</Note>
    </div>
  );
}

function LoginInline() {
  return (
    <div className="wf">
      <NotionTop crumbs={["Gallery"]}>
        <button className="btn sm primary">🔓 Sign in</button>
      </NotionTop>
      <div style={{flex:1, position:"relative", overflow:"hidden"}}>
        {/* faded gallery preview behind */}
        <div style={{filter:"blur(0px) opacity(0.5)", pointerEvents:"none"}}>
          <FaGallery items={COMMISSIONS.slice(0,8)} columns={4} showTitles={false} compact />
        </div>
        {/* popover */}
        <div style={{
          position:"absolute", top: 48, right: 32,
          width: 320, background: "var(--paper)",
          border: "1px solid var(--rule-2)", borderRadius: 8,
          boxShadow: "var(--shadow-2)",
          padding: 16
        }}>
          <div className="row" style={{justifyContent:"space-between", marginBottom:8}}>
            <strong>Sign in to edit</strong>
            <span className="iconbtn">✕</span>
          </div>
          <div className="mono-sm muted" style={{marginBottom:10}}>
            Browsing stays public — sign in only to add, edit or export.
          </div>
          <input className="field" type="password" placeholder="admin password" />
          <div className="row gap-4 mono-sm" style={{marginTop:6}}>
            <input type="checkbox" id="rm" defaultChecked />
            <label htmlFor="rm">stay signed in 30 days</label>
          </div>
          <button className="btn primary" style={{width:"100%", justifyContent:"center", marginTop:10}}>
            Unlock
          </button>
        </div>
        <Note style={{top: 220, right: 360}}>inline popover · keeps gallery context</Note>
      </div>
    </div>
  );
}

Object.assign(window, { LoginPublicGate, LoginInline });
