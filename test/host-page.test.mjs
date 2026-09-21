import { describe, expect, it } from "vitest";
import { renderHostPage } from "../src/commands/dev.mjs";

/**
 * The dev mock host page must always ship the full chrome surface: the
 * rendered header/footer elements plus the routeChrome handler and the
 * FAMILY:EVENT push, so `family dev` behaves like the real host runtime.
 */

describe("renderHostPage chrome surface", () => {
  const html = renderHostPage({ appUrl: "/app/src/index.html", shareBps: 1000 });

  it("renders the chrome header and footer elements", () => {
    for (const id of [
      "chromehead",
      "chromeback",
      "chrometitle",
      "chromesubtitle",
      "chromeprogress",
      "chromefoot",
      "chromemain",
      "chromesecondary",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("handles every chrome namespace method in routeChrome", () => {
    // Literal string matches.
    for (const method of [
      "chrome.ready",
      "chrome.close",
      "chrome.theme.get",
      "chrome.header.setParams",
      "chrome.backButton.show",
      "chrome.backButton.hide",
    ]) {
      expect(html).toContain(`"${method}"`);
    }
    // Buttons dispatch on the slot prefix...
    expect(html).toContain('"chrome.mainButton"');
    expect(html).toContain('"chrome.secondaryButton"');
    // ...plus the shared action switch.
    for (const action of [
      "setParams",
      "show",
      "hide",
      "enable",
      "disable",
      "showProgress",
      "hideProgress",
    ]) {
      expect(html).toContain(`case "${action}"`);
    }
  });

  it("handles haptics by namespace prefix", () => {
    expect(html).toContain('"chrome.haptic."');
  });

  it("wires chrome state into the reply bridge and pushes FAMILY:EVENT clicks", () => {
    expect(html).toContain("routeChrome(method, args)");
    expect(html).toContain('type: "FAMILY:EVENT"');
    expect(html).toContain("mainButtonClicked");
    expect(html).toContain("secondaryButtonClicked");
    expect(html).toContain("backButtonClicked");
  });

  it("keeps the core family-sdk routes intact", () => {
    for (const method of [
      '"init"',
      '"getContext"',
      '"identity.getMe"',
      '"payments.charge"',
      '"storage.upload"',
      '"ui.toast"',
      '"ui.modal"',
      '"store.get"',
      '"store.set"',
    ]) {
      expect(html).toContain(`case ${method}`);
    }
  });
});
