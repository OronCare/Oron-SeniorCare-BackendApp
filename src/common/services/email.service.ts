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
}
