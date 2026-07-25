import './globals.css';

export const metadata = {
  title:       'PI App — Karnataka SCRB Crime Intelligence',
  description: 'Conversational Crime Intelligence Platform for Karnataka State Crime Records Bureau. Secure, role-based access to FIR data and analytics.',
  keywords:    'crime intelligence, Karnataka police, FIR, SCRB, investigation',
  robots:      'noindex, nofollow',   // internal tool — never indexed
};

export const viewport = {
  width:        'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Animated background mesh — sits behind all content */}
        <div className="bg-mesh" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
