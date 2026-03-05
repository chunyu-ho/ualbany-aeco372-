import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Test route
  app.get("/api/test", (req, res) => {
    res.json({ status: "alive", timestamp: new Date().toISOString() });
  });

  // API routes
  app.get("/api/inflation", async (req, res) => {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "FRED_API_KEY is not configured. Please add it to your environment variables." });
    }

    try {
      // CPIAUCSL is the Consumer Price Index for All Urban Consumers: All Items
      const response = await axios.get(`https://api.stlouisfed.org/fred/series/observations`, {
        params: {
          series_id: "CPIAUCSL",
          api_key: apiKey,
          file_type: "json",
          observation_start: "1913-01-01", // Earliest available
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching FRED data:", error.message);
      res.status(500).json({ error: "Failed to fetch data from FRED API" });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";
  console.log(`Starting server in ${isProd ? "production" : "development"} mode`);

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware loaded");
  } else {
    app.use(express.static("dist"));
    console.log("Serving static files from dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
