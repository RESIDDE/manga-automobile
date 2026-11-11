const fs = require('fs');
let code = fs.readFileSync('src/pages/RepairsMaintenance.tsx', 'utf8');

code = code.replace(
  /<Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-foreground\/10 hover:text-foreground text-muted-foreground transition-all" onClick=\{\(\) => openEdit\(r\)\}>[\s\S]*?<\/Button>\s*<Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-amber-500\/10 hover:text-amber-500 text-muted-foreground transition-all" onClick=\{\(\) => setQrId\(r\.id\)\}>[\s\S]*?<\/Button>/g,
  `{hasEdit && (<><Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-foreground/10 hover:text-foreground text-muted-foreground transition-all" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button><Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground transition-all" onClick={() => setQrId(r.id)}><QrCode className="h-3.5 w-3.5 mr-1.5" /> QR Sign</Button></>)}`
);

code = code.replace(
  /<Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive\/10 text-muted-foreground hover:text-destructive transition-all" onClick=\{\(\) => \{ if\(!*window\.confirm\("Are you sure\?"\)\)* deleteMut\.mutate\(r\.id\);* \}\}>[\s\S]*?<\/Button>/g,
  `{hasEdit && (<Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" onClick={() => { if(window.confirm("Are you sure?")) deleteMut.mutate(r.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>)}`
);

// We made a small regex fix for the delete button in case `window.confirm` had different spacing

code = code.replace(
  /<div className="flex justify-end mt-4">\s*<Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg group" onClick=\{\(\) => \{ setHistoryOpen\(false\); openEdit\(h\); \}\}>[\s\S]*?<\/Button>\s*<\/div>/g,
  `{hasEdit && (<div className="flex justify-end mt-4"><Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg group" onClick={() => { setHistoryOpen(false); openEdit(h); }}>View Details <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" /></Button></div>)}`
);

fs.writeFileSync('src/pages/RepairsMaintenance.tsx', code);
console.log("Successfully edited RepairsMaintenance.tsx");
