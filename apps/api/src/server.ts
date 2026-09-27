import { app, checkDatabaseConnection } from "./app.js";
import { env } from "./env.js";

async function start() {
  await checkDatabaseConnection();
  app.listen(env.API_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.API_PORT}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("API startup validation failed:", error);
  process.exit(1);
});
