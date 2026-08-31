/**
 * Tests for the /health endpoint of the GridNexus broker.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";

describe("GET /health", () => {
  it("should expose a dependency-independent liveness probe", async () => {
    const response = await request(app).get("/live");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("should return application/json content type", async () => {
    const response = await request(app).get("/live");
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});
