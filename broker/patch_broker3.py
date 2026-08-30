import re

with open("src/index.ts", "r") as f:
    content = f.read()

# Replace oracle-signals with oracle/signals
content = content.replace('app.get("/api/oracle-signals",', 'app.get("/api/oracle/signals",')

# Add missing routes if they don't exist
additional_routes = """
app.get("/api/ders", async (_req: Request, res: Response): Promise<void> => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('../engine/gridnexus.db');
    const ders = db.prepare('SELECT * FROM ders').all();
    db.close();
    res.json(ders);
  } catch(e) { res.status(500).json({error: String(e)}); }
});

app.get("/api/coalitions", async (_req: Request, res: Response): Promise<void> => {
  res.json({ coalitions: [] }); // Stub
});

app.get("/api/settlements", async (_req: Request, res: Response): Promise<void> => {
  res.json([]); // Stub
});

app.get("/api/audit-events", async (_req: Request, res: Response): Promise<void> => {
  res.json({ events: [] }); // Stub
});

app.get("/api/metrics/overview", async (_req: Request, res: Response): Promise<void> => {
  res.json({ status: "ok" }); // Stub
});
"""

if "/api/ders" not in content:
    content = content.replace('const server = createServer(app);', additional_routes + '\nconst server = createServer(app);')

with open("src/index.ts", "w") as f:
    f.write(content)

print("Broker patched 3!")
