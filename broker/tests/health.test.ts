/**
 * Tests for the /health endpoint of the GridNexus broker.
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/index.js";

describe("GET /health", () => {
  it("should return 200 with {status: 'ok'}", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("should return application/json content type", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});
