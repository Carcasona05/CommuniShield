import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendOtpEmail = async (to: string, otp: string) => {
  const from = process.env.EMAIL_FROM || "CommuniShield <noreply@communishield.com>";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0;padding:0;background-color:#F5F8FC;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F8FC;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E7ECF3;overflow:hidden;">
              <tr>
                <td style="background-color:#294880;padding:28px 32px;text-align:center;">
                  <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;">CommuniShield</h1>
                  <p style="margin:6px 0 0;color:#BFD4FF;font-size:13px;">Community Safety Platform</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 32px 20px;text-align:center;">
                  <div style="width:60px;height:60px;border-radius:30px;background-color:#EAF2FF;margin:0 auto 20px;line-height:60px;">
                    <span style="font-size:28px;">&#128274;</span>
                  </div>
                  <h2 style="margin:0 0 8px;color:#16233A;font-size:20px;font-weight:700;">Password Reset OTP</h2>
                  <p style="margin:0 0 24px;color:#5D6F92;font-size:14px;line-height:22px;">
                    Use the code below to reset your password. This code expires in <strong>10 minutes</strong>.
                  </p>
                  <div style="background-color:#F7F9FD;border:1px solid #E4EAF3;border-radius:12px;padding:18px 24px;margin-bottom:24px;">
                    <span style="font-size:32px;font-weight:700;color:#294880;letter-spacing:8px;">${otp}</span>
                  </div>
                  <p style="margin:0;color:#5D6F92;font-size:13px;line-height:20px;">
                    If you did not request a password reset, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background-color:#F7F9FD;padding:18px 32px;border-top:1px solid #E7ECF3;text-align:center;">
                  <p style="margin:0;color:#7A8BA8;font-size:12px;">
                    &copy; ${new Date().getFullYear()} CommuniShield. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "CommuniShield - Password Reset Code",
    html,
  });
};
