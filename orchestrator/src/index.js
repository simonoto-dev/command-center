import { createServer } from './server.js';

const PORT = process.env.PORT || 7070;
const DB_PATH = process.env.DB_PATH || 'orchestrator.db';

const { server } = createServer({ dbPath: DB_PATH });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Team Simonoto orchestrator listening on 0.0.0.0:${PORT}`);
});
