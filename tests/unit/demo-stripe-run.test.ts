import { describe, expect, it } from "vitest";
import { createDemoStripeRun } from "../../src/application/demo-stripe-run.js";

describe("demo Stripe run", () => {
  it("completes the repeatable Team B golden path", async () => {
    const run = createDemoStripeRun();
    expect(run.state()).toBe("READY");
    run.injectFault();
    expect((await run.inspect()).unitAmount).toBe(12900);
    expect(await run.recover()).toBe("COMMITTED");
    expect(await run.verify()).toBe(true);
    expect(run.state()).toBe("VERIFIED");
  });

  it("requires reset between demo runs", async () => {
    const run = createDemoStripeRun();
    run.injectFault();
    await run.inspect();
    await run.recover();
    await run.verify();
    expect(() => run.injectFault()).toThrow("reset");
    run.reset();
    run.injectFault();
    expect((await run.inspect()).unitAmount).toBe(12900);
  });
});
