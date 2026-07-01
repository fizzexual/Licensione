// Dashboard stylesheet, served inline. Dark, glassy, purple→magenta accent.
export const CSS = `
:root{
  --bg:#0a0a0f; --bg-2:#0e0e15; --panel:#14141d; --panel-2:#191924;
  --border:#242433; --border-2:#2f2f42;
  --text:#e9e9ef; --muted:#9a9aad; --faint:#6b6b7d;
  --accent:#8b5cf6; --accent-2:#d946a8; --accent-3:#f0644b;
  --ok:#34d399; --warn:#fbbf24; --bad:#f87171; --info:#60a5fa;
  --grad:linear-gradient(120deg,var(--accent),var(--accent-2) 55%,var(--accent-3));
  --radius:14px; --shadow:0 10px 40px -12px rgba(0,0,0,.6);
  --mono:"Azeret Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:radial-gradient(1200px 700px at 80% -10%,rgba(139,92,246,.12),transparent 60%),
             radial-gradient(900px 600px at -10% 110%,rgba(217,70,168,.10),transparent 55%),var(--bg);
  color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}
.app{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
.sidebar{
  border-right:1px solid var(--border);background:linear-gradient(180deg,var(--bg-2),transparent);
  padding:22px 16px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;
}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;margin:2px 8px 22px;letter-spacing:.2px}
.brand-mark{width:28px;height:28px;border-radius:8px;background:var(--grad);display:grid;place-items:center;color:#fff;font-weight:800}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:var(--muted);font-weight:500}
.nav-item:hover{background:var(--panel);color:var(--text)}
.nav-item.active{background:var(--panel-2);color:var(--text);box-shadow:inset 0 0 0 1px var(--border-2)}
.nav-icon{width:18px;text-align:center;opacity:.85}
.sidebar-foot{margin-top:auto;color:var(--faint);font-size:12px;padding:8px}
.main{padding:34px 40px;max-width:1200px;width:100%}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:26px}
.page-head h1{font-size:24px;margin:0;letter-spacing:-.02em}
.page-head p{margin:4px 0 0;color:var(--muted)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:26px}
.card{background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow)}
.card h2{font-size:14px;margin:0 0 14px;color:var(--muted);font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.stat{position:relative;overflow:hidden}
.stat .label{color:var(--muted);font-size:12.5px;text-transform:uppercase;letter-spacing:.05em}
.stat .value{font-size:30px;font-weight:700;margin-top:8px;letter-spacing:-.02em}
.stat .sub{color:var(--faint);font-size:12px;margin-top:4px}
.stat::after{content:"";position:absolute;inset:auto -30% -60% auto;width:140px;height:140px;background:var(--grad);filter:blur(50px);opacity:.14}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:rgba(255,255,255,.015)}
.mono{font-family:var(--mono);font-size:12.5px}
.key{font-family:var(--mono);font-size:12.5px;color:var(--text)}
.muted{color:var(--muted)}.faint{color:var(--faint)}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:600;border:1px solid var(--border-2);background:var(--panel)}
.badge-ok{color:var(--ok);border-color:rgba(52,211,153,.3);background:rgba(52,211,153,.08)}
.badge-bad{color:var(--bad);border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.08)}
.badge-warn{color:var(--warn);border-color:rgba(251,191,36,.3);background:rgba(251,191,36,.08)}
.badge-info{color:var(--info);border-color:rgba(96,165,250,.3);background:rgba(96,165,250,.08)}
.badge-muted{color:var(--muted)}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:10px;border:1px solid var(--border-2);background:var(--panel-2);color:var(--text);font-weight:600;font-size:13px;cursor:pointer;transition:.15s}
.btn:hover{border-color:var(--accent);color:#fff}
.btn-primary{background:var(--grad);border:none;color:#fff}
.btn-primary:hover{filter:brightness(1.08)}
.btn-danger:hover{border-color:var(--bad);color:var(--bad)}
.btn-sm{padding:6px 11px;font-size:12px;border-radius:8px}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:600}
input,select,textarea{width:100%;padding:9px 11px;border-radius:9px;border:1px solid var(--border-2);background:var(--bg-2);color:var(--text);font-size:13px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;align-items:end}
.field{min-width:0}
.split{display:grid;grid-template-columns:1fr;gap:20px}
@media(min-width:960px){.split{grid-template-columns:1.4fr 1fr}}
pre.code{background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:14px;overflow:auto;font-family:var(--mono);font-size:12px;color:#cdd0e0;white-space:pre}
.section-gap{margin-top:26px}
.inline-form{display:inline}
.empty{padding:40px;text-align:center;color:var(--faint)}
.kv{display:grid;grid-template-columns:140px 1fr;gap:8px 16px}
.kv dt{color:var(--muted)}.kv dd{margin:0}
.chip-row{display:flex;gap:8px;flex-wrap:wrap}
`;
