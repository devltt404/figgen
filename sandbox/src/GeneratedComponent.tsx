import React from 'react';

const ProfileCard: React.FC = () => {
  return (
    <div className="flex flex-col bg-[#ffffff] rounded-[20px] p-[28px] gap-[20px] w-[380px]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>

      {/* Header Row */}
      <div className="flex items-center gap-[16px]">
        {/* Avatar */}
        <div className="flex items-center justify-center w-[72px] h-[72px] bg-[#6367f1] rounded-full">
          <span className="font-['Inter'] font-semibold text-[24px] leading-[29px] text-[#ffffff]">AP</span>
        </div>

        {/* Name Section */}
        <div className="flex flex-col gap-[4px]">
          <p className="font-['Inter'] font-semibold text-[20px] leading-[24px] text-[#111827]">Alex Parker</p>
          <p className="font-['Inter'] font-normal text-[14px] leading-[17px] text-[#6B7280]">Senior Product Designer</p>
          <div className="flex items-center gap-[5px] bg-[#edf0ff] px-[10px] py-[4px] rounded-[20px]">
            <div className="w-[6px] h-[6px] bg-[#6367f1] rounded-full"></div>
            <p className="font-['Inter'] font-medium text-[12px] leading-[15px] text-[#434fcf]">Hexagon Design Co.</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-[#e5e8eb]"></div>

      {/* Stats */}
      <div className="flex items-center justify-between bg-[#f5f7ff] rounded-[12px] px-[12px] py-[16px]">
        {/* Projects */}
        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-['Inter'] font-bold text-[20px] leading-[24px] text-[#111827]">248</p>
          <p className="font-['Inter'] font-normal text-[12px] leading-[15px] text-[#9CA3AF]">Projects</p>
        </div>
        {/* Divider */}
        <div className="w-[1px] h-[36px] bg-[#e5e8eb]"></div>
        {/* Followers */}
        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-['Inter'] font-bold text-[20px] leading-[24px] text-[#111827]">14.2K</p>
          <p className="font-['Inter'] font-normal text-[12px] leading-[15px] text-[#9CA3AF]">Followers</p>
        </div>
        {/* Divider */}
        <div className="w-[1px] h-[36px] bg-[#e5e8eb]"></div>
        {/* Following */}
        <div className="flex flex-col items-center gap-[2px]">
          <p className="font-['Inter'] font-bold text-[20px] leading-[24px] text-[#111827]">891</p>
          <p className="font-['Inter'] font-normal text-[12px] leading-[15px] text-[#9CA3AF]">Following</p>
        </div>
      </div>

      {/* Bio */}
      <p className="font-['Inter'] font-normal text-[14px] leading-[22px] text-[#374151]">
        Passionate about crafting intuitive digital experiences. Specializing in design systems, user research, and
        prototyping for enterprise products.
      </p>

      {/* Tags */}
      <div className="flex gap-[8px]">
        {/* UX Design */}
        <div className="flex items-center bg-[#edf0ff] px-[12px] py-[5px] rounded-full">
          <p className="font-['Inter'] font-medium text-[12px] leading-[15px] text-[#434fcf]">UX Design</p>
        </div>
        {/* Prototyping */}
        <div className="flex items-center bg-[#f0fef4] px-[12px] py-[5px] rounded-full">
          <p className="font-['Inter'] font-medium text-[12px] leading-[15px] text-[#14d83e]">Prototyping</p>
        </div>
        {/* Figma Expert */}
        <div className="flex items-center bg-[#fffaed] px-[12px] py-[5px] rounded-full">
          <p className="font-['Inter'] font-medium text-[12px] leading-[15px] text-[#c2400c]">Figma Expert</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {/* Follow Button */}
        <div className="flex items-center justify-center bg-[#4f46e5] w-[166px] h-[44px] rounded-[10px]">
          <span className="font-['Inter'] font-semibold text-[15px] leading-[18px] text-[#ffffff]">Follow</span>
        </div>
        {/* Message Button */}
        <div className="flex items-center justify-center border border-[#d2d6dc] bg-[#ffffff] w-[166px] h-[44px] rounded-[10px]">
          <span className="font-['Inter'] font-semibold text-[15px] leading-[18px] text-[#374151]">Message</span>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;