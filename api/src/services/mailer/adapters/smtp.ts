// SMTP adapter via nodemailer. Credentials come from config (env SMTP_*); never logged.

import nodemailer, { type Transporter } from "nodemailer";
import type { MailAdapter, MailMessage } from "../mailer.js";

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export class SmtpMailAdapter implements MailAdapter {
  readonly vendor = "smtp" as const;
  private readonly transport: Transporter;

  constructor(
    private readonly from: string,
    settings: SmtpSettings,
  ) {
    if (!settings.host) throw new Error("SmtpMailAdapter requires SMTP_HOST");
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
    });
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
  }
}
