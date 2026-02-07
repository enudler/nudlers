import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%236366f1'/%3E%3Cstop offset='60%25' stop-color='%23a855f7'/%3E%3Cstop offset='100%25' stop-color='%23ec4899'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='7' fill='%2316161f'/%3E%3Crect x='6' y='18' width='5' height='8' rx='1.5' fill='url(%23g)'/%3E%3Crect x='13.5' y='13' width='5' height='13' rx='1.5' fill='url(%23g)'/%3E%3Crect x='21' y='7' width='5' height='19' rx='1.5' fill='url(%23g)'/%3E%3C/svg%3E" />
        <meta name="description" content="Nudlers" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
} 