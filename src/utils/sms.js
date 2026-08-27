/**
 * backend/src/utils/sms.js — Real SMS OTP Dispatcher
 * 
 * Supports multiple SMS Gateway Providers:
 * 1. Fast2SMS (India)
 * 2. Twilio (Global / International)
 * 3. MSG91 (India)
 * 4. 2Factor (India)
 */
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

export async function sendSmsOtp(phone, otp) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');

  // 1. Fast2SMS Integration (India)
  if (
    process.env.FAST2SMS_API_KEY &&
    process.env.FAST2SMS_API_KEY.trim() !== '' &&
    !process.env.FAST2SMS_API_KEY.includes('your_')
  ) {
    try {
      const numbers = cleanPhone.slice(-10);
      const msg = `Your TheCustomNest OTP code is ${otp}. Valid for 10 minutes.`;

      // Attempt 1: Fast2SMS Quick SMS Route
      let res = await fetch(
        `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&route=q&message=${encodeURIComponent(
          msg
        )}&language=english&flash=0&numbers=${numbers}`
      );
      let data = await res.json().catch(() => ({}));

      if (!data.return) {
        // Attempt 2: Fast2SMS OTP Route
        res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers,
          }),
        });
        data = await res.json().catch(() => ({}));
      }

      if (data.return) {
        console.log(`[SMS] Real OTP sent via Fast2SMS to ${numbers}`);
        return { provider: 'fast2sms', status: 'sent' };
      } else {
        console.error('[SMS Fast2SMS Gateway Notice]:', data.message || data);
      }
    } catch (fast2smsErr) {
      console.error('[SMS Fast2SMS Error]:', fast2smsErr.message);
    }
  }

  // 2. Twilio Integration
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER &&
    !process.env.TWILIO_ACCOUNT_SID.includes('your_')
  ) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = process.env.TWILIO_PHONE_NUMBER;
      const targetPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;

      const body = new URLSearchParams({
        To: targetPhone,
        From: fromPhone,
        Body: `Your TheCustomNest OTP code is: ${otp}. Valid for 10 minutes. Do not share it with anyone.`,
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[SMS Twilio Error]:', errText);
      } else {
        console.log(`[SMS] Real OTP sent via Twilio to ${targetPhone}`);
        return { provider: 'twilio', status: 'sent' };
      }
    } catch (twilioErr) {
      console.error('[SMS Twilio Error]:', twilioErr.message);
    }
  }

  // 3. MSG91 Integration (India)
  if (
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_TEMPLATE_ID &&
    !process.env.MSG91_AUTH_KEY.includes('your_')
  ) {
    try {
      const numbers = cleanPhone.replace(/[^\d]/g, '');
      const url = `https://control.msg91.com/api/v5/otp?template_id=${process.env.MSG91_TEMPLATE_ID}&mobile=${numbers}&otp=${otp}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'authkey': process.env.MSG91_AUTH_KEY,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.type === 'error') {
        console.error('[SMS MSG91 Error]:', data);
      } else {
        console.log(`[SMS] Real OTP sent via MSG91 to ${numbers}`);
        return { provider: 'msg91', status: 'sent' };
      }
    } catch (msg91Err) {
      console.error('[SMS MSG91 Error]:', msg91Err.message);
    }
  }

  // 4. 2Factor Integration (India)
  if (process.env.TWOFACTOR_API_KEY && !process.env.TWOFACTOR_API_KEY.includes('your_')) {
    try {
      const numbers = cleanPhone.replace(/[^\d]/g, '');
      const apiKey = process.env.TWOFACTOR_API_KEY;
      const url = `https://2factor.in/API/V1/${apiKey}/SMS/${numbers}/${otp}/AUTOGEN`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.Status !== 'Success') {
        console.error('[SMS 2Factor Error]:', data);
      } else {
        console.log(`[SMS] Real OTP sent via 2Factor to ${numbers}`);
        return { provider: '2factor', status: 'sent' };
      }
    } catch (twoFactorErr) {
      console.error('[SMS 2Factor Error]:', twoFactorErr.message);
    }
  }

  console.warn(`[SMS] No active real SMS Gateway API key configured in .env. Falling back to simulated OTP mode.`);
  return { provider: 'none', status: 'simulated' };
}
