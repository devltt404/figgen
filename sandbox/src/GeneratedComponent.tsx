import React from "react";

export default function FiggenTestDesign() {
  return (
    <div className="w-[380px] bg-[#FFFFFF] rounded-[20px] p-[28px_24px] flex flex-col gap-[20px]">
      <header className="w-full flex flex-row items-center gap-[16px]">
        <div className="w-[76px] h-[76px] rounded-[38px] bg-[#6366F1] flex items-center justify-center">
          <p className="m-0 p-0 font-Inter font-semibold text-[24px] leading-[1.2102272033691406em] text-left text-[#FFFFFF]">
            AP
          </p>
        </div>

        <div className="flex-1 flex flex-col gap-[4px]">
          <div className="flex flex-col gap-[4px]">
            <p className="font-Inter font-semibold text-[20px] leading-[1.2102272033691406em] text-left text-[#111827]">
              Alex Parker
            </p>
            <p className="font-Inter font-normal text-[14px] leading-[1.2102272851126534em] text-left text-[#6B7280]">
              Senior Product Designer
            </p>

            <div className="flex flex-row items-center gap-[5px] bg-[#EEF2FF] rounded-[20px] px-[10px] py-[4px] self-start">
              <div className="w-[6px] h-[6px] bg-[#6366F1] rounded-[0px]" />
              <p className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-left text-[#4338CA]">
                Hexagon Design Co.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full h-[1px] bg-[#E5E7EB" />

      <section className="w-full rounded-[12px] bg-[#F5F7FF] flex flex-row justify-between items-center px-[12px] py-[16px]">
        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-center text-[#111827]">
            248
          </p>
          <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-center text-[#9CA3AF]">
            Projects
          </p>
        </div>

        <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-center text-[#111827]">
            14.2K
          </p>
          <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-center text-[#9CA3AF]">
            Followers
          </p>
        </div>

        <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-center text-[#111827]">
            891
          </p>
          <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-center text-[#9CA3AF]">
            Following
          </p>
        </div>
      </section>

      <section>
        <p className="font-Inter font-normal text-[14px] leading-[1.5714285714285714em] text-left text-[#374151]">
          Passionate about crafting intuitive digital experiences. Specializing in design systems, user research, and prototyping for enterprise products.
        </p>
      </section>

      <section className="flex flex-row items-center gap-[8px]">
        <div className="rounded-[20px] bg-[#EEF2FF] flex flex-row items-center">
          <p className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-left text-[#4338CA] px-[12px] py-[5px]">
            UX Design
          </p>
        </div>
        <div className="rounded-[20px] bg-[#F0FDF4] flex flex-row items-center">
          <p className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-left text-[#15803D] px-[12px] py-[5px]">
            Prototyping
          </p>
        </div>
        <div className="rounded-[20px] bg-[#FFF7ED] flex flex-row items-center">
          <p className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-left text-[#C2410C] px-[12px] py-[5px]">
            Figma Expert
          </p>
        </div>
      </section>

      <footer className="w-full flex flex-row justify-between items-center gap-[12px]">
        <button className="flex flex-row justify-center items-center flex-1 rounded-[10px] bg-[#4F46E5] py-[10px]">
          <span className="font-Inter font-semibold text-[15px] leading-[1.2102272033691406em] text-center text-[#FFFFFF]">
            Follow
          </span>
        </button>

        <button className="flex flex-row justify-center items-center flex-1 rounded-[10px] bg-[#FFFFFF] border-[1.5px] border-[#D1D5DB] py-[10px]">
          <span className="font-Inter font-semibold text-[15px] leading-[1.2102272033691406em] text-center text-[#374151]">
            Message
          </span>
        </button>
      </footer>
    </div>
  );
}