import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter?: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly fromAddress: string;
  private readonly enabled: boolean;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const configuredFrom = process.env.SMTP_FROM;
    const smtpHost = (host || '').toLowerCase();
    const isGmailSmtp = smtpHost.includes('gmail');
    const configuredFromDomain = configuredFrom?.split('@')[1]?.toLowerCase();
    const smtpUserDomain = user?.split('@')[1]?.toLowerCase();

    // With Gmail SMTP, using a different "from" domain can pass sendMail
    // but silently fail delivery (DMARC/SPF alignment issues).
    const shouldForceSmtpUserAsFrom =
      Boolean(isGmailSmtp && user && configuredFrom && configuredFromDomain !== smtpUserDomain);

    if (shouldForceSmtpUserAsFrom) {
      this.logger.warn(
        `SMTP_FROM (${configuredFrom}) does not match SMTP_USER domain for Gmail SMTP. Using SMTP_USER as from address.`,
      );
    }

    this.fromAddress =
      (shouldForceSmtpUserAsFrom ? user : configuredFrom) ||
      user ||
      `no-reply@${process.env.APP_DOMAIN || 'oron.com'}`;
    this.enabled = Boolean(host && user && pass);

    this.logger.log(`SMTP Configuration - Host: ${host}, Port: ${port}, User: ${user ? 'set' : 'not set'}, From: ${this.fromAddress}`);

    if (!this.enabled) {
      this.logger.warn('SMTP is not configured. Email delivery will be skipped.');
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    this.logger.log('Email transporter created successfully');
  }

  async sendFacilityAdminCredentials(
    email: string,
    firstName: string,
    password: string,
    facilityName: string,
  ) {
    this.logger.log(`Attempting to send facility admin email to ${email}, enabled: ${this.enabled}`);

    if (!this.enabled || !this.transporter) {
      this.logger.warn(`Skipping facility admin email send because SMTP is not configured: ${email}`);
      return;
    }

    const subject = `Your Oron SeniorCare Account for ${facilityName}`;
    const text = `Hello ${firstName},\n\nYour account has been created for Oron SeniorCare.\n\nEmail: ${email}\nPassword: ${password}\n\nPlease sign in with above credentials\n\nRegards,\nOron Health`;
    const html = `<p>Hello ${firstName},</p><p>Your account has been created for Oron SeniorCare.</p><p><strong>Email:</strong> ${email}<br/><strong>Password:</strong> ${password}</p><p>Please sign in with above credentials</p><p>Regards,<br/>Oron Health</p>`;

    try {
      this.logger.log(`Sending email to ${email} from ${this.fromAddress}`);
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(
        `Email sent. Message ID: ${info.messageId}, accepted: ${(info.accepted || []).join(',')}, rejected: ${(info.rejected || []).join(',')}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send facility admin email to ${email}`, error as any);
      throw new InternalServerErrorException('Failed to send facility admin credentials email');
    }
  }

  async sendSetPasswordLink(email: string, firstName: string, setPasswordUrl: string, contextName?: string) {
    this.logger.log(`Attempting to send set-password email to ${email}, enabled: ${this.enabled}`);

    if (!this.enabled || !this.transporter) {
      this.logger.warn(`Skipping set-password email send because SMTP is not configured: ${email}`);
      return;
    }

    const subject = contextName
      ? `Set your Oron SeniorCare password for ${contextName}`
      : 'Set your Oron SeniorCare password';

    const text =
      `Hello ${firstName},\n\n` +
      `Your Oron SeniorCare account has been created.\n` +
      `To set your password, open this link:\n${setPasswordUrl}\n` +
      `If you did not expect this email, you can ignore it.\n` +
      `Regards,\nOron Health\n\n` +
      `5539 N Mesa\nEl Paso, TX 79912`;

    const headline = contextName ? `Your ${contextName} account is ready` : 'Your account is ready';

    let logoUrl = (process.env.EMAIL_LOGO_URL || '').trim();
    if ((logoUrl.startsWith('"') && logoUrl.endsWith('"')) || (logoUrl.startsWith("'") && logoUrl.endsWith("'"))) {
      logoUrl = logoUrl.slice(1, -1).trim();
    }

    const escapeHtmlAttr = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
    const logoImgSrc = logoUrl ? escapeHtmlAttr(logoUrl) : '';
    const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting" />
  <title>Oron Health</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f1f5f9;
  font-family:Arial, Helvetica, sans-serif;
">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9; padding:40px 0;">
    <tr>
      <td align="center">

        <!-- Main Container -->
        <table width="640" cellpadding="0" cellspacing="0" border="0" style="
          width:640px;
          max-width:640px;
        ">

          <!-- Header -->
          <tr>
            <td style="
              background:linear-gradient(135deg,#0E649B 0%, #8E44AD 100%);
              border-radius:24px 24px 0 0;
              padding:32px 36px;
            ">

              <table width="100%">
                <tr>

                  <!-- Logo -->
                  <td align="left" valign="middle">

                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>

                        <td style="
                          width:54px;
                          height:54px;
                          background:#ffffff;
                          border-radius:16px;
                          overflow:hidden;
                          text-align:center;
                          vertical-align:middle;
                          box-shadow:0 8px 20px rgba(0,0,0,0.15);
                        ">

                          ${logoImgSrc
        ? `
                            <img
                              src="${logoImgSrc}"
                              width="56"
                              height="56"
                              alt="Oron"
                              style="
                                display:block;
                                width:54px;
                                height:54px;
                              "
                            />
                          `
        : ''
      }

                        </td>

                        <td style="padding-left:16px;">

                          <div style="
                            color:#ffffff;
                            font-size:24px;
                            font-weight:700;
                            letter-spacing:0.4px;
                          ">
                            ORON Care
                          </div>

                          <div style="
                            color:rgba(255,255,255,0.85);
                            font-size:13px;
                            margin-top:4px;
                          ">
                            SeniorCare Platform
                          </div>

                        </td>

                      </tr>
                    </table>

                  </td>

                </tr>
              </table>

            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="
              background:#ffffff;
              padding:48px 40px;
              border-left:1px solid #e2e8f0;
              border-right:1px solid #e2e8f0;
            ">

              <!-- Badge -->
              <div style="margin-bottom:24px;">

                <span style="
                  background:#dcfce7;
                  color:#166534;
                  padding:8px 14px;
                  border-radius:999px;
                  font-size:12px;
                  font-weight:700;
                  letter-spacing:0.3px;
                  text-transform:uppercase;
                ">
                  Account Setup
                </span>

              </div>

              <!-- Heading -->
              <h1 style="
                margin:0;
                font-size:34px;
                line-height:42px;
                color:#0f172a;
                font-weight:700;
              ">
                ${headline}
              </h1>

              <!-- Intro -->
              <p style="
                margin:24px 0 0 0;
                font-size:16px;
                line-height:28px;
                color:#475569;
              ">
                Hello <strong>${firstName}</strong>,
              </p>

              <p style="
                margin:16px 0 0 0;
                font-size:16px;
                line-height:28px;
                color:#475569;
              ">
                Your Oron SeniorCare account has been successfully created.
                To securely access your dashboard and begin managing your facility,
                please set your password using the button below.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;">
                <tr>
                  <td align="center" bgcolor="#16a34a" style="
                    border-radius:14px;
                    box-shadow:0 10px 24px rgba(22,163,74,0.28);
                  ">

                    <a
                      href="${setPasswordUrl}"
                      target="_blank"
                      style="
                        display:inline-block;
                        padding:16px 28px;
                        color:#ffffff;
                        font-size:15px;
                        font-weight:700;
                        text-decoration:none;
                        border-radius:14px;
                      "
                    >
                      Set Your Password
                    </a>

                  </td>
                </tr>
              </table>

              <!-- Secondary Info -->
              <p style="
                margin:20px 0 0 0;
                font-size:14px;
                line-height:24px;
                color:#64748b;
              ">
                For security purposes, this link may expire after some time.
                If the button above does not work, copy and paste the following URL into your browser:
              </p>

              <!-- Divider -->
              <div style="
                height:1px;
                background:#e2e8f0;
                margin:20px 0;
              "></div>

              <!-- Footer Text -->
              <p style="
                margin:0;
                font-size:13px;
                line-height:24px;
                color:#64748b;
              ">
                If you did not request this email, you can safely ignore it.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <!-- Footer -->
<tr>
  <td style="
    background:#f8fafc;
    border:1px solid #e2e8f0;
    border-top:none;
    border-radius:0 0 24px 24px;
    padding:28px 40px;
    text-align:center;
  ">

    <!-- Divider -->
    <div style="
      height:1px;
      background:#e2e8f0;
      margin-bottom:22px;
    "></div>

    <!-- Address -->
    <div style="
      font-size:13px;
      line-height:22px;
      color:#64748b;
      margin-bottom:18px;
    ">
      5539 N Mesa<br/>
      El Paso, TX 79912
    </div>

    <!-- Copyright -->
    <div style="
      font-size:13px;
      color:#94a3b8;
    ">
      © ORON Care. All rights reserved.
    </div>

  </td>
</tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

    try {
      if (logoUrl) {
        this.logger.log('Set-password email: using EMAIL_LOGO_URL for header image');
      } else {
        this.logger.warn('EMAIL_LOGO_URL is not set; password email will show no logo image');
      }
      this.logger.log(`Sending set-password email to ${email} from ${this.fromAddress}`);
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(
        `Email sent. Message ID: ${info.messageId}, accepted: ${(info.accepted || []).join(',')}, rejected: ${(info.rejected || []).join(',')}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send set-password email to ${email}`, error as any);
      throw new InternalServerErrorException('Failed to send set-password email');
    }
  }
}
