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

    this.fromAddress = process.env.SMTP_FROM || `no-reply@${process.env.APP_DOMAIN || 'oron.com'}`;
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

    const subject = `Your Facility Admin Account for ${facilityName}`;
    const text = `Hello ${firstName},\n\nYour facility admin account has been created for ${facilityName}.\n\nEmail: ${email}\nPassword: ${password}\n\nPlease sign in and change your password immediately.\n\nRegards,\nOron Health`;
    const html = `<p>Hello ${firstName},</p><p>Your facility admin account has been created for <strong>${facilityName}</strong>.</p><p><strong>Email:</strong> ${email}<br/><strong>Password:</strong> ${password}</p><p>Please sign in and change your password immediately.</p><p>Regards,<br/>Oron Health</p>`;

    try {
      this.logger.log(`Sending email to ${email} from ${this.fromAddress}`);
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Email sent successfully to ${email}. Message ID: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send facility admin email to ${email}`, error as any);
      throw new InternalServerErrorException('Failed to send facility admin credentials email');
    }
  }
}
