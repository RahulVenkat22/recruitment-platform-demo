# Vapi browser voice demo

The browser demo lets a recruiter speak as a candidate through their microphone
and hear the Vapi AI recruiter respond. It uses the selected candidate, role,
company details, offered interview slots, and instructions from the call planner.
No telephone number or carrier account is required.

## Setup

The backend needs an active Vapi account with available credits and the existing
server-side `VAPI_API_KEY` setting. Configure it through your normal local or
deployment environment, then restart the API. Do not put the private key in
frontend code or a `VITE_` variable. This implementation does not need a public
Vapi key or a saved assistant: the backend creates the assistant for each demo.

The existing `VAPI_MODEL_PROVIDER`, `VAPI_MODEL`, `VAPI_VOICE_PROVIDER`, and
`VAPI_VOICE_ID` settings select the model and voice. They must refer to providers
available to your Vapi account. Browser calling does not require
`VOICE_PROVIDER`, `VAPI_PHONE_NUMBER_ID`, `VOICE_SAFE_NUMBER`, `PUBLIC_BASE_URL`,
or webhook configuration. The existing telephone configuration remains separate.

Use HTTPS on a hosted site, or localhost for development, and allow microphone
access. Headphones help prevent echo. Vapi and its AI providers still bill usage.

## Run the demo

1. Sign in as a recruiter who can contact candidates for the selected job.
2. Open a candidate's application action menu and choose **Call candidate (AI)…**.
   You can also use **Contact Candidates → Phone call (AI)** and select one candidate.
3. Choose **Schedule interview** with available slots, or **Share information**
   with the message you want the assistant to deliver.
4. Select **Browser voice demo**, then **Start browser call** and allow the microphone.
5. Answer as the candidate. Watch the live transcript, mute when needed, and use
   **End call** to finish. Closing the dialog also disconnects the microphone.

The demo is limited to one candidate at a time. It does not dial the candidate,
create a contact-log entry, book interviews, send invitations, or change pipeline
stages. Its transcript is displayed in the dialog; Vapi may retain service logs
under the account's retention settings. Audio recording is disabled for this path.

## Integration and deployment

- `GET /api/v1/calls/config/` reports `browser_configured` independently of phone
  calling readiness.
- Authenticated `POST /api/v1/applications/{id}/browser-call/` validates the same
  planner inputs and permissions as other candidate actions. It returns only the
  session ID, web-call URL, and maximum duration, with `Cache-Control: no-store`.
- The backend creates the session using Vapi's `POST /call/web`. The frontend
  joins it through `@vapi-ai/web`'s `reconnect()` method; it never receives the
  backend's private key. Treat the temporary session URL as private.
- Microphone access is checked before requesting a session. If a session is
  created but the user closes the dialog before joining, Vapi's 45-second
  customer-join timeout ends the unused session. Leaving a joined session deletes
  its room. The selected maximum duration bounds the conversation.
- Requests are limited to six session starts per minute per signed-in user.
- The CloudFront response-header policy in `infra/aws/stack.json` allows Daily's
  browser audio connections and scripts. Deploy that template change with the
  frontend when using CloudFront. The SDK uses `avoidEval` so the policy does not
  need `unsafe-eval`. Local Vite/nginx do not set this CloudFront policy.

If the button is disabled, check the backend's configuration and restart it.
If permission is denied, allow microphone access in browser site settings and
try again. For connection failures, check Vapi credits, configured voice/model,
and browser network/CSP errors. A live microphone call still needs verification
against your own Vapi account; automated tests mock the provider and browser SDK.

References: [Vapi Web SDK](https://github.com/VapiAI/client-sdk-web),
[browser calls](https://docs.vapi.ai/quickstart/web),
[join timeout](https://docs.vapi.ai/calls/customer-join-timeout), and
[Daily content security policy](https://docs.daily.co/docs/guides/privacy-and-security/content-security-policy).
