import { serve } from "@hono/node-server";
import { createApp } from "./server.js";
import { getConfig, loadEnvFile } from "./env.js";

loadEnvFile();
const config = getConfig();
const app = createApp({ config });

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Agente OC SAP escuchando en http://localhost:${info.port}`);
    console.log(`Modelo configurado: ${config.modelId}`);
    if (!config.opencodeApiKey) {
      console.log("OPENCODE_API_KEY vacía: /api/health funciona, /api/chat responderá 503.");
    }
  },
);
