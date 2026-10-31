import { createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — BanglaDataHub" },
      {
        name: "description",
        content:
          "What data BanglaDataHub collects, why, and how we handle it — accounts, usage logs, payment, and your rights.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-20">
        <PanelInner>
          <Eyebrow>Legal</Eyebrow>
          <PanelHeadline className="mt-6">Privacy Policy</PanelHeadline>
          <p className="num mt-4 text-[13px] text-ink-soft">Last updated: 17 October 2026</p>

          <div className="doc-prose mt-8 text-[16px]">
            <p>
              This policy explains what personal data the BanglaDataHub team (“we”, “us”) collects when
              you use our website and API (the “Service”), why we collect it, and the choices you
              have. We collect as little as we can to run the Service.
            </p>

            <h2>1. What we collect</h2>
            <ul>
              <li>
                <strong>Account data.</strong> The email address you sign up with, your plan, and
                your subscription status. API keys are stored only as hashes — we cannot see your
                key after it is created.
              </li>
              <li>
                <strong>Usage data.</strong> A log of each API request: the time, the endpoint and
                the series or item asked for, the response status, size and timing, the account and
                key that made it, a coarse client type (for example browser, script or spreadsheet),
                the country when our network provides it, and a one-way keyed hash of the IP address
                (never the address itself). Query strings, which can contain your key, are never
                logged. We use this for rate limiting, your usage dashboard, security and improving
                the Service, and we do not sell it.
              </li>
              <li>
                <strong>Payment data.</strong> Payments are processed by our Merchant of Record,
                LemonSqueezy. We receive your email, plan, and subscription status from them — we
                do <strong>not</strong> receive or store your card number.
              </li>
            </ul>
            <p>
              The economic data served by the API is public official information and contains no
              personal data about you.
            </p>

            <h2>2. Why we use it</h2>
            <p>
              To create and authenticate your account, issue and rate-limit API keys, show your
              usage, process billing through LemonSqueezy, provide support, keep the Service secure,
              and meet legal obligations. We rely on performance of our contract with you and our
              legitimate interest in operating a secure, reliable service.
            </p>

            <h2>3. Sharing</h2>
            <p>
              We share data only with the processors that run the Service — for example our hosting
              provider, and LemonSqueezy for payments — and only as needed. We do not sell personal
              data or share it for advertising. We may disclose data if required by law.
            </p>

            <h2>4. Retention</h2>
            <p>
              We keep account and billing records for as long as your account is active and as
              required for tax and legal purposes. Individual request records are kept in our
              database for 30 days, then moved to private, access-restricted storage; daily totals
              per endpoint and per account are kept for as long as your account exists. You can ask
              us to delete your account and associated personal data.
            </p>

            <h2>5. Security</h2>
            <p>
              API keys are stored as SHA-256 hashes, never in plaintext. Traffic is served over
              HTTPS. We take reasonable technical and organizational measures to protect your data,
              though no system is perfectly secure.
            </p>

            <h2>6. Your rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data, and you
              may object to certain processing. To exercise any of these, email us at the address
              below. Payment-related requests may be directed to LemonSqueezy as the Merchant of
              Record.
            </p>

            <h2>7. Cookies</h2>
            <p>
              The website uses only the minimum storage needed to function — for example, keeping
              you signed in to your dashboard. We do not use third-party advertising cookies.
            </p>

            <h2>8. Changes and contact</h2>
            <p>
              We may update this policy; the “last updated” date above reflects the latest version.
              Questions or requests: <a href="mailto:hello@bangladatahub.com">hello@bangladatahub.com</a>.
            </p>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
