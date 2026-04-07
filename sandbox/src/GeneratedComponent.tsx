export default function FiggenTest () {
  return (
    <div className="min-h-screen w-full bg-white flex items-start justify-center p-6">
      <main className="w-full max-w-[520px]">
        <article className="bg-white rounded-[20px] shadow-[0_18px_60px_rgba(0,0,0,0.08)] border border-gray-100 p-8 md:p-10">
          <header className="flex flex-col gap-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#EAF2FF] px-4 py-2 text-[13px] leading-none text-[#2F6CF6] font-medium w-fit">
              <span className="inline-flex h-4 w-4 items-center justify-center">
                <div className="h-2.5 w-2.5 bg-[#2F6CF6] rounded-[3px]" aria-label="icon" />
              </span>
              <span>Accounting Services</span>
            </div>

            <h1 className="text-[34px] md:text-[38px] leading-[1.08] font-extrabold tracking-[-0.02em] text-gray-900">
              Friendly financial clarity for
              <br />
              your business
            </h1>

            <p className="text-[15px] md:text-[16px] leading-[1.6] text-gray-600 max-w-[420px]">
              We handle bookkeeping, tax filing, and payroll so you can focus on growing your business.
            </p>
          </header>

          <section className="mt-8">
            <div className="flex items-stretch justify-between gap-4">
              <div className="flex-1 rounded-xl bg-[#F4F7FF] px-3 py-5 text-center">
                <div className="text-[26px] font-extrabold text-gray-900 leading-[1.05]">500+</div>
                <div className="text-[12px] text-gray-500 mt-1">Clients served</div>
              </div>
              <div className="flex-1 rounded-xl bg-[#F4F7FF] px-3 py-5 text-center">
                <div className="text-[26px] font-extrabold text-gray-900 leading-[1.05]">12yr</div>
                <div className="text-[12px] text-gray-500 mt-1">In business</div>
              </div>
              <div className="flex-1 rounded-xl bg-[#F4F7FF] px-3 py-5 text-center">
                <div className="text-[26px] font-extrabold text-gray-900 leading-[1.05]">98%</div>
                <div className="text-[12px] text-gray-500 mt-1">Satisfaction</div>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100" />

            <div className="mt-8 flex flex-col items-start gap-4">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2F6CF6] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(47,108,246,0.35)] w-full md:w-[320px]"
                aria-label="Get a free consultation"
              >
                <span>Get a free consultation</span>
                <span className="inline-flex items-center justify-center">
                  <div className="h-4 w-4">
                    <div className="h-[2px] w-[10px] bg-white rounded-full translate-x-[1px] translate-y-[2px]" />
                    <div className="h-[7px] w-[7px] border-t-[2px] border-r-[2px] border-white rotate-[45deg] translate-x-[5px] translate-y-[-1px]" />
                  </div>
                </span>
              </button>

              <p className="text-[12px] text-gray-400">
                No credit card required · Cancel anytime
              </p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
};