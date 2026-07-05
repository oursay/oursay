// AWS SES v2 adapter. Region comes from config; credentials resolve via the standard AWS provider
// chain (env / shared config / instance role). Never logs message bodies.

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { MailAdapter, MailMessage } from "../mailer.js";

export class SesMailAdapter implements MailAdapter {
  readonly vendor = "ses" as const;
  private readonly client: SESv2Client;

  constructor(
    private readonly from: string,
    region: string,
  ) {
    this.client = new SESv2Client({ region });
  }

  async send(msg: MailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [msg.to] },
        Content: {
          Simple: {
            Subject: { Data: msg.subject },
            Body: {
              Text: { Data: msg.text },
              ...(msg.html ? { Html: { Data: msg.html } } : {}),
            },
          },
        },
      }),
    );
  }
}
