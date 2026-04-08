export function FiggenTest() {
  return (
    <div className="bg-white p-[40px] flex flex-col gap-[24px] w-[480px] h-[560px] box-border">
      <div
        className="bg-[#ecf4ff] rounded-[99px] px-[12px] py-[6px] w-[156px] h-[27px] flex items-center justify-start box-border"
        aria-label="Badge"
      >
        <span
          className="text-[#2e6bde] font-[Inter] font-medium text-[12px] leading-[14.5227px] block"
          style={{ lineHeight: "14.522727012634277px" }}
        >
          ✦ Accounting Services
        </span>
      </div>

      <h1
        className="text-[#171a21] font-[Inter] font-bold text-[28px] leading-[38.0800px] w-[400px] h-[76px] box-border"
        style={{ lineHeight: "38.08000183105469px" }}
      >
        Friendly financial clarity for your business
      </h1>

      <p
        className="text-[#666b78] font-[Inter] font-normal text-[15px] leading-[24px] w-[400px] h-[48px] box-border"
        style={{ lineHeight: "24px" }}
      >
        We handle bookkeeping, tax filing, and payroll so you can focus on growing your business.
      </p>

      <section className="w-[341px] h-[74px] flex flex-row gap-[16px]" aria-label="StatsRow">
        <article className="bg-[#f7f7fa] rounded-[10px] px-[16px] py-[14px] w-[114px] h-[74px] flex flex-col box-border gap-[4px]">
          <div className="text-[#171a21] font-[Inter] font-bold text-[22px] leading-[26.625px] w-[60px] h-[27px] box-border">
            500+
          </div>
          <div className="text-[#80858f] font-[Inter] font-normal text-[12px] leading-[14.5227px] w-[82px] h-[15px] box-border">
            Clients served
          </div>
        </article>

        <article className="bg-[#f7f7fa] rounded-[10px] px-[16px] py-[14px] w-[96px] h-[74px] flex flex-col box-border gap-[4px]">
          <div className="text-[#171a21] font-[Inter] font-bold text-[22px] leading-[26.625px] w-[47px] h-[27px] box-border">
            12yr
          </div>
          <div className="text-[#80858f] font-[Inter] font-normal text-[12px] leading-[14.5227px] w-[64px] h-[15px] box-border whitespace-nowrap">
            In business
          </div>
        </article>

        <article className="bg-[#f7f7fa] rounded-[10px] px-[16px] py-[14px] w-[99px] h-[74px] flex flex-col box-border gap-[4px]">
          <div className="text-[#171a21] font-[Inter] font-bold text-[22px] leading-[26.625px] w-[48px] h-[27px] box-border">
            98%
          </div>
          <div className="text-[#80858f] font-[Inter] font-normal text-[12px] leading-[14.5227px] w-[67px] h-[15px] box-border">
            Satisfaction
          </div>
        </article>
      </section>

      <div className="bg-[#e5e8ed] w-[400px] h-[1px]" aria-label="Divider" />

      <div
        className="bg-[#2e6bde] rounded-[10px] px-[28px] py-[16px] w-[240px] h-[50px] flex items-center justify-center box-border"
        aria-label="CTAButton"
      >
        <span
          className="text-white font-[Inter] font-semibold text-[15px] leading-[18.1534px] block"
          style={{ lineHeight: "18.15340805053711px" }}
        >
          Get a free consultation →
        </span>
      </div>

      <footer className="text-[#999ea8] font-[Inter] font-normal text-[12px] leading-[14.5227px] w-[400px] h-[15px] flex items-start justify-center box-border">
        <span style={{ lineHeight: "14.522727012634277px" }}>No credit card required · Cancel anytime</span>
      </footer>
    </div>
  );
}

export default FiggenTest;
