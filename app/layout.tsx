import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WhisperBox — E2EE Messaging',
  description: 'End-to-end encrypted messaging app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body 
      className={inter.className}>{children}
      <Toaster
          theme="dark"
          position="top-center"
          richColors
          closeButton
        />
      </body>
    </html>
  );
}