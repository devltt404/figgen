export default function HeroCard() {
  return (
    <section
      aria-label="Hero card"
      className="w-[480px] bg-white rounded-[16px] shadow-[0px_8px_24px_rgba(0,0,0,0.08)] px-[40px] pt-[40px] pb-[40px]"
    >
      <header className="flex flex-col gap-[24px]">
        <div className="inline-flex items-center rounded-[99px] bg-[#ecf4ff] px-[12px] py-[6px] w-[156px] h-[27px]">
          <div className="text-[12px] leading-[15px] font-medium text-[#2e6bde] truncate">
            ✦ Accounting Services
          </div>
        </div>

        <div>
          <h1 className="text-[28px] leading-[34px] font-bold text-[#171a21]">
            Friendly financial clarity for your business
          </h1>
        </div>

        <p className="text-[15px] leading-[24px] text-[#666b78] font-normal">
          We handle bookkeeping, tax filing, and payroll so you can focus on growing your business.
        </p>

        <div className="flex items-start gap-[16px] w-[341px] h-[74px]">
          <article className="flex flex-col items-center rounded-[10px] bg-[#f7f7fa] w-[114px] h-[74px] px-[16px] pt-[14px] pb-[14px] gap-[4px]">
            <div className="text-[22px] leading-[27px] font-bold text-[#171a21]">500+</div>
            <div className="text-[12px] leading-[15px] font-normal text-[#80858f]">Clients served</div>
          </article>

          <article className="flex flex-col items-center rounded-[10px] bg-[#f7f7fa] w-[96px] h-[74px] px-[16px] pt-[14px] pb-[14px] gap-[4px]">
            <div className="text-[22px] leading-[27px] font-bold text-[#171a21]">12yr</div>
            <div className="text-[12px] leading-[15px] font-normal text-[#80858f]">In business</div>
          </article>

          <article className="flex flex-col items-center rounded-[10px] bg-[#f7f7fa] w-[99px] h-[74px] px-[16px] pt-[14px] pb-[14px] gap-[4px]">
            <div className="text-[22px] leading-[27px] font-bold text-[#171a21]">98%</div>
            <div className="text-[12px] leading-[15px] font-normal text-[#80858f]">Satisfaction</div>
          </article>
        </div>

        <div className="w-[400px] h-[1px] bg-[#e5e8ed]" aria-hidden="true" />

        <div className="w-[240px] h-[50px] rounded-[10px] bg-[#2e6bde] flex items-center px-[28px] py-[16px]">
          <button
            type="button"
            className="text-[15px] leading-[18px] font-semibold text-white whitespace-nowrap"
            aria-label="Get a free consultation"
          >
            Get a free consultation →
          </button>
        </div>

        <div className="text-[12px] leading-[15px] font-normal text-[#999ea8]">
          No credit card required · Cancel anytime
        </div>
      </header>
    </section>
  );
}