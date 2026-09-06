import { test, expect } from "@playwright/test";

// Exercise the real Socket.IO client with a controlled Engine.IO peer.
test("negotiations reconnect after transport loss without reloading", async ({ page }) => {
  let connections = 0;
  let disconnect: (() => void) | undefined;
  await page.routeWebSocket(/socket\.io/, socket => {
    connections++;
    socket.send('0{"sid":"test-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
    socket.onMessage(message => {
      if (String(message).startsWith("40/negotiate")) {
        socket.send('40/negotiate,{"sid":"test-observer"}');
      }
    });
    disconnect = () => socket.close();
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /Continue as Guest/i }).click();
  await page.getByRole("link", { name: "Negotiations", exact: true }).click();
  const badge = page.getByLabel("WebSocket status", { exact: true });
  await expect(badge).toHaveText("WS Connected");
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  disconnect!();
  await expect(badge).toHaveText(/Disconnected|Connecting/);
  await expect(badge).toHaveText("WS Connected", { timeout: 15000 });
  expect(connections).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});
