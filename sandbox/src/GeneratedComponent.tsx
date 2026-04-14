import React from 'react';

const ProfileCard = () => {
  return (
    <div className="w-[380px] bg-[#FFFFFF] rounded-[20px] flex flex-col gap-[20px] p-[28px_24px]">
      {/* Header Row */}
      <div className="flex items-center gap-[16px] w-full">
        {/* Avatar */}
        <div className="w-[72px] h-[72px] bg-[#6366F1] rounded-[36px] flex items-center justify-center">
          <span className="text-[#FFFFFF] font-semibold text-[24px] leading-[1.2102272510528564em]">AP</span>
        </div>
        
        {/* Name Section */}
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[#111827] font-semibold text-[20px] leading-[1.2102272033691406em]">Alex Parker</h2>
          <p className="text-[#6B7280] font-normal text-[14px] leading-[1.2102272851126534em]">Senior Product Designer</p>
          
          {/* Company */}
          <div className="flex items-center gap-[5px] bg-[#EEF2FF] rounded-[20px] px-[10px] py-[4px]">
            <div className="w-[6px] h-[6px] bg-[#6366F1] rounded-full"></div>
            <span className="text-[#4338CA] font-medium text-[12px] leading-[1.2102272510528564em]">Hexagon Design Co.</span>
          </div>
        </div>
      </div>
      
      {/* Divider */}
      <div className="h-[1px] bg-[#E5E7EB] w-full"></div>
      
      {/* Stats */}
      <div className="flex justify-between items-center bg-[#F5F7FF] rounded-[12px] px-[12px] py-[16px]">
        {/* Stat Projects */}
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#111827] font-bold text-[20px] leading-[1.2102272033691406em]">248</span>
          <span className="text-[#9CA3AF] font-normal text-[12px] leading-[1.2102272510528564em]">Projects</span>
        </div>
        
        {/* Separator */}
        <div className="w-[1px] h-[36px] bg-[#E5E7EB]"></div>
        
        {/* Stat Followers */}
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#111827] font-bold text-[20px] leading-[1.2102272033691406em]">14.2K</span>
          <span className="text-[#9CA3AF] font-normal text-[12px] leading-[1.2102272510528564em]">Followers</span>
        </div>
        
        {/* Separator */}
        <div className="w-[1px] h-[36px] bg-[#E5E7EB]"></div>
        
        {/* Stat Following */}
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#111827] font-bold text-[20px] leading-[1.2102272033691406em]">891</span>
          <span className="text-[#9CA3AF] font-normal text-[12px] leading-[1.2102272510528564em]">Following</span>
        </div>
      </div>
      
      {/* Bio */}
      <p className="text-[#374151] font-normal text-[14px] leading-[1.5714285714285714em]">
        Passionate about crafting intuitive digital experiences. Specializing in design systems, user research, and prototyping for enterprise products.
      </p>
      
      {/* Tags */}
      <div className="flex items-center gap-[8px]">
        <div className="bg-[#EEF2FF] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#4338CA] font-medium text-[12px] leading-[1.2102272510528564em]">UX Design</span>
        </div>
        <div className="bg-[#F0FDF4] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#15803D] font-medium text-[12px] leading-[1.2102272510528564em]">Prototyping</span>
        </div>
        <div className="bg-[#FFF7ED] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#C2410C] font-medium text-[12px] leading-[1.2102272510528564em]">Figma Expert</span>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex justify-between items-center gap-[12px] w-full">
        <div className="bg-[#4F46E5] rounded-[10px] flex items-center justify-center px-0 py-[13px] w-full">
          <span className="text-[#FFFFFF] font-semibold text-[15px] leading-[1.2102272033691406em]">Follow</span>
        </div>
        <div className="bg-[#FFFFFF] border border-[#D1D5DB] rounded-[10px] flex items-center justify-center px-0 py-[13px] w-full">
          <span className="text-[#374151] font-semibold text-[15px] leading-[1.2102272033691406em]">Message</span>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;