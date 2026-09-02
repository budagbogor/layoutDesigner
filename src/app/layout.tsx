import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mobeng Workshop CAD Designer',
  description: 'Desktop-first parametric CAD workshop layout designer',
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
