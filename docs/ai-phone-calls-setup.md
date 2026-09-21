# AI phone calls: what you need to provide

TalentOS can phone a candidate with an AI recruiter that either runs a short
knowledge screening or delivers a message such as an interview time. The
interview script, the follow-up questions and the scoring already run on the
project's Gemini key. **Placing a real call needs a voice platform account and a
few settings that only you can create.** Until they exist, the "Place phone
call" button stays disabled and the same interview runs as a simulated chat in
the browser.

This page lists exactly what to provide, in order.

---

## 1. A Vapi account (the voice layer)

Vapi dials the number, listens, speaks and sends the transcript back. Sign up
at <https://vapi.ai>.

| What to give | Where to find it | Goes into |
| --- | --- | --- |
| **API key** | Vapi dashboard → API Keys → create a key | `VAPI_API_KEY` |
| **Phone Number ID** | Vapi dashboard → Phone Numbers → the number's id | `VAPI_PHONE_NUMBER_ID` |
| **Webhook secret** | Any long random string you invent (20+ characters) | `VAPI_WEBHOOK_SECRET` |

**Phone number choice**

- **Free Vapi US number**: instant, fine for testing and can call Indian mobiles.
  Candidates see a US caller ID.
- **Your own Twilio number imported into Vapi**: your caller ID and your carrier
  bill. Twilio does not sell Indian numbers to most accounts, and commercial
  calls into India fall under TRAI rules. Start with the free number.

Set a **monthly spending limit** in the Vapi dashboard on day one.

## 2. A public URL for the API (the webhook)

Vapi posts call status and the transcript to
`<PUBLIC_BASE_URL>/api/v1/calls/webhook/vapi/`. The API must be reachable from
the internet.

- **Development**: run `ngrok http 8200` and use the `https://…ngrok-free.app`
  address it prints. It changes every time ngrok restarts unless you have a paid
  static domain.
- **Server or Docker host**: that machine's public https address.

Goes into `PUBLIC_BASE_URL`.

## 3. Your own mobile number (safe mode)

While `VOICE_SAFE_NUMBER` is set, **every real call rings this number instead
of the candidate**. The call record shows who it was meant for. Keep it set
until you have heard a few calls and are happy with the script. Write it with
the country code, for example `+919876543210`.

## 4. Decisions only you can make

| Decision | Default if you say nothing |
| --- | --- |
| **Voice** | Vapi's built-in "Elliot". Indian English and other accents are available; give me a voice name and I change one setting. |
| **Model behind the voice** | GPT-4o mini, billed through Vapi. Gemini can be selected in Vapi too. |
| **Say "this is an AI" up front** | Yes recommended. One sentence in the greeting; tell me if you want the exact wording. |
| **Recording** | On. Candidates should be told the call is recorded. |
| **Maximum call length** | Chosen per call in the dialog, 5 to 20 minutes. |
| **Who gets the first real call** | One of your own numbers, never a candidate. |

Consent, recording disclosure and compliance with calling regulations are your
responsibility as the caller.

## 5. The lines to add to `.env`

Fill these in yourself; the values are secrets. Then restart `make dev`, or
`make docker-up` if you run the Docker stack.

```
VOICE_PROVIDER=vapi
VAPI_API_KEY=<from step 1>
VAPI_PHONE_NUMBER_ID=<from step 1>
VAPI_WEBHOOK_SECRET=<from step 1>
PUBLIC_BASE_URL=https://xxxx.ngrok-free.app
VOICE_SAFE_NUMBER=+91xxxxxxxxxx
VOICE_DEFAULT_REGION=IN
```

Optional, only if you changed a decision in step 4:

```
VAPI_VOICE_PROVIDER=vapi
VAPI_VOICE_ID=Elliot
VAPI_MODEL_PROVIDER=openai
VAPI_MODEL=gpt-4o-mini
VOICE_MODEL=            # the Gemini model used for the simulated chat and the scoring; empty = the search model
```

## 6. What happens after you provide them

1. I place one call to your safe number and confirm the webhook delivers the
   transcript and the assessment. The Vapi adapter was written against their
   published API but has never run against a live account, so this first call is
   its real test and may need a field name adjusted.
2. You listen to a knowledge test and an information call and tell me what to
   change in the script: tone, opening line, how hard the follow-ups push.
3. When you are satisfied, remove `VOICE_SAFE_NUMBER` and calls go to
   candidates.

## What it costs, roughly

At about ₹85 to the dollar: **₹10 to ₹17 per minute** of a real call, about
₹60 to ₹100 for a six minute screening, ₹15 to ₹35 for a short information
call, and around ₹100 a month for a Twilio number if you use one. Both Twilio
and Vapi give free starting credit that covers your first tests on your own
phone. Simulated calls, the scoring and the AI email drafts run on your
existing Gemini key and cost a fraction of a rupee each.

## Where to test before anything is set up

Open a candidate → **Contact Candidates** → **Phone call (AI)** → tick a row →
**Run simulated call**. You type what the candidate would say; the AI asks the
next question. The transcript, the scores and the contact log entry are the same
as for a real call.
