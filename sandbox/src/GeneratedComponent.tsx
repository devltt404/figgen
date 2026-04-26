import React from "react";

export default function FigmaTestDesignProfileCard() {
  return (
    <div className="w-[380px] flex flex-col gap-[20px] px-[24px] py-[28px]">
      <div className="flex flex-row items-center gap-[16px]">
        <div className="w-[72px] h-[72px] rounded-[36px] bg-[#6366F1] flex items-center justify-center">
          <span className="flex items-center justify-center w-full h-full text-[24px] leading-[1.2102272510528564em] font-semibold font-['Inter'] text-[#FFFFFF]">
            AP
          </span>
        </div>

        <div className="flex flex-col gap-[4px] w-full pt-[2px]">
          <div className="flex flex-col gap-[4px]">
            <div className="text-[22px] leading-[1.2102272033691406em] font-bold font-['Inter'] text-[#111827]">
              Alex Parker
            </div>
            <div className="text-[20px] leading-[1.2102272033691406em] font-semibold font-['Inter'] text-[#6B7280]">
              Senior Product Designer
            </div>
          </div>

          <div className="flex flex-row items-center gap-[5px] px-[10px] py-[4px] rounded-[20px] bg-[#EEF2FF] w-fit">
            <div className="w-[6px] h-[6px] rounded-full bg-[#6366F1]" />
            <div className="text-[14px] leading-[1.2102272851126534em] font-medium font-['Inter'] text-[#4338CA]">
              Hexagon Design Co.
            </div>
          </div>
        </div>
      </div>

      <div className="w-full h-[1px] bg-[#E5E7EB]" />

      <div className="flex flex-row justify-between items-center self-stretch rounded-[12px] bg-[#F5F7FF] px-[12px] py-[16px]">
        <div className="flex flex-col items-center gap-[2px]">
          <div className="text-[20px] leading-[1.2102272033691406em] font-bold font-['Inter'] text-[#111827]">
            248
          </div>
          <div className="text-[12px] leading-[1.2102272510528564em] font-normal font-['Inter'] text-[#9CA3AF]">
            Projects
          </div>
        </div>

        <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

        <div className="flex flex-col items-center gap-[2px]">
          <div className="text-[20px] leading-[1.2102272033691406em] font-bold font-['Inter'] text-[#111827]">
            14.2K
          </div>
          <div className="text-[12px] leading-[1.2102272510528564em] font-normal font-['Inter'] text-[#9CA3AF]">
            Followers
          </div>
        </div>

        <div className="w-[1px] h-[36px] bg-[#E5E7EB]" />

        <div className="flex flex-col items-center gap-[2px]">
          <div className="text-[20px] leading-[1.2102272033691406em] font-bold font-['Inter'] text-[#111827]">
            891
          </div>
          <div className="text-[12px] leading-[1.2102272510528564em] font-normal font-['Inter'] text-[#9CA3AF]">
            Following
          </div>
        </div>
      </div>

      <div className="text-[14px] leading-[1.5714285714285714em] font-normal font-['Inter'] text-[#374151]">
        Passionate about crafting intuitive digital experiences. Specializing in design systems, user research, and
        prototyping for enterprise products.
      </div>

      <div className="flex flex-row items-center gap-[8px]">
        <div className="flex flex-row items-center px-[12px] py-[5px] rounded-[20px] bg-[#EEF2FF]">
          <div className="text-[12px] leading-[1.2102272510528564em] font-medium font-['Inter'] text-[#4338CA]">
            UX Design
          </div>
        </div>

        <div className="flex flex-row items-center px-[12px] py-[5px] rounded-[20px] bg-[#F0FDF4]">
          <div className="text-[12px] leading-[1.2102272510528564em] font-medium font-['Inter'] text-[#15803D]">
            Prototyping
          </div>
        </div>

        <div className="flex flex-row items-center px-[12px] py-[5px] rounded-[20px] bg-[#FFF7ED]">
          <div className="text-[12px] leading-[1.2102272510528564em] font-medium font-['Inter'] text-[#C2410C]">
            Figma Expert
          </div>
        </div>
      </div>

      <div className="flex flex-row justify-between items-center self-stretch">
        <div className="flex flex-row justify-center items-center w-[150px] bg-[#4F46E5] rounded-[10px] py-[13px]">
          <div className="text-[15px] leading-[1.2102272033691406em] font-semibold font-['Inter'] text-[#FFFFFF]">
            Follow
          </div>
        </div>

        <div className="flex flex-row justify-center items-center w-[150px] bg-[#FFFFFF] rounded-[10px] py-[13px] border border-[#D1D5DB]">
          <div className="text-[15px] leading-[1.2102272033691406em] font-semibold font-['Inter'] text-[#374151]">
            Message
          </div>
        </div>
      </div>
    </div>
  );
}