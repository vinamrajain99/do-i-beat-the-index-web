import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "About · Do I beat the index?",
  description:
    "Why this app exists, how the comparison works, and where the data comes from.",
};

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight">{children}</h2>
  );
}

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1 px-6 py-16 sm:py-24">
      <article className="max-w-3xl mx-auto w-full">
        {/* Hero */}
        <header className="text-center space-y-6 mb-20">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            About
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl mx-auto">
            Why this app exists, how the comparison works, and where the
            data comes from.
          </h1>
        </header>

        {/* The question */}
        <section className="space-y-5 mb-20">
          <SectionEyebrow>The question</SectionEyebrow>
          <SectionHeading>
            Are you actually beating a simple index strategy?
          </SectionHeading>
          <p className="text-base text-muted-foreground leading-relaxed">
            Many retail investors stock-pick. It&apos;s hard not to: online
            feeds are wall-to-wall with influencers who package
            &ldquo;analysis&rdquo; into catchy 60-second reels, and the
            firehose of tips makes it feel like <em>not</em> trading would be
            leaving money on the table.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            But the popular wisdom is unambiguous: roughly 80% of
            professional fund managers fail to beat their benchmark over a
            10-year window, and retail numbers are almost certainly worse.
          </p>
          <blockquote className="border-l-2 border-primary/40 pl-5 py-1 my-6 text-foreground italic">
            Would you be better off putting whatever you want to invest into
            a single benchmark like VTI or QQQ?
          </blockquote>
          <p className="text-base text-muted-foreground leading-relaxed">
            The only honest way to know is an apples-to-apples
            counterfactual: same money, same dates, routed into one index
            instead of your hand-picked basket of trades. That&apos;s what
            this app does &mdash; for up to five benchmarks at once.
          </p>
        </section>

        {/* How the math works */}
        <section className="space-y-5 mb-20">
          <SectionEyebrow>How the math works</SectionEyebrow>
          <SectionHeading>Hold cash flow constant. Vary the asset.</SectionHeading>
          <p className="text-base text-muted-foreground leading-relaxed">
            The core principle: hold one thing constant &mdash; your
            external cash flow into the brokerage &mdash; and vary one thing
            &mdash; what the cash gets routed into. Everything else (which
            specific stocks you bought and sold, when dividends paid out,
            when you reinvested them) is internal to whichever strategy
            you&apos;re evaluating, and compounds inside that strategy
            without leaking across.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            Only ACH and wire transfers between your bank and Robinhood are
            mirrored. Everything else is ignored on both sides.
          </p>

          <div className="overflow-x-auto rounded-lg border bg-card mt-6">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left font-medium px-4 py-3 w-[44%]">
                    Event in your CSV
                  </th>
                  <th className="text-left font-medium px-4 py-3">
                    Treatment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">
                    ACH deposit{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      $X
                    </span>{" "}
                    on date{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      D
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Buy{" "}
                    <span className="font-mono text-xs">$X</span> of the
                    benchmark at adjusted close on{" "}
                    <span className="font-mono text-xs">D</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    ACH withdrawal{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      $Y
                    </span>{" "}
                    on date{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      D
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sell{" "}
                    <span className="font-mono text-xs">$Y</span> of the
                    benchmark at adjusted close on{" "}
                    <span className="font-mono text-xs">D</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Buy / Sell / Dividend / DRIP / Split
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Ignored on both sides
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Options / Crypto / Interest
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Ignored on both sides
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium tracking-tight pt-6">
            Both sides DRIP their own dividends
          </h3>
          <p className="text-base text-muted-foreground leading-relaxed">
            Your real portfolio reinvests dividends back into the same asset
            (Robinhood DRIP). The benchmark counterfactual needs to do the
            same thing &mdash; otherwise the index would be unfairly
            penalised for not compounding.
          </p>
          <ul className="space-y-3 text-base text-muted-foreground leading-relaxed list-none pl-0">
            <li className="pl-5 relative">
              <span className="absolute left-0 top-3 h-1 w-1 rounded-full bg-muted-foreground/50" />
              <strong className="text-foreground font-medium">
                Your actual portfolio:
              </strong>{" "}
              you supply today&apos;s total value as a single number, read
              straight off the Robinhood app. That number already bakes in
              every dividend you reinvested, every split, and every
              internal asset shuffle &mdash; because it&apos;s the real
              number.
            </li>
            <li className="pl-5 relative">
              <span className="absolute left-0 top-3 h-1 w-1 rounded-full bg-muted-foreground/50" />
              <strong className="text-foreground font-medium">
                The benchmark counterfactual:
              </strong>{" "}
              total-return adjusted close prices from Yahoo Finance already
              include reinvested benchmark dividends, so the simulation
              compounds with both price appreciation and dividends, just
              like real DRIP would.
            </li>
          </ul>
          <p className="text-base text-muted-foreground leading-relaxed">
            Both sides DRIP their own dividends. Only the asset choice
            differs.
          </p>
        </section>

        {/* Why not mirror every buy */}
        <section className="space-y-5 mb-20">
          <SectionEyebrow>A design choice</SectionEyebrow>
          <SectionHeading>Why individual buys aren&apos;t mirrored</SectionHeading>
          <p className="text-base text-muted-foreground leading-relaxed">
            An earlier design mirrored every user-initiated buy with a
            matching benchmark buy on the same date. That sounds clean but
            isn&apos;t: if a buy was funded by accumulated dividend cash or
            by the proceeds of a recent sale, mirroring it as a fresh
            benchmark purchase double-counts capital. Detecting which buys
            are external-funded vs. internal-funded requires brittle
            heuristics on the CSV.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            Mirroring only external ACH flows sidesteps the whole class of
            bugs. The trade-off: this app answers{" "}
            <em>
              &ldquo;did your picking beat indexing the same money you put
              in?&rdquo;
            </em>{" "}
            &mdash; not the per-trade question{" "}
            <em>
              &ldquo;did each of your individual picks outperform a same-day
              benchmark buy?&rdquo;
            </em>{" "}
            The former is the more meaningful question for most retail
            investors, and it&apos;s the one this app is built to answer.
          </p>
        </section>

        {/* Money-weighted return */}
        <section className="space-y-5 mb-20">
          <SectionEyebrow>Why XIRR, not just total return</SectionEyebrow>
          <SectionHeading>Money-weighted return</SectionHeading>
          <p className="text-base text-muted-foreground leading-relaxed">
            Final dollar value alone doesn&apos;t account for <em>when</em>{" "}
            the money went in. A 50% gain on $10K deposited yesterday is
            very different from a 50% gain on $10K deposited a decade ago.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            The report shows <strong className="text-foreground">XIRR</strong>{" "}
            &mdash; money-weighted internal rate of return &mdash; alongside
            CAGR for both your portfolio and each benchmark. XIRR takes your
            actual deposit and withdrawal dates into account, so strategies
            with very different dollar magnitudes can still be compared
            apples-to-apples.
          </p>
        </section>

        {/* Data sources */}
        <section className="space-y-5 mb-20">
          <SectionEyebrow>Where the data comes from</SectionEyebrow>
          <SectionHeading>Three inputs, no broker login</SectionHeading>
          <ul className="space-y-5 text-base text-muted-foreground leading-relaxed list-none pl-0 mt-2">
            <li className="pl-5 relative">
              <span className="absolute left-0 top-3 h-1 w-1 rounded-full bg-muted-foreground/50" />
              <strong className="text-foreground font-medium">
                Your Robinhood activity CSV.
              </strong>{" "}
              You download it from the Robinhood website (Account &rarr;
              Reports &amp; Statements &rarr; Activity report) and upload it
              here. The app never logs in to your broker.
            </li>
            <li className="pl-5 relative">
              <span className="absolute left-0 top-3 h-1 w-1 rounded-full bg-muted-foreground/50" />
              <strong className="text-foreground font-medium">
                Yahoo Finance for benchmark prices,
              </strong>{" "}
              via the open-source{" "}
              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                yfinance
              </code>{" "}
              library. Ticker symbol and date range only &mdash; no personal
              information leaves the simulation.
            </li>
            <li className="pl-5 relative">
              <span className="absolute left-0 top-3 h-1 w-1 rounded-full bg-muted-foreground/50" />
              <strong className="text-foreground font-medium">
                Your current portfolio value, as you type it in.
              </strong>{" "}
              Read straight off the headline number in the Robinhood app.
            </li>
          </ul>

          <h3 className="text-lg font-medium tracking-tight pt-6">
            Privacy
          </h3>
          <p className="text-base text-muted-foreground leading-relaxed">
            CSVs sit in a private Supabase Storage folder scoped to your
            account by Postgres row-level-security. No other user (or
            anonymous request) can read them. Deleting an analysis removes
            both the database row and the CSV file. Benchmark prices are
            cached in a shared Postgres table, so subsequent analyses with
            overlapping date ranges hit the cache instead of refetching.
          </p>
        </section>

        {/* CTA — signed-out only */}
        {!user && (
          <section className="text-center border-t pt-16 mt-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Ready to run one?
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
              See where you actually stand.
            </h2>
            <div className="flex items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/auth/signup">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/auth/login">Log in</Link>
              </Button>
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
