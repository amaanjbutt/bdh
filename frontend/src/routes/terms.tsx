import { createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — BanglaDataHub" },
      {
        name: "description",
        content:
          "The terms governing use of the BanglaDataHub API and website — accounts, acceptable use, plans, and liability.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-20">
        <PanelInner>
          <Eyebrow>Legal</Eyebrow>
          <PanelHeadline className="mt-6">Terms of Service</PanelHeadline>
          <p className="num mt-4 text-[13px] text-ink-soft">Last updated: 6 August 2026</p>

          <div className="doc-prose mt-8 text-[16px]">
            <p>
              These Terms govern your access to and use of the BanglaDataHub website and API (the
              “Service”), operated by the BanglaDataHub team (“we”, “us”). By creating an account,
              generating an API key, or using the Service, you agree to these Terms. If you are
              using the Service on behalf of an organization, you accept these Terms for that
              organization.
            </p>

            <h2>1. The Service</h2>
            <p>
              BanglaDataHub provides programmatic access to Bangladeshi economic and financial time
              series, compiled from official public releases and served from our own database. We
              may add, change, or discontinue series, endpoints, and features over time. We aim
              for accuracy and cross-check data against known published figures, but the Service is
              provided for informational purposes and we do not warrant that every value is
              complete, current, or error-free.
            </p>

            <h2>2. Accounts and API keys</h2>
            <p>
              You are responsible for keeping your API keys secret and for all activity under your
              keys. Keys are shown once at creation; if a key is exposed, revoke it from your
              dashboard and create a new one. Do not share keys publicly or embed them in
              client-side code. One free account is permitted per email address.
            </p>

            <h2>3. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>exceed the rate limits or request quotas of your plan, or attempt to circumvent them;</li>
              <li>resell, redistribute, or sublicense bulk access to the raw data as a competing data feed;</li>
              <li>use the Service to build a product whose primary purpose is to replicate the Service;</li>
              <li>probe, scan, or test the vulnerability of the Service, or breach its security or authentication;</li>
              <li>use the Service for any unlawful purpose or in violation of any applicable regulation.</li>
            </ul>
            <p>
              On every plan you may use the data internally — in your own analysis, models,
              dashboards and research, including for commercial work — and you may quote individual
              figures in reports, articles and presentations. Displaying the data to your own users
              or customers inside a product (for example, showing fund NAVs or BIBOR in an app or on a
              website) requires the Business plan or a written licence from us. When you publish
              figures derived from the Service, attribution to the original official source is
              encouraged.
            </p>

            <h2>4. Plans, billing, and changes</h2>
            <p>
              Paid plans are billed through our Merchant of Record, LemonSqueezy, which handles
              payment, invoicing, and applicable taxes. Plan limits and prices are described on the
              <a href="/pricing"> pricing page</a>. We may change prices or plan limits with
              reasonable notice; changes do not apply retroactively to a period already paid.
              Cancellation and refunds are covered by our <a href="/refund">Refund &amp;
              Cancellation Policy</a>.
            </p>

            <h2>5. Availability</h2>
            <p>
              We work to keep the Service available and current, and publish live freshness on the
              <a href="/status"> status page</a>. Except where a plan explicitly includes a service
              level, the Service is provided without an uptime guarantee, and we may perform
              maintenance that temporarily interrupts access.
            </p>

            <h2>6. Disclaimer and limitation of liability</h2>
            <p>
              The Service is provided “as is”. To the maximum extent permitted by law, we disclaim
              all warranties, express or implied, including fitness for a particular purpose. Data
              from the Service is not financial, investment, or trading advice. To the maximum
              extent permitted by law, our total liability arising out of or relating to the Service
              is limited to the amount you paid us in the three months preceding the claim.
            </p>

            <h2>7. Suspension and termination</h2>
            <p>
              We may suspend or terminate access that violates these Terms or that risks the
              stability or security of the Service. You may stop using the Service and delete your
              account at any time by contacting us.
            </p>

            <h2>8. Changes to these Terms</h2>
            <p>
              We may update these Terms; material changes will be reflected by the “last updated”
              date above. Continued use after a change constitutes acceptance.
            </p>

            <h2>9. Contact</h2>
            <p>
              Questions about these Terms: <a href="mailto:hello@bangladatahub.com">hello@bangladatahub.com</a>.
            </p>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
