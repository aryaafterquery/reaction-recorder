import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watch & React",
  description: "Watch a video while we record your reaction",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
