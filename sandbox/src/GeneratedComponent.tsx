export function FiggenTestDesign(): JSX.Element {
  return (
    <div>
      <header className="bg-[#2e6bde] text-[#171a21]">
        <nav className="max-w-4xl mx-auto flex items-center justify-between p-[12px]">
          <div className="flex items-center gap-3">
            <div aria-label="logo" className="w-[40px] h-[24px] bg-white rounded-full" />
            <span className="font-[Inter] font-semibold text-[18px]">Figgen Test</span>
          </div>
          <ul className="flex items-center gap-[18px] text-[14px] font-[Inter]">
            <li><a href="#" className="hover:underline">Home</a></li>
            <li><a href="#" className="hover:underline">Projects</a></li>
            <li><a href="#" className="hover:underline">Design</a></li>
          </ul>
        </nav>
      </header>

      <main className="text-[#171a21] font-[Inter]">
        <section className="p-[40px] gap-[24px] flex flex-col" aria-label="Intro">
          <h1 className="text-[28px] font-semibold">Figgen Test Design</h1>
          <p className="text-[16px] max-w-prose">
            This section demonstrates a compact mock of the design using the specified tokens:
            blue background, dark text, 28px heading, 400px wide cards with soft shadows and
            pill actions.
          </p>

          <div className="flex flex-col md:flex-row gap-[24px]">
            <article className="w-[400px] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] overflow-hidden">
              <div aria-label="image-1" className="w-full h-[180px] bg-gray-200" />
              <div className="p-[16px] flex flex-col gap-[8px]">
                <h3 className="text-[#171a21] text-[18px] font-semibold">Card Title One</h3>
                <p className="text-[14px]">Description for the first card showcasing design tokens.</p>
                <button className="mt-[6px] rounded-[99px] bg-[#2e6bde] text-white px-[12px] py-[6px] w-fit">
                  Action
                </button>
              </div>
            </article>

            <article className="w-[400px] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] overflow-hidden">
              <div aria-label="image-2" className="w-full h-[180px] bg-gray-200" />
              <div className="p-[16px] flex flex-col gap-[8px]">
                <h3 className="text-[#171a21] text-[18px] font-semibold">Card Title Two</h3>
                <p className="text-[14px]">Additional context for the second card.</p>
                <div className="flex items-center gap-2 mt-[4px]">
                  <div aria-label="icon" className="w-6 h-6 bg-gray-400 rounded" />
                  <span className="text-[14px] text-[#171a21]">Icon label</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

export default FiggenTestDesign;
