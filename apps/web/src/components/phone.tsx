// The hero's picture: a phone drawn in CSS showing a finished note from a mixed Bengali and English
// meeting. Original art (D033): no screenshot, no stock image, nothing borrowed.
export function PhoneMock() {
  return (
    <div className="relative mx-auto w-[300px] rounded-[44px] border border-border-hairline bg-bg-list p-3 shadow-2xl shadow-black/50">
      <div className="mx-auto mb-3 h-6 w-28 rounded-full bg-black/60" />
      <div className="rounded-[32px] bg-bg-app px-5 pt-5 pb-7">
        <p className="text-text-tertiary text-xs">Today · 10:30 – 11:05</p>
        <h3 className="mt-1 font-serif text-2xl leading-tight">
          বাজেট রিভিউ ও launch plan
        </h3>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-full bg-bg-tile-raised px-2.5 py-1 text-[11px] text-text-secondary">
            Rita
          </span>
          <span className="rounded-full bg-bg-tile-raised px-2.5 py-1 text-[11px] text-text-secondary">
            Karim
          </span>
          <span className="rounded-full bg-bg-tile-raised px-2.5 py-1 text-[11px] text-text-secondary">
            +2
          </span>
        </div>
        <h4 className="mt-5 font-semibold text-sm">### বাজেট</h4>
        <ul className="mt-2 grid gap-1.5 text-[13px] text-text-secondary">
          <li>• Q1 budget Thursday-র মধ্যে final হবে</li>
          <li>• Marketing খরচ ১৫% কমানো হবে</li>
        </ul>
        <h4 className="mt-4 font-semibold text-sm">### Next steps</h4>
        <ul className="mt-2 grid gap-1.5 text-[13px]">
          <li>
            <b>Karim</b> privacy policy draft করবেন
          </li>
          <li>
            <b>Rita</b> self-host guide test করবেন
          </li>
        </ul>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-bg-list px-4 py-3">
          <span className="flex h-8 items-end gap-[3px]">
            {[10, 22, 30, 18, 26, 12].map((h) => (
              <i
                className="w-[4px] rounded-full bg-accent-lime"
                key={h}
                style={{ height: h }}
              />
            ))}
          </span>
          <span className="text-text-secondary text-xs">
            Transcript · 2 speakers · 35 min
          </span>
        </div>
      </div>
    </div>
  );
}
