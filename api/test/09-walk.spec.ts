// The dev walk harness is served (NODE_ENV != production) as plain static files. We only smoke-test
// that the routes resolve and serve the right content types — the page itself is exercised by hand.

import { expect } from "chai";
import { resetWorld, type World } from "./helpers/world.js";

describe("09 walk: dev harness static routes", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("serves the walk page as HTML", async () => {
    const res = await w.app.inject({ method: "GET", url: "/walk" });
    expect(res.statusCode).to.equal(200);
    expect(res.headers["content-type"]).to.contain("text/html");
    expect(res.body).to.contain("OurSay — account walk");
  });

  it("serves the app module and the vendored webauthn bundle as JS", async () => {
    const app = await w.app.inject({ method: "GET", url: "/walk/app.js" });
    expect(app.statusCode).to.equal(200);
    expect(app.headers["content-type"]).to.contain("javascript");

    const lib = await w.app.inject({ method: "GET", url: "/walk/simplewebauthn-browser.js" });
    expect(lib.statusCode).to.equal(200);
    expect(lib.headers["content-type"]).to.contain("javascript");
    expect(lib.body).to.contain("SimpleWebAuthnBrowser");
  });
});
