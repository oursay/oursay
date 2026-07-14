import { expect } from "chai";
import {
  buildOtpMailTemplate,
  otpContinueUrl,
  otpLoginContinueUrl,
} from "../src/services/mailer/otp-mail-template.js";

describe("39 otp mail template", () => {
  it("renders subject, text, and html with the code for each purpose", () => {
    for (const purpose of ["registration", "recovery", "login"] as const) {
      const mail = buildOtpMailTemplate({
        purpose,
        code: "847291",
        expiresInMinutes: 10,
      });
      expect(mail.subject).to.match(/OurSay/);
      expect(mail.text).to.include("847291");
      expect(mail.text).to.include("expires in 10 minutes");
      expect(mail.html).to.include("847291");
      expect(mail.html).to.include("OurSay");
      expect(mail.html).to.include("expires in 10 minutes");
    }
  });

  it("includes a continue link only when provided", () => {
    const withLink = buildOtpMailTemplate({
      purpose: "login",
      code: "111222",
      expiresInMinutes: 10,
      continueUrl: "http://localhost:3000/?otpEmail=user%40example.com",
    });
    expect(withLink.text).to.include("Continue on OurSay:");
    expect(withLink.text).to.include("otpEmail=user%40example.com");
    expect(withLink.html).to.include("Open OurSay to enter your code");
    expect(withLink.html).to.include("otpEmail=user%40example.com");

    const without = buildOtpMailTemplate({
      purpose: "registration",
      code: "111222",
      expiresInMinutes: 10,
    });
    expect(without.text).to.not.include("Continue on OurSay:");
    expect(without.html).to.not.include("Open OurSay to enter your code");
  });

  it("builds a login deep-link that carries otpEmail", () => {
    const url = otpLoginContinueUrl("http://localhost:3000", "Alice@Example.com");
    expect(url).to.equal("http://localhost:3000/?otpEmail=Alice%40Example.com");
  });

  it("builds a registration deep-link with otpPurpose", () => {
    const url = otpContinueUrl("http://localhost:3000", "new@example.com", "registration");
    expect(url).to.equal(
      "http://localhost:3000/?otpEmail=new%40example.com&otpPurpose=registration",
    );
  });
});
