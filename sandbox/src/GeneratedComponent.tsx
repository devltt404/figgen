import React from "react";

export default function FiggenTestDesign() {
  return (
    <div className="flex flex-col w-[380px] gap-[20px] p-[28px_24px]">
      <div className="flex flex-col gap-[20px]">
        <div className="flex flex-row items-center self-stretch gap-[16px]">
          <div className="w-[72px] h-[72px] rounded-[36px] bg-[#6366F1]">
            <div className="w-[33px] h-[29px] relative left-[20px] top-[22px] flex items-start justify-start">
              <span className="font-Inter font-semibold text-[24px] leading-[1.2102272510528564em] text-[#FFFFFF]">
                AP
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-[4px] flex-1">
            <div className="flex flex-col gap-[4px]">
              <p className="font-Inter font-semibold text-[20px] leading-[1.2102272033691406em] text-[#111827]">
                Alex Parker
              </p>
              <p className="font-Inter font-normal text-[14px] leading-[1.2102272851126534em] text-[#6B7280]">
                Senior Product Designer
              </p>
            </div>

            <div className="flex flex-row items-center gap-[5px] px-[10px] py-[4px] rounded-[20px] bg-[#EEF2FF] w-fit">
              <span className="w-[6px] h-[6px] rounded-full bg-[#6366F1]" />
              <span className="font-Inter font-normal text-[14px] leading-[1.2102272851126534em] text-[#374151]">
                Hexagon Design Co.
              </span>
            </div>
          </div>
        </div>

        <div className="w-full h-[1px] bg-[#E5E7EB]" />

        <div className="flex flex-row justify-between items-center self-stretch px-[12px] py-[16px] bg-[#F5F7FF] rounded-[12px]">
          <div className="flex flex-col items-center gap-[2px]">
            <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-[#111827]">
              248
            </p>
            <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-[#9CA3AF]">
              Projects
            </p>
          </div>

          <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

          <div className="flex flex-col items-center gap-[2px]">
            <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-[#111827]">
              14.2K
            </p>
            <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-[#9CA3AF]">
              Followers
            </p>
          </div>

          <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

          <div className="flex flex-col items-center gap-[2px]">
            <p className="font-Inter font-bold text-[20px] leading-[1.2102272033691406em] text-[#111827]">
              891
            </p>
            <p className="font-Inter font-normal text-[12px] leading-[1.2102272510528564em] text-[#9CA3AF]">
              Following
            </p>
          </div>
        </div>

        <p className="font-Inter font-normal text-[14px] leading-[1.5714285714285714em] text-[#374151] max-w-[320px]">
          Passionate about crafting intuitive digital experiences. Specializing in design systems, user
          research, and prototyping for enterprise products.
        </p>

        <div className="flex flex-row items-center gap-[8px]">
          <div className="flex flex-row items-center gap-[8px] px-[12px] py-[5px] rounded-[20px] bg-[#EEF2FF]">
            <span className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-[#4338CA]">
              UX Design
            </span>
          </div>

          <div className="flex flex-row items-center gap-[8px] px-[12px] py-[5px] rounded-[20px] bg-[#F0FDF4]">
            <span className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-[#15803D]">
              Prototyping
            </span>
          </div>

          <div className="flex flex-row items-center gap-[8px] px-[12px] py-[5px] rounded-[20px] bg-[#FFF7ED]">
            <span className="font-Inter font-medium text-[12px] leading-[1.2102272510528564em] text-[#C2410C]">
              Figma Expert
            </span>
          </div>
        </div>

        <div className="flex flex-row justify-between items-center self-stretch">
          <button className="flex flex-row justify-center items-center w-full bg-[#4F46E5] rounded-[10px] px-[0px] py-[11px]">
            <span className="font-Inter font-semibold text-[15px] leading-[1.2102272033691406em] text-[#FFFFFF]">
              Follow
            </span>
          </button>

          <button className="flex flex-row justify-center items-center w-full bg-[#FFFFFF] rounded-[10px] px-[0px] py-[13px] border border-[#D1D5DB]">
            <span className="font-Inter font-semibold text-[15px] leading-[1.2102272033691406em] text-[#374151]">
              Message
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}