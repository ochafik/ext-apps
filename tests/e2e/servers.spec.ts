import { test, expect } from "@playwright/test";

// Server configurations
const SERVERS = [
  { key: "basic-react", index: 0, name: "Basic MCP App Server (React-based)" },
  {
    key: "basic-vanillajs",
    index: 1,
    name: "Basic MCP App Server (Vanilla JS)",
  },
  { key: "budget-allocator", index: 2, name: "Budget Allocator Server" },
  { key: "cohort-heatmap", index: 3, name: "Cohort Heatmap Server" },
  {
    key: "customer-segmentation",
    index: 4,
    name: "Customer Segmentation Server",
  },
  { key: "scenario-modeler", index: 5, name: "SaaS Scenario Modeler" },
  { key: "system-monitor", index: 6, name: "System Monitor Server" },
  { key: "threejs", index: 7, name: "Three.js Server" },
];

test.describe("Host UI", () => {
  // Increase timeout for iframe-heavy tests
  test.setTimeout(90000);
  test("initial state shows controls", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("label:has-text('Server')")).toBeVisible();
    await expect(page.locator("label:has-text('Tool')")).toBeVisible();
    await expect(page.locator('button:has-text("Call Tool")')).toBeVisible();
  });

  test("screenshot of initial state", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("host-initial.png");
  });
});

// Generate tests for each server
for (const server of SERVERS) {
  test.describe(`${server.name}`, () => {
    test.setTimeout(90000);

    test(`loads app UI`, async ({ page }) => {
      await page.goto("/");

      // Select server
      const serverSelect = page.locator("select").first();
      await serverSelect.selectOption({ index: server.index });

      // Click Call Tool
      await page.click('button:has-text("Call Tool")');

      // Wait for outer iframe
      await page.waitForSelector("iframe", { timeout: 10000 });

      // Wait for content to load (generous timeout for nested iframes)
      await page.waitForTimeout(5000);

      // Verify iframe structure exists
      const outerFrame = page.frameLocator("iframe").first();
      await expect(outerFrame.locator("iframe")).toBeVisible({
        timeout: 10000,
      });
    });

    test(`screenshot matches golden`, async ({ page }) => {
      await page.goto("/");

      // Select server
      const serverSelect = page.locator("select").first();
      await serverSelect.selectOption({ index: server.index });

      // Click Call Tool
      await page.click('button:has-text("Call Tool")');

      // Wait for app to fully load
      await page.waitForSelector("iframe", { timeout: 10000 });
      await page.waitForTimeout(6000); // Extra time for nested iframe content

      // Take screenshot
      await expect(page).toHaveScreenshot(`${server.key}.png`, {
        maxDiffPixelRatio: 0.1, // 10% tolerance for dynamic content
        timeout: 10000,
      });
    });
  });
}
