import React from "react";

const ProfileCard: React.FC = () => {
  return (
    <div className="bg-white rounded-[20px] p-[28px] w-[380px] flex flex-col gap-[20px]">
      <div className="flex items-center gap-[16px]">
        <div className="bg-[#6366F0] rounded-full w-[72px] h-[72px] flex items-center justify-center">
          <span className="text-white text-[24px] font-[600]">AP</span>
        </div>
        <div className="flex flex-col gap-[4px]">
          <span className="text-[#11151F] text-[20px] font-[600]">
            Alex Parker
          </span>
          <span className="text-[#6B7180] text-[14px]">
            Senior Product Designer
          </span>
          <div className="flex items-center gap-[5px] bg-[#E6F2FF] rounded-[20px] px-[10px] py-[4px]">
            <div className="bg-[#6366F0] rounded-full w-[6px] h-[6px]" />
            <span className="text-[#434FBF] text-[12px] font-[500]">
              Hexagon Design Co.
            </span>
          </div>
        </div>
      </div>
      <hr className="border-t bg-[#E5E8EB]" />
      <div className="flex items-center justify-between bg-[#F5F7FF] rounded-[12px] px-[12px] py-[16px]">
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#11151F] text-[20px] font-[700]">248</span>
          <span className="text-[#9CA2AF] text-[12px]">Projects</span>
        </div>
        <div className="w-[1px] h-[36px] bg-[#E5E8EB]" />
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#11151F] text-[20px] font-[700]">14.2K</span>
          <span className="text-[#9CA2AF] text-[12px]">Followers</span>
        </div>
        <div className="w-[1px] h-[36px] bg-[#E5E8EB]" />
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[#11151F] text-[20px] font-[700]">891</span>
          <span className="text-[#9CA2AF] text-[12px]">Following</span>
        </div>
      </div>
      <p className="text-[#374059] text-[14px] leading-[22px] mt-[16px]">
        Passionate about crafting intuitive digital experiences. Specializing
        in design systems, user research, and prototyping for enterprise
        products.
      </p>
      <div className="flex items-center gap-[8px] mt-[12px]">
        <div className="flex items-center bg-[#E6F2FF] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#434FBF] text-[12px] font-[500]">UX Design</span>
        </div>
        <div className="flex items-center bg-[#F0FDF3] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#14CD3D] text-[12px] font-[500]">
            Prototyping
          </span>
        </div>
        <div className="flex items-center bg-[#FFF6EC] rounded-[20px] px-[12px] py-[5px]">
          <span className="text-[#C2410C] text-[12px] font-[500]">
            Figma Expert
          </span>
        </div>
      </div>
      <div className="flex justify-between gap-[12px] mt-[16px]">
        <div className="flex items-center bg-[#4F2FE9] rounded-[10px] w-[166px] h-[44px] justify-center">
          <span className="text-white text-[15px] font-[600]">Follow</span>
        </div>
        <div className="flex items-center bg-white border-[1.5px] border-[#D1D5DB] rounded-[10px] w-[166px] h-[44px] justify-center">
          <span className="text-[#374059] text-[15px] font-[600]">Message</span>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;