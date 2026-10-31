import { createFileRoute } from "@tanstack/react-router";

import { Eyebrow, Panel, PanelHeadline, PanelInner } from "@/components/site/panel";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund & Cancellation Policy — BanglaDataHub" },
      {
        name: "description",
        content:
          "How subscriptions, cancellations, and refunds work for BanglaDataHub plans, billed through LemonSqueezy.",
      },
    ],
  }),
  component: Refund,
});

function Refund() {
  return (
    <main>
      <Panel ground="paper" full={false} className="pt-32 pb-20">
        <PanelInner>
          <Eyebrow>Legal</Eyebrow>
          <PanelHeadline className="mt-6">Refund &amp; Cancellation Policy</PanelHeadline>
          <p className="num mt-4 text-[13px] text-ink-soft">Last updated: 6 August 2026</p>

          <div className="doc-prose mt-8 text-[16px]">
            <p>
              We want you to be confident before you pay. That is why every account includes{" "}
              <strong>500 free API calls a month</strong> — you can build and test against the real API
              without any charge before upgrading. Paid subscriptions are billed through our Merchant
              of Record, LemonSqueezy, which issues invoices and processes refunds.
            </p>

            <h2>1. Subscriptions and renewals</h2>
            <p>
              Paid plans (Developer, Pro, Business) are monthly subscriptions that renew
              automatically until cancelled. Each renewal is charged at the start of the billing
              period to the payment method on file.
            </p>

            <h2>2. Cancellation</h2>
            <p>
              You can cancel at any time from the billing portal linked in your LemonSqueezy receipt,
              or by emailing us. When you cancel, your plan stays active until the end of the period
              you have already paid for, then stops renewing. We do not charge a
              cancellation fee.
            </p>

            <h2>3. Refunds</h2>
            <p>
              If you are not satisfied, contact us within <strong>14 days</strong> of a charge and
              we will refund that payment in full — no lengthy justification required. After 14
              days, a monthly charge is generally non-refundable, since you retained access for that
              period, but we review reasonable requests (for example, a duplicate charge or a
              sustained outage) case by case and in good faith.
            </p>

            <h2>4. How to request a refund</h2>
            <p>
              Email <a href="mailto:hello@bangladatahub.com">hello@bangladatahub.com</a> from the address
              on your account, with the receipt or order number from LemonSqueezy. Approved refunds
              are returned to your original payment method; the time to appear depends on your bank
              or card provider.
            </p>

            <h2>5. Free plan</h2>
            <p>
              The free plan includes a monthly allowance of API calls (500 a month, resetting on the
              1st). It carries no charge, so there is nothing to refund or cancel, and unused calls
              don't carry over. You can stop using the API, or delete your account, at any time.
            </p>

            <p>
              Questions about billing: <a href="mailto:hello@bangladatahub.com">hello@bangladatahub.com</a>.
            </p>
          </div>
        </PanelInner>
      </Panel>
    </main>
  );
}
