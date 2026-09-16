// The two font families (05 §8.1: at most two, `font-display: swap` is next/font's default). Kept beside the
// root layout so the layout itself stays a thin route file (01 §2.5).
import localFont from "next/font/local";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const fontClassNames = `${geistSans.variable} ${geistMono.variable}`;
