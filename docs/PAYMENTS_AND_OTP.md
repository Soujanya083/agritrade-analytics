# Real e-mail OTP and real (test-mode) payments

Two of the weaknesses were "no money actually moves" and "the demo OTP is shown in the API response".
This page says exactly what you can make real, how, and what you must still call a demo.

## 1. E-mail OTP (about 15 minutes)

The server now sends the verification code by e-mail when a provider is configured, and **never returns
the code in the API response** in that case. With nothing configured it stays in labelled demo mode.

Pick one provider (both have free tiers; check their pricing pages for the current daily limits):

**Brevo** (easiest for sending to any address)
1. Create an account, go to *SMTP & API* and create an **API key**.
2. Under *Senders*, add and verify the e-mail address you will send from (a normal Gmail address works).
3. On the server (Render dashboard, or `server/.env` locally) set:
   `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=...`, `OTP_FROM_EMAIL=<the verified sender>`.

**Resend**
1. Create an account and an API key.
2. Resend's test sender can only deliver to your own address. To e-mail other people you must verify a domain.
3. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=...`, `OTP_FROM_EMAIL=<address on your verified domain>`.

Check it works:
- Sign up with your own second e-mail address. The mail should arrive within seconds.
- The signup response must now say `"otpDelivery": "email"` and contain **no** `otp` field.
- If the provider rejects the request the user sees "could not send the verification email" and can press *Resend OTP*; the code is never written to the logs.

What is still not proven: e-mail OTP shows the person controls an inbox, not that they are a real farmer.

## 2. Payments

| Level | What it is | Honest label |
|---|---|---|
| Manual UPI ("I have paid") | Buyer says they paid; the farmer trusts it | Demo only. Disabled automatically once Razorpay keys are set. |
| **Razorpay test mode** | The complete real flow: order creation, checkout, signature verification, with fake money | "Payment gateway integrated in test mode" |
| Razorpay live | Real money | Needs a registered business and KYC. Out of scope for a student project. |

To switch on test mode:
1. Create a Razorpay account and open the dashboard in **Test Mode**.
2. Generate **test** API keys (they start with `rzp_test_`).
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server. Redeploy.
4. Pay with the test card or test UPI details listed in Razorpay's own documentation.
5. Check that `POST /api/transactions/:id/verify-payment` marks the deal paid and that the manual "I have paid" route now answers with an error (that is the payment-bypass guard working).

In the viva say: "Payments are integrated and verified by signature in Razorpay's test mode. Moving real money needs a registered business, so the project stops there."

Never commit real keys. Test keys are less dangerous but still belong in environment variables.
