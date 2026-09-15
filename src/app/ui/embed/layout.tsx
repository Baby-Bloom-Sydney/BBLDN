export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: '[class*="z-[9998]"], [class*="z-[9999]"] { display: none !important; } body { overflow: auto !important; }',
        }}
      />
      <div className="p-4">{children}</div>
    </>
  );
}
